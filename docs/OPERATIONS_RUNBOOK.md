# Operations and school handover

## Scope agreed on 22 September 2026

The new `platform/` application is the delivery target. Do not import the old prototype data. WhatsApp remains paused. Online hosting is deliberately deferred until application finalization; the application is not yet deployed or pilot-approved.

## Routine administration

1. Configure year → division → grade → section → class, then subjects.
2. Create teacher accounts with temporary credentials. Assign subjects and a class incharge. Users must change their temporary password before accessing records.
3. Add students and dated enrollments; link guardians and choose the primary contact. Provision student logins only when needed.
4. Teachers enter tests/marks, attendance and observations in their assigned class workspace. Review pending remarks as administrator or incharge. Edits revoke earlier approval.
5. Reports provide staff, student and parent views. Parent summaries contain only approved parent-visible remarks; private observations remain staff-only. Attendance counts describe saved sheets, not a presumed school calendar.
6. Use **Activity & corrections** to review changes or correct a saved mark, attendance entry or observation. Choose its original class/date and supply a reason. A stale sheet must be reloaded. Original authors and enrollments remain unchanged, including prior years.
7. Correct names using Edit. Delete only unused configuration; deactivate/revoke records that have history. Close/replace dated enrollments for transfers. Never edit the database to bypass history restrictions.

Verify a requester's identity through the school's known contact channel before resetting their password. Do not share passwords in reports, logs or messaging groups. The administrator must maintain access to a working account; the application intentionally does not expose deletion of the active administrator.

## Backup and restore

From `platform/`, `npm run db:backup:local` creates a custom archive plus SHA-256 manifest under `.local/backups/`. This helper accepts only a local PostgreSQL source. Set `PG_BIN` to the PostgreSQL tools directory when needed.

Run `npm run db:verify-restore -- D:\path\to\tiss-platform.dump` with its adjacent SHA256.txt. The verifier initializes a new password-protected loopback PostgreSQL cluster, restores the archive, checks constraints/counts and saves JSON evidence. It then creates a separate synthetic database to check simultaneous teacher writes and teacher/admin collisions through the actual services. It stops the cluster on completion. It never accepts a destination database URL or modifies the working database. Recovered files remain in ignored `.local/restore-verification/` and should be protected like backups.

For a destructive recovery after a real incident: stop writes, preserve an incident backup, verify the intended archive, restore into a **new** database, run the same checks, compare school counts and representative reports, and only then change the deployment connection. Keep the previous database until the school accepts recovery. Never restore blindly over the only copy.

## Online deployment gate (deferred)

Select hosting and a managed PostgreSQL service with TLS, daily automated backups, point-in-time recovery if available, and documented restore access. Configure the schedule, encrypted off-site copy and retention with that provider; no hosting or scheduler is configured yet. Suggested initial policy for school approval: daily backups, 30-day retention, a monthly restore rehearsal, and recovery targets of 24 hours of data and one working day of downtime. Adapt these to school policy and provider capability.

Use separate staging and production databases. Run migrations with an owner/migrator credential. Apply `platform/scripts/runtime-grants.sql` and grant its role to a separate non-owner application login. The current local `tiss_app` is an owner and must not become the online runtime credential. Rerun grants after migrations add tables. Never give the runtime login ownership, superuser rights or audit UPDATE/DELETE permissions.

Set DATABASE_URL, APP_ORIGIN (exact HTTPS origin) and a random AUTH_RATE_SECRET of at least 32 characters as hosting secrets. Configure certificate-validated database TLS and HTTPS proxying. Do not disable Secure cookies or origin checks. Add trusted-proxy source rate limiting and monitor failed login volume, 5xx responses, database capacity and backup failures. Run `npm run maintenance` daily through the host scheduler; it deletes only expired sessions and old login-throttle buckets, not school records or audits.

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, migrations, then `npm run start`. The app defaults to port 3100. Smoke-test login, forced password change, role restrictions, a synthetic class workflow and report audience boundaries in staging before directing school traffic to production. Do not use synthetic preview credentials or copy `.env.local` into source control.

## One-class acceptance pilot

An administrator and one teacher must run this with the school's real rules before school-wide rollout: configure one class; enroll students and contacts; enter attendance with Leave and blanks; create a fresh test; correct a mark; review a remark; inspect student and parent report views; revoke an assignment and deactivate an account; verify access stops. Repeat classroom entry on a phone and a slow/reconnected connection. Record entry time, missing/incorrect records, confusing steps and teacher feedback. Hosting selection, backup schedule, retention policy, authenticated mobile acceptance and a real-school pilot cannot be certified by unit tests alone.
