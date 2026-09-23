const express = require('express');
const router = express.Router();
const { query, run } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Get remarks for a student
router.get('/student/:student_id', authenticateToken, async (req, res) => {
    try {
        const { student_id } = req.params;

        // If student role, ensure they only view their own
        if (req.user.role === 'student' && req.user.student_id != student_id) {
            return res.status(403).json({ error: 'Access denied to other student records' });
        }

        const remarksList = await query(`
            SELECT r.*, u.full_name as teacher_name 
            FROM remarks r 
            JOIN users u ON r.teacher_id = u.id 
            WHERE r.student_id = ? 
            ORDER BY r.date DESC, r.id DESC
        `, [student_id]);

        res.json({ remarks: remarksList });
    } catch (err) {
        console.error('Error fetching remarks:', err);
        res.status(500).json({ error: 'Server error fetching remarks' });
    }
});

// Add dated remark for a student
router.post('/add', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const { student_id, category, remark_text, date } = req.body;

        if (!student_id || !remark_text || !remark_text.trim()) {
            return res.status(400).json({ error: 'Student ID and remark text are required' });
        }

        const remarkDate = date || new Date().toISOString().split('T')[0];

        await run(`
            INSERT INTO remarks (student_id, date, category, remark_text, teacher_id)
            VALUES (?, ?, ?, ?, ?)
        `, [student_id, remarkDate, category || 'General', remark_text.trim(), req.user.id]);

        res.status(201).json({ message: 'Teacher remark saved successfully' });
    } catch (err) {
        console.error('Error saving remark:', err);
        res.status(500).json({ error: 'Server error saving remark' });
    }
});

module.exports = router;
