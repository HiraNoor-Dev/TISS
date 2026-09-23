# Classroom entry milestone — 2026-09-22

## Implemented

- Teacher dashboard opens a class workspace with Tests & marks, Attendance and Observations tabs. Subject choices come from assignments; incharge-only responsibility does not grant marks access.
- Tests have a name, subject/class/year context, date, total marks, optional description and authenticated author. Retry of the same creation request does not duplicate the test. Definitions are fixed after creation; controlled correction/archiving remains later work.
- Marks use a complete roster based on enrollment on the test date, even before any results exist. Present requires marks, including legitimate zero; Absent and Not Attempted have no numeric marks. Blank students remain unrecorded. Decimal marks accept at most two places; negative/excess marks are rejected in the backend and excess marks are also blocked by a database trigger.
- Daily attendance supports Present, Absent and Leave. The user explicitly chose any assigned class teacher as the recorder. All authorized teachers edit the same class/date sheet, with stale version protection. Unsaved new rows default to Present for review; merely opening a sheet creates no records.
- Observations support Cleanliness, Uniform, Personal hygiene, Discipline and General conduct, rated Good, Needs Improvement or Concern, with an optional note. Blank rows are skipped. Each teacher owns their class/date/category sheet; repeated saves update records rather than duplicate them. Notes are staff-only at this milestone.
- Bulk requests validate all rows before writing and audit actual changes in the same transaction. Unrelated students, duplicate rows, inactive/revoked assignments and stale versions are rejected. Existing records retain their enrollment identity, and enrollment edits that invalidate classroom history fail.
- The interface uses student cards on narrow screens, shows saved/missing counts and save errors, protects changed entries when changing context, and provides explicit reload after conflicts. Bulk rosters are bounded at 1,000 students; test lists are paginated at 50.

## Try it

1. Run `npm run dev` in `D:\TISS-main\TISS-main\platform`, or refresh the running development app at http://localhost:3100.
2. As administrator, configure an active current year, class, subject, active teacher assignment and student enrollments. Dates must cover the records you will enter.
3. Sign in as the teacher and open the class workspace.
4. In Tests & marks, create a test, enter marks/statuses and save. Reopen to verify persistence.
5. In Attendance, choose a date, adjust exceptions from Present, and save. A second assigned teacher can view/edit the same sheet; a stale save requires reloading.
6. In Observations, choose a date/category, rate only observed students, optionally add notes, and save.

No test students were inserted into the local school database. The automated suite uses isolated PGlite databases and includes a 501-student attendance request through the real HTTP handler.

## Database and checks

New migrations: `0002_fearless_lila_cheney.sql` (six tables and enums) and `0003_classroom_integrity.sql` (context, marks and enrollment-history triggers). Both are applied locally; never edit these applied files.

Pre-migration archive: `.local/backups/2026-09-22T09-52-13-808Z/tiss-platform.dump`, with SHA256.txt. The archive listing was verified. A full restore drill is still pending.

All 27 integration tests passed; the production build and its TypeScript check passed. Local PostgreSQL verification confirms 23 application tables and the two pre-existing accounts. No credentials are recorded in this document. Browser visual and multi-connection concurrency verification remain pending; isolated PostgreSQL-compatible tests do not replace those checks.

## Remaining

Remarks with explicit audience/approval rules; student/staff/parent reports with date filters; reviewed manual WhatsApp opening; controlled historical corrections; operational backup/restore and pilot verification. No messages are sent by classroom entry.
