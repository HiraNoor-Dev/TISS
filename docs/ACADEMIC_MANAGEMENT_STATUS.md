# Academic administration milestone

Implemented following phase 3 of the reviewed refined plan. The user confirmed the preceding account milestone works on local PostgreSQL: sign-in, first password change, teacher creation and deactivation.

## Walkthrough

Run `npm run dev` from `D:\TISS-main\TISS-main\platform`, open http://localhost:3100 and sign in as administrator.

1. Open **Academic structure**. Add an academic year with actual school dates and make it current. Add divisions, their grades, sections, year-specific classes, and subjects.
2. Open **Assignments**. Assign active teachers to classes and subjects. Assign one class incharge per class; revoke the old assignment before replacing an incharge. A deactivated teacher must first be activated in Accounts.
3. Open **Students & guardians**. Add a student with a unique portal ID, class and enrollment start date. Manage the record to add guardian contacts and designate a primary contact. Administrators can search and link existing guardians for siblings.
4. For optional student portal access, create a Student account in **Accounts** using the same portal ID as its username. The existing student profile is linked, including its name, enrollment and guardians.
5. Teachers see their assigned class rosters; incharges also see **Manage students & guardians**. Subject assignments alone do not grant contact/profile management.
6. To promote or transfer a student, an administrator opens their record and chooses the destination class/year and start date. The previous record remains, with its end date closed before the new one begins and no later than its original year end.

No new database migration is required for this milestone. Existing local accounts are retained. Automated test records live only in isolated temporary databases.

## Boundaries and safeguards

- Configuration and assignment changes require an administrator. Incharge access follows the current year, active hierarchy and unrevoked assignment.
- Portal IDs remain immutable. Enrollment changes add historical records rather than moving old records between classes/years. Stale enrollment submissions are rejected.
- Non-active student status closes the open enrollment on the chosen past/current date, disables any linked login and revokes sessions. Reactivation does not automatically reopen enrollment or enable the account.
- Only administrators can link existing shared guardians or change shared contact details. An incharge may still change the relationship/primary flag on their own student's link. Primary-contact changes and other writes are audited.
- Guardian numbers use international format; no messages are sent. Equivalent name/phone contacts are checked without case sensitivity and guardian changes are serialized to avoid simultaneous duplicate creation.
- Deactivation retains records. Historical correction/deletion and bulk import are not included in this milestone. School-wide unique portal IDs and admin/current-incharge contact access continue the documented foundation defaults.

## Verification

The automated suite covers configuration/assignment constraints, inactive hierarchy checks, direct HTTP privilege violations, cross-class student access, guardian sharing/primary contacts, student-account linking, immediate login revocation and preserved promotion history. Existing foundation regression tests remain included. PGlite exercises real SQL migrations and application queries; multi-connection PostgreSQL concurrency and hosted deployment remain separate operational checks.

Validation on 2026-09-22: all 20 tests passed, TypeScript checking passed and the production build passed. The read-only local verification connected to PostgreSQL and confirmed 17 application tables and the two existing accounts. Browser preview navigation timed out, so visual validation of the new authenticated screens remains pending.

Classroom marks, attendance, observations, remarks and reports remain the next milestone. Attendance ownership and report/remark policies remain open as recorded in the original review.
