# Remarks and visibility approval — 2026-09-22

## User decision

The user selected **administrator or class incharge** to approve a remark before students or parents can see it. Parent and student visibility are separate requested audiences; both may be selected. Nothing is sent automatically.

## Implemented

- Remarks page from admin navigation, teacher dashboard and class workspace. Categories: Academic, Homework, Behaviour, Discipline, Attendance concern, Cleanliness, Positive achievement and General.
- Assigned teachers author remarks for students enrolled on the selected date. Author, student, enrollment, class and date remain fixed; text/category/audience edits retain identity and audit history.
- New remarks default to internal. Selecting an audience creates a pending request. Only an administrator or the active class incharge can approve, reject or withdraw visibility. Rejections/withdrawals need a reviewer note.
- An author may edit their own remarks while assigned to that class. Every edit clears previous approval and review note; the audit retains the prior values. Reviewers do not silently rewrite another teacher's words.
- Subject teachers see their own remarks. Class incharges and administrators see their class's remarks, including internal entries, to review them. Former/revoked incharges lose review access immediately on new requests.
- Student dashboard displays only approved remarks explicitly marked for that student audience and linked to the signed-in student's profile. It never returns internal text, pending/rejected text, parent-only remarks, reviewer notes or other students' records.
- A separate service projection returns only approved parent-visible remarks for authorized staff, ready for the future parent report. It has no public parent endpoint and sends no WhatsApp messages.
- Version checks reject stale edits/reviews. Database checks enforce audience/approval metadata consistency, dated enrollment, immutable authorship/context and renewed approval after content changes. Enrollment dates cannot invalidate existing remark history.
- Creation retries use a request ID to avoid duplicate remarks. Lists paginate at 50; student selection is bounded at 1,000. The UI warns before discarding edited forms and displays errors/retry controls.

## Walkthrough

1. As an assigned teacher, open **Remarks**, choose a class, then **New remark**.
2. Choose date, student, category and text. Leave audiences unchecked for an internal note, or request parent/student visibility. Save.
3. As administrator or that class's incharge, open **Remarks**, choose the same class and select **Review request**. Approve the displayed content/audiences or reject with a note.
4. A student can see approved student-visible remarks on their dashboard. Parent-only remarks do not appear there.
5. Editing an approved remark hides it externally until approved again. A reviewer can use **Withdraw visibility** to remove it without deleting its history.

No real school remarks or approvals were created during development. Parent reports and reviewed manual WhatsApp sharing are the next functional work; report denominator/term policies remain unresolved.

## Database and verification

Migrations: `0004_tidy_skullbuster.sql` and `0005_remark_integrity.sql`. Pre-migration backup: `.local/backups/2026-09-22T10-34-55-701Z/tiss-platform.dump`, with SHA-256 manifest and successful archive-list verification. Full restore verification remains pending.

All 36 integration tests pass, including audience separation, unauthorized approvals, author isolation, approval invalidation, stale review conflicts, assignment revocation and history constraints. Authenticated browser visual verification and multi-connection PostgreSQL testing remain pending.

The production build and TypeScript check also passed. Both remarks migrations were applied successfully to the local database after backup.
