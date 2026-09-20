const express = require('express');
const router = express.Router();
const { get, query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get Overall Student Report
router.get('/student/:student_id', authenticateToken, async (req, res) => {
    try {
        const { student_id } = req.params;

        // Security check for student role
        if (req.user.role === 'student' && req.user.student_id != student_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // 1. Fetch Student Details
        const student = await get(`
            SELECT s.id, s.roll_number, s.name, s.parent_phone, s.status, s.class_id, c.name as class_name, sec.name as section_name
            FROM students s
            JOIN classes c ON s.class_id = c.id
            JOIN school_sections sec ON c.section_id = sec.id
            WHERE s.id = ?
        `, [student_id]);

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // 2. Attendance Summary
        const attendanceStats = await get(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days
            FROM attendance
            WHERE student_id = ?
        `, [student_id]);

        const totalDays = attendanceStats.total_days || 0;
        const presentDays = attendanceStats.present_days || 0;
        const absentDays = attendanceStats.absent_days || 0;
        const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '100.0';

        // 3. Test Results
        const testResults = await query(`
            SELECT tr.marks_obtained, tr.remarks as result_remarks, t.title as test_title, t.subject_name, t.total_marks, t.test_date
            FROM test_results tr
            JOIN tests t ON tr.test_id = t.id
            WHERE tr.student_id = ?
            ORDER BY t.test_date DESC
        `, [student_id]);

        // Calculate Overall Academic Percentage
        let totalObtained = 0;
        let totalMax = 0;
        testResults.forEach(r => {
            totalObtained += r.marks_obtained;
            totalMax += r.total_marks;
        });
        const overallPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '0.0';

        // 4. Cleanliness History
        const cleanlinessRecords = await query(`
            SELECT status, notes, date
            FROM cleanliness_records
            WHERE student_id = ?
            ORDER BY date DESC, id DESC
            LIMIT 5
        `, [student_id]);

        const latestCleanliness = cleanlinessRecords.length > 0 ? cleanlinessRecords[0].status : 'Neat';

        // 5. Teacher Remarks
        const remarksList = await query(`
            SELECT r.date, r.category, r.remark_text, u.full_name as teacher_name
            FROM remarks r
            JOIN users u ON r.teacher_id = u.id
            WHERE r.student_id = ?
            ORDER BY r.date DESC, r.id DESC
        `, [student_id]);

        res.json({
            student,
            attendance: {
                total_days: totalDays,
                present_days: presentDays,
                absent_days: absentDays,
                percentage: attendancePercentage
            },
            academic: {
                overall_percentage: overallPercentage,
                total_obtained: totalObtained,
                total_max: totalMax,
                results: testResults
            },
            cleanliness: {
                latest: latestCleanliness,
                history: cleanlinessRecords
            },
            remarks: remarksList
        });
    } catch (err) {
        console.error('Error generating student report:', err);
        res.status(500).json({ error: 'Server error generating student report' });
    }
});

// Generate WhatsApp Share Message & Link
router.get('/whatsapp-link/:student_id', authenticateToken, async (req, res) => {
    try {
        const { student_id } = req.params;

        const student = await get(`
            SELECT s.roll_number, s.name, s.parent_phone, c.name as class_name
            FROM students s
            JOIN classes c ON s.class_id = c.id
            WHERE s.id = ?
        `, [student_id]);

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Attendance stats
        const att = await get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present
            FROM attendance WHERE student_id = ?
        `, [student_id]);

        const attTotal = att.total || 0;
        const attPresent = att.present || 0;
        const attPct = attTotal > 0 ? ((attPresent / attTotal) * 100).toFixed(1) : '100.0';

        // Recent Tests
        const tests = await query(`
            SELECT tr.marks_obtained, t.title, t.subject_name, t.total_marks
            FROM test_results tr
            JOIN tests t ON tr.test_id = t.id
            WHERE tr.student_id = ?
            ORDER BY t.test_date DESC LIMIT 5
        `, [student_id]);

        // Cleanliness
        const clean = await get(`
            SELECT status FROM cleanliness_records WHERE student_id = ? ORDER BY date DESC, id DESC LIMIT 1
        `, [student_id]);
        const cleanStatus = clean ? clean.status : 'Neat';

        // Latest Remarks
        const rems = await query(`
            SELECT date, remark_text FROM remarks WHERE student_id = ? ORDER BY date DESC, id DESC LIMIT 3
        `, [student_id]);

        // Clean phone number (remove spaces, plus sign if formatting wa.me link)
        let rawPhone = student.parent_phone.replace(/[^\d]/g, '');
        if (rawPhone.startsWith('0')) {
            // Convert Pakistani 03xx to 923xx
            rawPhone = '92' + rawPhone.substring(1);
        }

        // Format message
        let msg = `🏫 *TISS SCHOOL SYSTEM - STUDENT REPORT*\n`;
        msg += `-----------------------------------\n`;
        msg += `👤 *Student Name:* ${student.name}\n`;
        msg += `🆔 *Roll No:* ${student.roll_number} | *Class:* ${student.class_name}\n\n`;

        msg += `📅 *ATTENDANCE SUMMARY*\n`;
        msg += `• Present: ${attPresent}/${attTotal} Days (${attPct}%)\n\n`;

        msg += `📝 *TEST RESULTS*\n`;
        if (tests.length === 0) {
            msg += `• No test records available yet.\n\n`;
        } else {
            tests.forEach(t => {
                const pct = ((t.marks_obtained / t.total_marks) * 100).toFixed(1);
                msg += `• ${t.subject_name} (${t.title}): ${t.marks_obtained}/${t.total_marks} (${pct}%)\n`;
            });
            msg += `\n`;
        }

        msg += `✨ *CLEANLINESS OBSERVATION*\n`;
        msg += `• Status: ${cleanStatus}\n\n`;

        msg += `📌 *TEACHER REMARKS*\n`;
        if (rems.length === 0) {
            msg += `• No remarks recorded.\n`;
        } else {
            rems.forEach(r => {
                msg += `• ${r.date}: ${r.remark_text}\n`;
            });
        }
        msg += `-----------------------------------\n`;
        msg += `_Generated via TISS Parent Communication Portal_`;

        const encodedMsg = encodeURIComponent(msg);
        const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodedMsg}`;

        res.json({
            student_name: student.name,
            parent_phone: student.parent_phone,
            formatted_phone: rawPhone,
            message_text: msg,
            whatsapp_url: whatsappUrl
        });
    } catch (err) {
        console.error('Error building WhatsApp link:', err);
        res.status(500).json({ error: 'Server error building WhatsApp link' });
    }
});

module.exports = router;
