const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, get, run } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireInchargeOrAdmin } = require('../middleware/rbac');

// Get students belonging to a class
router.get('/class/:class_id', authenticateToken, async (req, res) => {
    try {
        const { class_id } = req.params;
        const students = await query(`
            SELECT s.id, s.roll_number, s.name, s.parent_phone, s.status, s.class_id, c.name as class_name 
            FROM students s 
            JOIN classes c ON s.class_id = c.id 
            WHERE s.class_id = ? AND s.status = 'active'
            ORDER BY s.roll_number ASC
        `, [class_id]);

        res.json({ students });
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Server error fetching students' });
    }
});

// Get all students across school (Admin / Incharge view)
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const students = await query(`
            SELECT s.id, s.roll_number, s.name, s.parent_phone, s.status, s.class_id, c.name as class_name 
            FROM students s 
            JOIN classes c ON s.class_id = c.id 
            ORDER BY c.id ASC, s.roll_number ASC
        `);
        res.json({ students });
    } catch (err) {
        console.error('Error fetching all students:', err);
        res.status(500).json({ error: 'Server error fetching students' });
    }
});

// Add Student (Admin or Class Incharge ONLY)
router.post('/add', authenticateToken, requireInchargeOrAdmin, async (req, res) => {
    try {
        const { roll_number, name, class_id, parent_phone, password } = req.body;

        if (!roll_number || !name || !class_id || !parent_phone) {
            return res.status(400).json({ error: 'Roll number, name, class, and parent phone are required' });
        }

        const formattedRoll = roll_number.trim().toUpperCase();

        // Check roll number uniqueness
        const existingRoll = await get(`SELECT id FROM students WHERE roll_number = ?`, [formattedRoll]);
        if (existingRoll) {
            return res.status(400).json({ error: `Roll number '${formattedRoll}' already exists.` });
        }

        // Create student portal user account
        const studentPassword = password || 'password123';
        const passwordHash = await bcrypt.hash(studentPassword, 10);

        // Check user username uniqueness
        const existingUser = await get(`SELECT id FROM users WHERE username = ?`, [formattedRoll]);
        let userId;
        if (!existingUser) {
            const userRes = await run(
                `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
                [formattedRoll, passwordHash, name.trim(), 'student']
            );
            userId = userRes.lastID;
        } else {
            userId = existingUser.id;
        }

        // Insert Student
        const studentRes = await run(
            `INSERT INTO students (roll_number, name, class_id, parent_phone, user_id) VALUES (?, ?, ?, ?, ?)`,
            [formattedRoll, name.trim(), class_id, parent_phone.trim(), userId]
        );

        res.status(201).json({
            message: 'Student created successfully',
            student: {
                id: studentRes.lastID,
                roll_number: formattedRoll,
                name: name.trim(),
                class_id,
                parent_phone: parent_phone.trim()
            }
        });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Server error adding student' });
    }
});

// Edit Student (Admin or Class Incharge ONLY)
router.put('/edit/:id', authenticateToken, requireInchargeOrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, class_id, parent_phone, roll_number } = req.body;

        const student = await get(`SELECT * FROM students WHERE id = ?`, [id]);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (roll_number && roll_number.trim().toUpperCase() !== student.roll_number) {
            const rollCheck = await get(`SELECT id FROM students WHERE roll_number = ? AND id != ?`, [roll_number.trim().toUpperCase(), id]);
            if (rollCheck) {
                return res.status(400).json({ error: 'Roll number already in use by another student' });
            }
        }

        const newRoll = roll_number ? roll_number.trim().toUpperCase() : student.roll_number;
        const newName = name ? name.trim() : student.name;
        const newClass = class_id || student.class_id;
        const newPhone = parent_phone ? parent_phone.trim() : student.parent_phone;

        await run(
            `UPDATE students SET roll_number = ?, name = ?, class_id = ?, parent_phone = ? WHERE id = ?`,
            [newRoll, newName, newClass, newPhone, id]
        );

        // Update corresponding user record
        await run(`UPDATE users SET username = ?, full_name = ? WHERE id = ?`, [newRoll, newName, student.user_id]);

        res.json({ message: 'Student information updated successfully' });
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: 'Server error updating student' });
    }
});

// Deactivate Student (Admin or Class Incharge ONLY)
router.put('/deactivate/:id', authenticateToken, requireInchargeOrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await run(`UPDATE students SET status = 'inactive' WHERE id = ?`, [id]);
        res.json({ message: 'Student deactivated successfully' });
    } catch (err) {
        console.error('Error deactivating student:', err);
        res.status(500).json({ error: 'Server error deactivating student' });
    }
});

module.exports = router;
