const express = require('express');
const router = express.Router();
const { query, run, get } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Get all sections and classes
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const sections = await query(`SELECT * FROM school_sections ORDER BY id ASC`);
        const classes = await query(`
            SELECT c.*, s.name as section_name, s.code as section_code 
            FROM classes c 
            JOIN school_sections s ON c.section_id = s.id 
            ORDER BY c.id ASC
        `);
        res.json({ sections, classes });
    } catch (err) {
        console.error('Error fetching classes:', err);
        res.status(500).json({ error: 'Server error fetching classes' });
    }
});

// Get teacher's assigned class-subject combinations
router.get('/my-assignments', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const teacher_id = req.user.id;
        const sql = `
            SELECT ta.id as assignment_id, ta.class_id, ta.subject_name, 
                   c.name as class_name, s.name as section_name, s.code as section_code
            FROM teacher_assignments ta
            JOIN classes c ON ta.class_id = c.id
            JOIN school_sections s ON c.section_id = s.id
            WHERE ta.teacher_id = ?
            ORDER BY c.id ASC, ta.subject_name ASC
        `;
        const assignments = await query(sql, [teacher_id]);
        res.json({ assignments });
    } catch (err) {
        console.error('Error fetching teacher assignments:', err);
        res.status(500).json({ error: 'Server error fetching assignments' });
    }
});

// Add Class assignment for Teacher (Select Class + enter/select any Subject)
router.post('/assign', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const teacher_id = req.user.id;
        const { class_id, subject_name } = req.body;

        if (!class_id || !subject_name || !subject_name.trim()) {
            return res.status(400).json({ error: 'Class and Subject Name are required' });
        }

        const trimmedSubject = subject_name.trim();

        // Check if class exists
        const cls = await get(`SELECT * FROM classes WHERE id = ?`, [class_id]);
        if (!cls) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Insert assignment (IGNORE if duplicate)
        await run(
            `INSERT OR IGNORE INTO teacher_assignments (teacher_id, class_id, subject_name) VALUES (?, ?, ?)`,
            [teacher_id, class_id, trimmedSubject]
        );

        res.json({ message: 'Class and subject assigned successfully' });
    } catch (err) {
        console.error('Error assigning class:', err);
        res.status(500).json({ error: 'Server error assigning class' });
    }
});

module.exports = router;
