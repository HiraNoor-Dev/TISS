const express = require('express');
const router = express.Router();
const { query, get, run } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Get tests for a class and subject
router.get('/tests', authenticateToken, async (req, res) => {
    try {
        const { class_id, subject_name } = req.query;
        let sql = `
            SELECT t.*, u.full_name as teacher_name 
            FROM tests t 
            JOIN users u ON t.created_by_teacher_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (class_id) {
            sql += ` AND t.class_id = ?`;
            params.push(class_id);
        }
        if (subject_name) {
            sql += ` AND t.subject_name = ?`;
            params.push(subject_name);
        }

        sql += ` ORDER BY t.test_date DESC, t.id DESC`;

        const tests = await query(sql, params);
        res.json({ tests });
    } catch (err) {
        console.error('Error fetching tests:', err);
        res.status(500).json({ error: 'Server error fetching tests' });
    }
});

// Create new test
router.post('/tests', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const { title, subject_name, class_id, total_marks, test_date } = req.body;

        if (!title || !subject_name || !class_id || !total_marks || !test_date) {
            return res.status(400).json({ error: 'Title, subject, class, total marks, and date are required' });
        }

        const resTest = await run(
            `INSERT INTO tests (title, subject_name, class_id, total_marks, test_date, created_by_teacher_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [title.trim(), subject_name.trim(), class_id, parseFloat(total_marks), test_date, req.user.id]
        );

        res.status(201).json({
            message: 'Test created successfully',
            test_id: resTest.lastID
        });
    } catch (err) {
        console.error('Error creating test:', err);
        res.status(500).json({ error: 'Server error creating test' });
    }
});

// Get test results for a test
router.get('/results/:test_id', authenticateToken, async (req, res) => {
    try {
        const { test_id } = req.params;

        const testInfo = await get(`
            SELECT t.*, c.name as class_name 
            FROM tests t 
            JOIN classes c ON t.class_id = c.id 
            WHERE t.id = ?
        `, [test_id]);

        if (!testInfo) {
            return res.status(404).json({ error: 'Test not found' });
        }

        const results = await query(`
            SELECT tr.*, s.roll_number, s.name as student_name 
            FROM students s
            LEFT JOIN test_results tr ON s.id = tr.student_id AND tr.test_id = ?
            WHERE s.class_id = ? AND s.status = 'active'
            ORDER BY s.roll_number ASC
        `, [test_id, testInfo.class_id]);

        res.json({ test: testInfo, results });
    } catch (err) {
        console.error('Error fetching test results:', err);
        res.status(500).json({ error: 'Server error fetching results' });
    }
});

// Save or Update Test Results for multiple students in a class
router.post('/results/save', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
    try {
        const { test_id, results } = req.body; // results: [{ student_id, marks_obtained, remarks }]

        if (!test_id || !Array.isArray(results)) {
            return res.status(400).json({ error: 'Test ID and results array are required' });
        }

        const testInfo = await get(`SELECT total_marks FROM tests WHERE id = ?`, [test_id]);
        if (!testInfo) {
            return res.status(404).json({ error: 'Test not found' });
        }

        for (const r of results) {
            if (r.marks_obtained !== undefined && r.marks_obtained !== null && r.marks_obtained !== '') {
                const marks = parseFloat(r.marks_obtained);
                if (isNaN(marks) || marks < 0 || marks > testInfo.total_marks) {
                    return res.status(400).json({ error: `Marks obtained for student must be between 0 and total marks (${testInfo.total_marks})` });
                }

                await run(`
                    INSERT INTO test_results (test_id, student_id, marks_obtained, remarks)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(test_id, student_id) DO UPDATE SET
                    marks_obtained = excluded.marks_obtained,
                    remarks = excluded.remarks
                `, [test_id, r.student_id, marks, r.remarks || null]);
            }
        }

        res.json({ message: 'Test marks saved successfully' });
    } catch (err) {
        console.error('Error saving test results:', err);
        res.status(500).json({ error: 'Server error saving marks' });
    }
});

module.exports = router;
