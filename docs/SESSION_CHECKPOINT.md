# Saved development checkpoint

Updated 2026-09-24. Workspace: D:\TISS-main\TISS-main. Application: platform/.

## Agreed scope
Complete the new application, including teacher-confirmed WhatsApp result delivery. Do not import old prototype data. Deploy online eventually, but defer hosting provider selection. Preserve original folders; they are not the new backend.

## Implemented
- Secure opaque sessions, temporary-password change, account lifecycle, contextual permissions, persisted login throttling and strict same-origin validation.
- Academic structure, teacher/incharge assignments, students/guardians, account linking and dated enrollment history.
- Safe edits, deactivation/revocation and dependency-protected deletion of unused configuration, teachers and assignments.
- Teacher tests/marks, shared daily attendance and intentional observations; atomic bulk saves and stale-sheet protection.
- Remarks with administrator/incharge approval; author edits revoke approval; separate parent/student audience projections.
- Student/staff/parent reports, class marks/attendance, date/month/year filters, recorded counts and per-test percentages. Private observations remain staff-only.
- Administrator Activity & corrections: operational counts, paginated audit history, reason-required corrections of saved marks/attendance/observations including past years. Original authors/enrollments retained; sheet versions advance.
- Backup/checksum helper, isolated full restore and PostgreSQL concurrency verifier, synthetic browser preview, expired auth-data cleanup, runtime grants and operations runbook.
- WhatsApp Cloud API outbox with explicit guardian consent, teacher-only confirmation, one private message per student, correction batches, webhook delivery tracking, definite-failure retry and immutable snapshots. Live messaging remains disabled until Meta setup.

## Verified environment
- 38 integration tests passed, including a 501-student bulk workflow, correction reasons/stale saves, audit restrictions and the WhatsApp workflow. The final production build and TypeScript check passed on 24 September.
- Eight migrations (0000–0007) are applied. Migration 0007 adds WhatsApp consent and delivery tables. Never edit an applied migration.
- Pre-migration backup: `.local/backups/2026-09-24T04-03-14-135Z/tiss-platform.dump` with its SHA-256 manifest.
- Post-migration backup: `.local/backups/2026-09-24T04-06-21-548Z/tiss-platform.dump`. Its full isolated restore and PostgreSQL concurrency checks passed; evidence is in `.local/restore-verification/2026-09-24T04-06-37-372Z/verification.json` and `application-verification.json`.
- Backup before migration: .local/backups/2026-09-22T17-32-36-349Z/tiss-platform.dump plus SHA256.txt.
- Full isolated PostgreSQL restore passed; evidence in .local/restore-verification/2026-09-22T17-35-38-690Z/verification.json and 2026-09-22T17-38-24-651Z/verification.json.
- Latest post-migration backup: .local/backups/2026-09-23T01-31-08-568Z/tiss-platform.dump, with verified checksum. Full restore passed with all seven migrations, two users, one student and 29 audits.
- Actual simultaneous teacher attendance saves and teacher/admin marks collisions passed: exactly one succeeds, the other returns 409. Restricted runtime access passed, including denial of audit DELETE/TRUNCATE and migration-schema access. Final evidence: .local/restore-verification/2026-09-23T01-34-05-735Z/verification.json and application-verification.json.
- Browser verified synthetic admin login/activity/persisted mark correction (13→15), teacher login/workspace and 390px layout. Student login/report generation showed only self marks/attendance and approved remarks. Found and fixed mobile report page overflow; only its table now scrolls sideways.
- Final production dependency audit: zero reported vulnerabilities (npm audit --omit=dev). Prior development-tool advisories remain documented separately; this is not a claim of zero vulnerabilities in every tool.
- Synthetic preview and its temporary PostgreSQL cluster were stopped and verified stopped. Browser sizing was reset and the temporary tab closed. No real account passwords or school records were changed by testing.
- PostgreSQL 18 tools: C:\Program Files\PostgreSQL\18\bin. Working database tiss_platform; local tiss_app is still database owner, not the future online runtime role.
- Credentials stay in ignored platform/.env.local. Never print them, reset the user's administrator password or use old bootstrap credentials for tests. Synthetic verification uses a separate cluster/database.
- Source is tracked on the `main` branch of `github.com/HiraNoor-Dev/TISS`.

## Handover
Application code is complete for the agreed scope. Hosting, Meta Business/template approval, HTTPS/provider configuration, production backup scheduling, school retention/recovery policy and real one-class acceptance remain rollout tasks. The current local database owner must be replaced by a separate restricted runtime login when deploying. Do not claim that the application is already deployed, WhatsApp is live, or a real school pilot has passed.

Run locally from platform/: npm run dev, then http://localhost:3100. Do not stop user-owned servers. See docs/OPERATIONS_RUNBOOK.md.
