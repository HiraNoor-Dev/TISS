# Application handover — 23 September 2026

The remaining application phase added administrator activity/history, operational counts and reason-required historical classroom corrections; backup restoration verification, actual PostgreSQL concurrency checks, runtime-role grants, auth-data maintenance and the school operations runbook. Seven migrations are applied locally. Reports from the earlier phase remain available to administrator/incharge/student audiences with server-side privacy filtering.

## Evidence

- 37 passing integration tests: authentication, account/assignment permissions, student/guardian/enrollment history, atomic classroom writes, 501-student bulk workflow, remark visibility, reports, administrative corrections and immutable audits.
- Final production build and TypeScript compilation passed after the mobile report fix.
- Post-migration backup and SHA256 manifest: `.local/backups/2026-09-23T01-31-08-568Z/`.
- Full PostgreSQL restore, validated constraints, actual simultaneous classroom saves, teacher/admin correction collision and restricted-runtime denial checks passed. JSON evidence: `.local/restore-verification/2026-09-23T01-34-05-735Z/`.
- Synthetic browser walkthroughs: administrator login/activity and persisted correction; teacher dashboard/workspace/attendance controls; student dashboard and self-only report generation. Reviewed classroom and report layouts at 390px. Fixed a grid sizing issue that caused the marks table to stretch the page.
- Production npm audit: zero reported vulnerabilities. Prior development-only advisories are recorded in the platform README.
- Temporary preview, database and browser tab closed. Verification did not alter school records or real account credentials.

## Agreed exclusions and acceptance

WhatsApp remains paused, old prototype records are excluded, and online hosting remains deferred by the user. The app is ready for final school review; it is not deployed. Provider setup must include HTTPS, validated database TLS, a non-owner runtime login, scheduled backups and cleanup, monitoring, and a recovery policy. The school must run the one-class acceptance pilot described in `OPERATIONS_RUNBOOK.md`, including actual phones and connectivity. These are rollout requirements, not completed tests.
