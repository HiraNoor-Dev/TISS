const express = require('express');
const router = express.Router();
const { query, run } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Get attendance for a class on a specific date
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { class_id, date } = req.query;

        if (!class_id || !date) {
            return res.status(400).json({ error: 'Class ID and date are required' });
        }

        const roster = await query(`
            SELECT s.id as student_id, s.roll_number, s.name, a.status as attendance_status, a.id as attendance_id
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
            WHERE s.class_id = ? AND s.status = 'active'
            ORDER BY s.roll_number ASC
        `, [date, class_id]);

        res.json({ date, class_id, roster });
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).json({ error: 'Server error fetching attendance' });
    }
});

// Save bulk attendance for class roster
router.post('/save', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const { class_id, date, records } = req.body; // records: [{ student_id, status: 'present' | 'absent' }]

        if (!class_id || !date || !Array.isArray(records)) {
            return res.status(400).json({ error: 'Class ID, date, and records array are required' });
        }

        for (const r of records) {
            if (r.status === 'present' || r.status === 'absent') {
                await run(`
                    INSERT INTO attendance (student_id, class_id, date, status, recorded_by_teacher_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(student_id, date) DO UPDATE SET
                    status = excluded.status,
                    recorded_by_teacher_id = excluded.recorded_by_teacher_id
                `, [r.student_id, class_id, date, r.status, req.user.id]);
            }
        }

        res.json({ message: 'Attendance records saved successfully' });
    } catch (err) {
        console.error('Error saving attendance:', err);
        res.status(500).json({ error: 'Server error saving attendance' });
    }
});

module.exports = router;
