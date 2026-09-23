# Administrator corrections and deletion

Implemented after user approval of Edit/Delete alongside activation controls.

- Academic structure: edit names for years, divisions, grades and sections; edit subject names/codes. IDs and historical links remain intact, so spelling corrections appear wherever the record is displayed.
- Classes derive their names from grade/section. Correct those names directly. Year/section membership and year dates are not rewritten by this correction screen; delete and recreate unused mistaken records instead.
- Teachers: edit name/username while retaining identity, assignments and recorded work. Saving revokes current sessions, so the teacher signs in again with the corrected username and existing password. Roles cannot be edited.
- Delete appears for academic structure records, teachers and assignments with a permanent-deletion confirmation. Restrictive foreign keys reject linked records without cascading or leaving partial changes. Deletion and edits retain append-only audit snapshots without credentials.
- A current academic year must first be replaced as current. Parent structure records with children cannot be deleted until unused dependencies are removed.
- Teacher accounts that have ever signed in are retained through deactivation. Never-used accounts can be deleted only after assignments and other dependencies are absent. Administrator/student account deletion is not exposed.
- Assignment deletion is intentionally conservative: any enrollment or classroom history in the class requires revocation instead. Correct an assignment by deleting/recreating it when unused, or revoking and creating the replacement when used. Show revoked assignments to inspect retained assignments or remove an unused mistake.

The original configuration controls needed no migration. Classroom corrections added migration 0006, permitting administrator attribution on marks and attendance. No real school records were edited/deleted during implementation or testing. Integration coverage exercises unauthorized requests, protected dependencies, account edits, session revocation, rollback and deletion in dependency order.

## Classroom corrections and activity (23 September 2026)

Administrator → Activity & corrections shows school counts, pending remark count, current classes without an incharge and read-only paginated audit history. Filter events by exact action or record UUID and expand before/after details.

Select a class, original date and Marks/Attendance/Observations. Expand the saved record, correct its values and enter a reason. Past-year records can be corrected without changing original author or enrollment. Sheet versions reject stale saves, including simultaneous teacher edits. Missing entries are still entered by assigned teachers; test definitions and enrollment identity are protected.

Verification: 37 integration tests passed, plus actual multi-connection PostgreSQL teacher/admin collision checks. TypeScript and production build passed. A synthetic authenticated browser walkthrough confirmed a mark correction persists and activity/teacher screens render. The mobile report overflow found during visual review was fixed. See the session checkpoint for final evidence.
