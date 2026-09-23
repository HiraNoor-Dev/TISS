const express = require('express');
const router = express.Router();
const { query, run } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Get cleanliness records for class and date
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { class_id, date } = req.query;
        if (!class_id || !date) {
            return res.status(400).json({ error: 'Class ID and date are required' });
        }

        const records = await query(`
            SELECT s.id as student_id, s.roll_number, s.name, c.status, c.notes, c.date, c.id as cleanliness_id
            FROM students s
            LEFT JOIN cleanliness_records c ON s.id = c.student_id AND c.date = ?
            WHERE s.class_id = ? AND s.status = 'active'
            ORDER BY s.roll_number ASC
        `, [date, class_id]);

        res.json({ date, class_id, records });
    } catch (err) {
        console.error('Error fetching cleanliness records:', err);
        res.status(500).json({ error: 'Server error fetching cleanliness records' });
    }
});

// Save cleanliness status for students
router.post('/save', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const { class_id, date, records } = req.body; // records: [{ student_id, status: 'Neat'|'Needs Improvement'|'Poor', notes }]

        if (!class_id || !date || !Array.isArray(records)) {
            return res.status(400).json({ error: 'Class ID, date, and records array are required' });
        }

        const validStatuses = ['Neat', 'Needs Improvement', 'Poor'];

        for (const r of records) {
            if (r.status && validStatuses.includes(r.status)) {
                await run(`
                    INSERT INTO cleanliness_records (student_id, date, status, notes, recorded_by_teacher_id)
                    VALUES (?, ?, ?, ?, ?)
                `, [r.student_id, date, r.status, r.notes || null, req.user.id]);
            }
        }

        res.json({ message: 'Cleanliness records recorded successfully' });
    } catch (err) {
        console.error('Error saving cleanliness records:', err);
        res.status(500).json({ error: 'Server error saving cleanliness' });
    }
});

module.exports = router;
