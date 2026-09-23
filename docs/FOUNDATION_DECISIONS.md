# Foundation implementation decisions

The approved refined plan is authoritative. The first implementation milestone is the technical foundation, not the complete school MVP.

- Build in `platform/` alongside the preserved `frontend/` and `backend/` prototype. Do not reuse its database, session tokens or permissive routes.
- Use Next.js App Router, TypeScript, Tailwind, PostgreSQL, Drizzle and Zod. Drizzle was selected for typed database access and reviewable SQL migrations. Sources checked: https://nextjs.org/docs/app/getting-started/installation and https://orm.drizzle.team/docs/get-started-postgresql.
- Use opaque server-managed sessions. Store only token digests in the database. Read active account status on every protected request. Require a password change for temporary credentials and revoke sessions when passwords or account status change.
- Keep three account roles. Incharge is a dated academic-class responsibility assigned to a teacher, not a fourth account role or a global flag. Subject teachers receive only their assigned classes and subjects.
- Treat school-wide unique portal IDs as the initial implementation constraint. Store the student's identity independently of enrollment and guardian contacts. Existing data is preserved; migration and historical mapping remain a later, explicit task.
- Default contacts to admin or current incharge access. Teachers get a minimal authorized roster; students get only their own profile. These conservative defaults can be refined when the school settles its permission policies.
- Do not implement attendance ownership, report denominator rules, term management or remark approval by assumption in this milestone. They are recorded as pending in the review.
- Attendance ownership resolved by the user on 2026-09-22: any teacher assigned to the class may enter its daily attendance. This includes the class incharge. Marks remain subject-assignment restricted. The other policy questions above remain open.
- Remark publication resolved by the user on 2026-09-22: an administrator or the assigned class incharge approves parent/student visibility. Parent and student audiences are independently selectable. New remarks default to internal; requested visibility stays pending until reviewed. Every content/audience edit removes approval and requires fresh review. An incharge author still makes an explicit review decision; their role is not automatic approval.
- Tests run against isolated PGlite databases using the same PostgreSQL migration and service code. This does not replace a deployment smoke test, PostgreSQL concurrency test or restore test against the eventual hosted database.

The initial foundation must support secure login/logout/password change, admin account provisioning and reset/deactivation services, a session-aware dashboard, academic structure/enrollment/assignment tables, backend contextual authorization, append-only audit records and meaningful regression tests. Classroom entry and full configuration screens follow this milestone.
