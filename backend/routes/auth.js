const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, query } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// 1. Teacher / Admin Login
router.post('/login/teacher', async (req, res) => {
    try {
        const { username, password, section_code } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await get(`SELECT u.*, s.code as section_code, s.name as section_name 
                               FROM users u 
                               LEFT JOIN school_sections s ON u.default_section_id = s.id 
                               WHERE u.username = ? AND u.role IN ('admin', 'teacher')`, [username]);

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                is_incharge: user.is_incharge,
                section_code: section_code || user.section_code
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            message: 'Teacher login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                is_incharge: user.is_incharge,
                section_code: section_code || user.section_code
            }
        });
    } catch (err) {
        console.error('Teacher login error:', err);
        return res.status(500).json({ error: 'Server error during login' });
    }
});

// 2. Student Login (Roll Number + Password)
router.post('/login/student', async (req, res) => {
    try {
        const { roll_number, password } = req.body;

        if (!roll_number || !password) {
            return res.status(400).json({ error: 'Roll number and password are required' });
        }

        const student = await get(`
            SELECT s.*, c.name as class_name, u.password_hash, u.id as user_id 
            FROM students s 
            JOIN users u ON s.user_id = u.id 
            JOIN classes c ON s.class_id = c.id 
            WHERE s.roll_number = ? AND s.status = 'active'`, [roll_number.trim().toUpperCase()]);

        if (!student) {
            return res.status(401).json({ error: 'Invalid roll number or password' });
        }

        const isMatch = await bcrypt.compare(password, student.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid roll number or password' });
        }

        const token = jwt.sign(
            {
                id: student.user_id,
                student_id: student.id,
                roll_number: student.roll_number,
                full_name: student.name,
                class_id: student.class_id,
                class_name: student.class_name,
                role: 'student'
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            message: 'Student login successful',
            token,
            user: {
                id: student.user_id,
                student_id: student.id,
                roll_number: student.roll_number,
                full_name: student.name,
                class_id: student.class_id,
                class_name: student.class_name,
                parent_phone: student.parent_phone,
                role: 'student'
            }
        });
    } catch (err) {
        console.error('Student login error:', err);
        return res.status(500).json({ error: 'Server error during student login' });
    }
});

// Get logged in user details
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
