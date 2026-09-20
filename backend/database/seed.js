const bcrypt = require('bcryptjs');
const { initSchema, run, get, query } = require('../config/database');

async function seed() {
    console.log('--- Starting Seed Process ---');
    await initSchema();

    // 1. Seed School Sections
    const sections = [
        { code: 'junior', name: 'Junior Section (Grades 0-5)' },
        { code: 'senior', name: 'Senior Section (Grades 6-8)' },
        { code: 'matric', name: 'Matric Section (Grades 9-10)' }
    ];

    for (const sec of sections) {
        await run(`INSERT OR IGNORE INTO school_sections (code, name) VALUES (?, ?)`, [sec.code, sec.name]);
    }

    const juniorSec = await get(`SELECT id FROM school_sections WHERE code = 'junior'`);
    const seniorSec = await get(`SELECT id FROM school_sections WHERE code = 'senior'`);
    const matricSec = await get(`SELECT id FROM school_sections WHERE code = 'matric'`);

    // 2. Seed Classes
    const classList = [
        { name: 'Grade 0', section_id: juniorSec.id },
        { name: 'Grade 1', section_id: juniorSec.id },
        { name: 'Grade 2 - Pink', section_id: juniorSec.id },
        { name: 'Grade 2 - Blue', section_id: juniorSec.id },
        { name: 'Grade 3', section_id: juniorSec.id },
        { name: 'Grade 4', section_id: juniorSec.id },
        { name: 'Grade 5', section_id: juniorSec.id },
        { name: 'Grade 6', section_id: seniorSec.id },
        { name: 'Grade 7', section_id: seniorSec.id },
        { name: 'Grade 8', section_id: seniorSec.id },
        { name: 'Grade 9', section_id: matricSec.id },
        { name: 'Grade 10', section_id: matricSec.id }
    ];

    for (const cls of classList) {
        const existing = await get(`SELECT id FROM classes WHERE name = ?`, [cls.name]);
        if (!existing) {
            await run(`INSERT INTO classes (name, section_id) VALUES (?, ?)`, [cls.name, cls.section_id]);
        }
    }

    const g2Pink = await get(`SELECT id FROM classes WHERE name = 'Grade 2 - Pink'`);
    const g6 = await get(`SELECT id FROM classes WHERE name = 'Grade 6'`);
    const g7 = await get(`SELECT id FROM classes WHERE name = 'Grade 7'`);
    const g8 = await get(`SELECT id FROM classes WHERE name = 'Grade 8'`);
    const g9 = await get(`SELECT id FROM classes WHERE name = 'Grade 9'`);

    // 3. Seed Password Hashes
    const defaultPasswordHash = await bcrypt.hash('password123', 10);

    // Seed Admin
    await run(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role, is_incharge) VALUES (?, ?, ?, ?, ?)`,
        ['admin', defaultPasswordHash, 'System Administrator', 'admin', 1]);

    // Seed Teachers
    // Teacher 1: Ms. Fatima (Class Incharge for Grade 2 Pink)
    await run(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role, is_incharge, default_section_id) VALUES (?, ?, ?, ?, ?, ?)`,
        ['fatima_t', defaultPasswordHash, 'Ms. Fatima Khan', 'teacher', 1, juniorSec.id]);
    const fatimaUser = await get(`SELECT id FROM users WHERE username = 'fatima_t'`);

    // Teacher 2: Ms. Ayesha (Senior English Teacher)
    await run(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role, is_incharge, default_section_id) VALUES (?, ?, ?, ?, ?, ?)`,
        ['ayesha_t', defaultPasswordHash, 'Ms. Ayesha Siddiqui', 'teacher', 0, seniorSec.id]);
    const ayeshaUser = await get(`SELECT id FROM users WHERE username = 'ayesha_t'`);

    // 4. Seed Teacher Assignments
    const assignments = [
        { teacher_id: fatimaUser.id, class_id: g2Pink.id, subject_name: 'English' },
        { teacher_id: fatimaUser.id, class_id: g2Pink.id, subject_name: 'Mathematics' },
        { teacher_id: fatimaUser.id, class_id: g2Pink.id, subject_name: 'Science' },
        { teacher_id: ayeshaUser.id, class_id: g6.id, subject_name: 'English' },
        { teacher_id: ayeshaUser.id, class_id: g7.id, subject_name: 'English' },
        { teacher_id: ayeshaUser.id, class_id: g8.id, subject_name: 'English' },
        { teacher_id: ayeshaUser.id, class_id: g9.id, subject_name: 'English' }
    ];

    for (const assign of assignments) {
        await run(`INSERT OR IGNORE INTO teacher_assignments (teacher_id, class_id, subject_name) VALUES (?, ?, ?)`,
            [assign.teacher_id, assign.class_id, assign.subject_name]);
    }

    // 5. Seed Prototype Students in Grade 2 - Pink
    const sampleStudents = [
        { roll: 'P2101', name: 'Ayesha Khan', phone: '+923001234567' },
        { roll: 'P2102', name: 'Zain Ahmed', phone: '+923007654321' },
        { roll: 'P2103', name: 'Bilal Hassan', phone: '+923019876543' },
        { roll: 'P2104', name: 'Sara Ali', phone: '+923024567890' },
        { roll: 'P2105', name: 'Hamza Usman', phone: '+923031122334' }
    ];

    const studentIds = [];
    for (const stu of sampleStudents) {
        // Create student user login account
        await run(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
            [stu.roll, defaultPasswordHash, stu.name, 'student']);
        const stuUser = await get(`SELECT id FROM users WHERE username = ?`, [stu.roll]);

        // Create student record
        const existingStu = await get(`SELECT id FROM students WHERE roll_number = ?`, [stu.roll]);
        let sId;
        if (!existingStu) {
            const res = await run(`INSERT INTO students (roll_number, name, class_id, parent_phone, user_id) VALUES (?, ?, ?, ?, ?)`,
                [stu.roll, stu.name, g2Pink.id, stu.phone, stuUser.id]);
            sId = res.lastID;
        } else {
            sId = existingStu.id;
        }
        studentIds.push({ id: sId, roll: stu.roll, name: stu.name });
    }

    // 6. Seed Tests & Test Results for Grade 2 Pink
    const test1 = await run(`INSERT INTO tests (title, subject_name, class_id, total_marks, test_date, created_by_teacher_id) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Monthly Assessment 1', 'English', g2Pink.id, 25, '2026-09-10', fatimaUser.id]);
    
    const test2 = await run(`INSERT INTO tests (title, subject_name, class_id, total_marks, test_date, created_by_teacher_id) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Mid-Term Quiz', 'Mathematics', g2Pink.id, 30, '2026-09-15', fatimaUser.id]);

    const test3 = await run(`INSERT INTO tests (title, subject_name, class_id, total_marks, test_date, created_by_teacher_id) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Practical Activity', 'Science', g2Pink.id, 20, '2026-09-18', fatimaUser.id]);

    // Sample marks distribution
    const marksData = [
        { student_id: studentIds[0].id, t1: 23, t2: 28, t3: 19, r1: 'Excellent vocabulary', r2: 'Great working', r3: 'Very curious' },
        { student_id: studentIds[1].id, t1: 18, t2: 22, t3: 15, r1: 'Needs reading practice', r2: 'Good effort', r3: 'Needs attention' },
        { student_id: studentIds[2].id, t1: 21, t2: 26, t3: 17, r1: 'Good handwriting', r2: 'Fast calculations', r3: 'Active in lab' },
        { student_id: studentIds[3].id, t1: 24, t2: 29, t3: 20, r1: 'Top scorer', r2: 'Outstanding', r3: 'Brilliant experiment' },
        { student_id: studentIds[4].id, t1: 15, t2: 19, t3: 14, r1: 'Can improve', r2: 'Work on tables', r3: 'Fair performance' }
    ];

    for (const m of marksData) {
        await run(`INSERT OR IGNORE INTO test_results (test_id, student_id, marks_obtained, remarks) VALUES (?, ?, ?, ?)`,
            [test1.lastID, m.student_id, m.t1, m.r1]);
        await run(`INSERT OR IGNORE INTO test_results (test_id, student_id, marks_obtained, remarks) VALUES (?, ?, ?, ?)`,
            [test2.lastID, m.student_id, m.t2, m.r2]);
        await run(`INSERT OR IGNORE INTO test_results (test_id, student_id, marks_obtained, remarks) VALUES (?, ?, ?, ?)`,
            [test3.lastID, m.student_id, m.t3, m.r3]);
    }

    // 7. Seed Attendance Records for Grade 2 Pink (Past 5 Days)
    const dates = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
    for (const dt of dates) {
        for (let i = 0; i < studentIds.length; i++) {
            // Student 2 absent on 2026-09-17, Student 5 absent on 2026-09-19
            const status = (i === 1 && dt === '2026-09-17') || (i === 4 && dt === '2026-09-19') ? 'absent' : 'present';
            await run(`INSERT OR IGNORE INTO attendance (student_id, class_id, date, status, recorded_by_teacher_id) VALUES (?, ?, ?, ?, ?)`,
                [studentIds[i].id, g2Pink.id, dt, status, fatimaUser.id]);
        }
    }

    // 8. Seed Cleanliness Records
    for (let i = 0; i < studentIds.length; i++) {
        const statuses = ['Neat', 'Needs Improvement', 'Neat', 'Neat', 'Needs Improvement'];
        await run(`INSERT INTO cleanliness_records (student_id, date, status, notes, recorded_by_teacher_id) VALUES (?, ?, ?, ?, ?)`,
            [studentIds[i].id, '2026-09-20', statuses[i], 'Daily inspection', fatimaUser.id]);
    }

    // 9. Seed Remarks
    const remarksList = [
        { student_id: studentIds[0].id, category: 'Academic', text: 'Participates enthusiastically in classroom activities.' },
        { student_id: studentIds[1].id, category: 'Homework incomplete', text: 'Please ensure English notebook homework is signed.' },
        { student_id: studentIds[2].id, category: 'Behavior', text: 'Very polite and helpful to classmates.' },
        { student_id: studentIds[3].id, category: 'Academic', text: 'Consistently shows high academic dedication.' },
        { student_id: studentIds[4].id, category: 'Handwriting improvement', text: 'Practicing cursive handwriting daily will help.' }
    ];

    for (const r of remarksList) {
        await run(`INSERT INTO remarks (student_id, date, category, remark_text, teacher_id) VALUES (?, ?, ?, ?, ?)`,
            [r.student_id, '2026-09-20', r.category, r.text, fatimaUser.id]);
    }

    console.log('--- Database Seed Completed Successfully ---');
    console.log('Sample Accounts Created:');
    console.log('1. Admin: username="admin", password="password123"');
    console.log('2. Incharge Teacher: username="fatima_t", password="password123"');
    console.log('3. Senior Teacher: username="ayesha_t", password="password123"');
    console.log('4. Student Logins: username="P2101" .. "P2105", password="password123"');
}

seed().catch(err => {
    console.error('Seed Failed:', err);
    process.exit(1);
});
