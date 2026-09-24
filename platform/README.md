# TISS platform

This is the application built from the approved refined plan. The original prototype remains in adjacent folders; its APIs and data are not used or imported.

## Implemented

- Next.js App Router, TypeScript, Tailwind, Drizzle and PostgreSQL migrations.
- Students with immutable identities, guardians and relationship records, academic years, dynamic divisions/grades/sections, year-specific classes, historical enrollments, subjects, teacher and incharge assignments.
- Password hashing, opaque server sessions stored as digests, current account-status checks, eight-hour expiry, logout revocation, required first-login password change and administrative password reset.
- Database-backed account login throttling (10 attempts per 15 minutes) and an aggregate login ceiling (300 per minute). Password verification attempts are also limited.
- Same-origin JSON mutation checks, bounded request bodies, strict validation and private response caching rules. Production session cookies are Secure, HTTP-only, SameSite=Lax and use the `__Host-` prefix.
- Administrator account creation, activation/deactivation and password reset screens. Teacher responsibilities grouped by class, authorized paginated rosters and the student's own enrollment history.
- A separate staff-only guardian contact endpoint, contextual class/subject permissions, transactional account provisioning and audit events without credentials.
- Database constraints/triggers for profile roles, active assignments, primary guardians, academic context, non-overlapping enrollments and append-only audit logs.
- Administrator screens for academic years, divisions, grades, sections, year-specific classes, subjects, teaching assignments and incharges.
- Administrator spelling/name corrections, subject-code and teacher-username edits, plus confirmed deletion of unused configuration, teachers and assignments. Linked history is protected; used accounts/assignments must be deactivated/revoked. See `../docs/ADMIN_CORRECTIONS_STATUS.md` for exact boundaries.
- Student creation/search, guardian relationships and primary contacts, existing guardian linking for siblings, dated enrollment/promotion history and student lifecycle changes. Current incharges manage only their assigned students; administrators handle enrollment changes and shared contact edits.
- Student account provisioning links an existing active student profile by portal ID, preserving identity and history. Departure/inactive status closes enrollment and disables the linked login.
- Teacher class workspace with subject-scoped tests and bulk marks (Present/Absent/Not Attempted), daily attendance (Present/Absent/Leave), and intentional observations with categories, ratings and optional notes.
- Teacher-confirmed WhatsApp result delivery through Meta's Cloud API. Saving marks never sends automatically. The test's teacher reviews readiness and clicks **Publish & send results**; each consented primary guardian receives only that student's result, and later mark versions use a correction template.
- Complete dated bulk rosters up to 1,000 students, transactional validation, audited changes, database enrollment/marks integrity, retry-safe test creation, and sheet versions that reject stale edits. Any assigned teacher can enter attendance, as requested by the user.

## Final additions and agreed exclusions

Reports include student/staff/parent views, class marks and attendance, approved remarks and staff-only observation history with date/month/year filters. Administrator Activity & corrections provides paginated audit history, operational counts and reason-required corrections of saved marks, attendance and observations, with stale-write protection and retained author/enrollment history.

WhatsApp support is implemented but remains disabled until the school connects and approves its Meta Business account, templates and consent process. Online deployment, provider backup scheduling and the real-school pilot are deferred until application acceptance. Old prototype data is excluded. See `../docs/WHATSAPP_STATUS.md`, `../docs/OPERATIONS_RUNBOOK.md` and `../docs/SESSION_CHECKPOINT.md`.

## Local setup

Reporting update: Dashboard → Reports provides student overall reports, class marks/attendance, staff observation history and audience-approved remarks with year/month/custom date filters. Parent report preview is implemented. WhatsApp sends individual test results from the test marks screen after explicit teacher confirmation.

Requires Node.js 22 or later and a PostgreSQL database dedicated to this application. Local PostgreSQL 18 is configured on the implementation machine. The user verified login, initial password change, teacher account creation and deactivation. Automated integration tests use isolated PGlite databases; hosted deployment verification is still pending.

1. From this folder, run `npm ci`.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `APP_ORIGIN=http://localhost:3100` and a random `AUTH_RATE_SECRET` of at least 32 characters. Generate the secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Run `npm run db:migrate`. Use an owner/migration credential for schema changes, not the production application login.
4. For the first administrator only, set `BOOTSTRAP_USERNAME`, `BOOTSTRAP_NAME` and `BOOTSTRAP_PASSWORD` in your process environment, then run `npm run admin:create`. The password must be 12–72 characters and at most 72 UTF-8 bytes. The script refuses an installation that already has accounts. Remove those bootstrap environment variables afterward. It never prints the password.
5. Run `npm run dev` and visit `http://localhost:3100`. Sign in with the temporary administrator credentials, change the password, and sign in again. Create teacher/student accounts in the dashboard.

Do not put credentials in source control, a command-history argument or the shared example file. This milestone deliberately does not create public demo accounts or choose an administrator password on the school's behalf.

## Verification

```text
npm run typecheck
npm test
npm run build
```

The integration suite applies the actual SQL migrations to fresh in-memory PostgreSQL-compatible databases. It tests production services and HTTP handlers with real queries and synthetic records. It does not write test records to the local school database or open the old SQLite database. Coverage includes sessions, contextual permissions, password/account lifecycle, origin/validation checks, transaction rollback, immutable audits, academic configuration, guardian sharing, profile/account linking, promotion history and classroom workflows with 501 synthetic students. The Node runner reports 38 tests, including consent, teacher ownership, correction batches, delivery webhooks, retry rules and immutable message snapshots.

PGlite does not verify network authentication, TLS, multi-connection PostgreSQL concurrency, managed backups or production deployment configuration. Test these on the target PostgreSQL instance before a pilot. External Meta credentials, approved message templates and a public HTTPS webhook must be configured during deployment before live messages can be tested.

## Database operations

`npm run db:generate` generates reviewable schema migrations; inspect generated SQL before `npm run db:migrate`. Custom integrity triggers are in the second migration. Never edit an applied migration. Application services live in `src/server`, schema definitions in `src/db`, and thin HTTP/UI entry points in `src/app`.

The classroom tables and integrity triggers are migrations 0002 and 0003. They were applied to the local PostgreSQL database after backup. `npm run db:backup:local` creates a custom-format archive and SHA-256 manifest in the ignored root `.local/backups/` directory. It reads local connection credentials from the environment without printing them; set `PG_BIN` if PostgreSQL tools are installed elsewhere. Archive listing verification is not a full restore test.

Use a non-owner runtime database role. `scripts/runtime-grants.sql` defines specific grants, including dependency-protected configuration deletion and SELECT/INSERT-only audit access. Do not grant runtime schema ownership, TRUNCATE, trigger-control privileges or audit UPDATE/DELETE. Use a separate migration credential. Student/enrollment deletion is not exposed; academic history is retained through restrictive foreign keys and lifecycle records.

Before deployment, configure HTTPS with the matching HTTPS `APP_ORIGIN`, trusted reverse-proxy IP rate limiting, database TLS, automated backups and a tested restore. Do not disable origin checks or Secure cookies to serve production over HTTP. `npm run build` then `npm run start` builds and serves production on port 3100.

Schedule `npm run maintenance` daily when hosting is configured; expiry is enforced even before cleanup. The global login ceiling is a backstop, not a substitute for per-source limits at a trusted proxy. An attacker can exhaust an account's attempt window, so the operational reset/support procedure matters.

`npm run db:verify-restore -- <archive-path>` checks the adjacent checksum, restores into a separate password-protected loopback cluster and checks actual classroom concurrency in another synthetic database. It never restores over the working database. Add `--preview` to run the synthetic app on port 3101 for UI verification; Ctrl+C stops it and the temporary database. Evidence and recovered files stay in ignored `.local/restore-verification/`.

At the implementation audit, npm reported four moderate advisories in the development-only Drizzle Kit → esbuild loader chain, all stemming from the old esbuild development-server advisory. Production dependencies had no reported advisories in that audit. No esbuild development server or Drizzle Studio is run by this application. Do not use `npm audit fix --force`, which proposes an incompatible Drizzle Kit downgrade; track an upstream tooling update. The complete dependency resolution is locked in `package-lock.json`.

## Pending school inputs

The school still needs to approve retention/recovery targets and conduct a one-class pilot. Agreed defaults are stable school-wide portal IDs, date/month/year filters and recorded counts instead of undefined attendance denominators/overall grades. Contacts are restricted to current incharges and administrators; subject teachers receive minimal rosters. Student login uses a lowercase username corresponding to their uppercase portal ID. School dates use Asia/Karachi.
