// Review-only reproductions. Uses synthetic records in memory; never opens the school database.
// These assertions confirm defects in the original prototype, not acceptable future behavior.
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'backend/package.json'));
const sqlite = req('sqlite3');
const express = req('express');
const bcrypt = req('bcryptjs');
const db = new sqlite.Database(':memory:');
const query = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, rows) => e ? no(e) : ok(rows)));
const get = async (sql, p) => (await query(sql, p))[0];
const run = (sql, p = []) => new Promise((ok, no) => db.run(sql, p, function(e) { e ? no(e) : ok({ lastID: this.lastID, changes: this.changes }); }));
const config = path.join(root, 'backend/config/database.js');
require.cache[require.resolve(config)] = { id: config, filename: config, loaded: true, exports: { query, get, run, db } };
let server;
async function main() {
  await new Promise((ok, no) => db.exec(fs.readFileSync(path.join(root, 'backend/database/schema.sql'), 'utf8'), e => e ? no(e) : ok()));
  await run("INSERT INTO school_sections VALUES (1, 'review', 'Review')");
  await run("INSERT INTO classes VALUES (1, 'Class A', 1), (2, 'Class B', 1)");
  const hash = await bcrypt.hash('synthetic-review-password', 4);
  for (const [id, role, incharge] of [[1, 'teacher', 1], [2, 'student', 0], [3, 'student', 0]]) {
    await run('INSERT INTO users (id, username, password_hash, full_name, role, is_incharge) VALUES (?, ?, ?, ?, ?, ?)', [id, `review${id}`, hash, `Review ${id}`, role, incharge]);
  }
  await run("INSERT INTO students (id, roll_number, name, class_id, parent_phone, user_id) VALUES (1, 'REVIEW2', 'Synthetic A', 1, '0000000000', 2), (2, 'REVIEW3', 'Synthetic B', 2, '0000000000', 3)");
  await run("INSERT INTO tests (id, title, subject_name, class_id, total_marks, test_date, created_by_teacher_id) VALUES (1, 'Review test', 'English', 1, 10, '2026-09-21', 1)");
  const app = express();
  app.use(express.json());
  for (const name of ['auth', 'students', 'classes', 'marks', 'attendance', 'cleanliness', 'reports']) app.use(`/api/${name}`, req(path.join(root, `backend/routes/${name}.js`)));
  server = await new Promise(ok => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(url, token, body, method = 'POST') {
    const r = await fetch(base + url, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  }
  const teacher = (await call('/auth/login/teacher', null, { username: 'review1', password: 'synthetic-review-password' })).body.token;
  const student = (await call('/auth/login/student', null, { roll_number: 'REVIEW2', password: 'synthetic-review-password' })).body.token;
  assert.ok(teacher && student);
  const check = (label, condition) => { assert.ok(condition, label); console.log('CONFIRMED: ' + label); };
  const all = await call('/students/all', student);
  check('Student can read school roster including other guardian phone fields', all.status === 200 && all.body.students.length === 2 && 'parent_phone' in all.body.students[1]);
  check('Student can generate another student WhatsApp summary', (await call('/reports/whatsapp-link/2', student)).status === 200);
  check('Own-report check does deny another student report (positive control)', (await call('/reports/student/2', student)).status === 403);
  const empty = await call('/marks/results/1', teacher);
  check('New test roster returns null student_id', empty.body.results.length === 1 && empty.body.results[0].student_id === null);
  const partial = await call('/marks/results/save', teacher, { test_id: 1, results: [{ student_id: 1, marks_obtained: 7 }, { student_id: 2, marks_obtained: 99 }] });
  check('Rejected bulk marks request still persists its first row', partial.status === 400 && (await get('SELECT marks_obtained FROM test_results WHERE student_id=1')).marks_obtained === 7);
  check('Unassigned teacher can save marks for student outside test class', (await call('/marks/results/save', teacher, { test_id: 1, results: [{ student_id: 2, marks_obtained: 8 }] })).status === 200);
  check('Teacher can self-assign another class', (await call('/classes/assign', teacher, { class_id: 2, subject_name: 'English' })).status === 200);
  const att = await call('/attendance/save', teacher, { class_id: 1, date: '2026-09-21', records: [{ student_id: 2, status: 'leave' }] });
  check('Leave attendance is silently skipped while save reports success', att.status === 200 && !(await get('SELECT * FROM attendance WHERE student_id=2')));
  const clean = { class_id: 1, date: '2026-09-21', records: [{ student_id: 1, status: 'Neat' }] };
  await call('/cleanliness/save', teacher, clean); await call('/cleanliness/save', teacher, clean);
  check('Repeated cleanliness save duplicates the record', (await get('SELECT COUNT(*) AS n FROM cleanliness_records')).n === 2);
  const report = await call('/reports/student/2', teacher);
  check('Missing data is reported as 100 percent attendance and Neat', report.body.attendance.percentage === '100.0' && report.body.cleanliness.latest === 'Neat');
  check('Global incharge flag permits deactivation outside any incharge assignment', (await call('/students/deactivate/2', teacher, {}, 'PUT')).status === 200);
  await run("UPDATE users SET status='inactive' WHERE id=1");
  check('Inactive teacher can still log in', (await call('/auth/login/teacher', null, { username: 'review1', password: 'synthetic-review-password' })).status === 200);
  check('Previously issued token remains usable after account deactivation', (await call('/classes/my-assignments', teacher)).status === 200);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  await new Promise(ok => db.close(ok));
});
