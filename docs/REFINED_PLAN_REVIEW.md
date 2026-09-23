# Refined plan and prototype review

Reviewed on 21 September 2026 against **Student Monitoring and Parent Communication Platform.docx**, all 49 numbered sections, the final development position, and the example table.

The prototype demonstrates the intended classroom-to-parent workflow, but its authorization and data model do not satisfy the refined plan. Treat it as a workflow reference. Implement the refined foundation before extending classroom features or using real student data. This review changes no application source or existing database records.

## Review evidence and limits

- Inspected the database schema, database adapter, seed script, authentication and authorization middleware, all eight route modules, and the frontend pages, components, context, API client and configuration.
- Ran `node docs/review/verify-prototype.cjs`: twelve defect reproductions and one positive access-control check passed. The harness loads the existing Express routes and middleware against a synthetic in-memory SQLite database; it does not load the production database adapter or seed script. Passing these checks confirms defective prototype behavior, not readiness for release.
- The frontend production build passed with Vite 5.4.21 and 1,568 transformed modules. Output is isolated in `docs/review/build-check`. Initial execution was blocked by sandbox subprocess restrictions; the approved retry succeeded.
- No browser interaction, mobile visual verification, concurrency/load test, deployed security inspection, backup restore, or live-data integrity audit was performed. Database schema findings concern the source schema. No claim is made about the contents or sensitivity of the existing database.
- No Git repository was detected in this workspace. Preserve a versioned baseline before implementation.

## Findings requiring attention first

### 1 Student and guardian information is accessible outside the permitted scope

**Critical — plan sections 3, 14, 27 and 28.** `backend/routes/students.js:9` and `:28` require authentication but no role or class authorization. A student account can retrieve the school roster, including other students' parent phone numbers. `backend/routes/reports.js:109` lets the same account generate another student's WhatsApp summary. Both were reproduced. The own-student check on `reports.js:7` works, but is not applied consistently to other routes.

Tests, test results, attendance and cleanliness reads also lack contextual authorization. Teacher report access is unrestricted by assignment. Required change: authorize every resource request and project only the fields permitted for the requesting role, assignment and audience. Student access must be self-only across every endpoint, including communication routes.

### 2 Assignments and incharge responsibilities do not restrict writes

**Critical — sections 3, 9, 14 and 27.** Teachers self-assign through `backend/routes/classes.js:46`. Classroom writes check only teacher/admin role, not class, subject or year. A result can reference a student outside the test class. The global incharge flag in `backend/middleware/rbac.js:19` allows student management throughout the school. Self-assignment, cross-class marks and unrestricted incharge deactivation were reproduced.

Required change: admin-managed teaching assignments and a separate class/year incharge relationship. Validate all submitted students against the authorized enrollment context. Routine administrator work and authorized corrections need distinct permissions; the plan says administrators should not normally enter classroom records.

### 3 Account deactivation and session lifecycle are incomplete

**High — sections 10–13.** `backend/routes/auth.js:9` does not check staff account status. Student login checks student status but not linked user status. Existing JWTs remain valid without a fresh account/status check. Inactive teacher login and use of an existing token were reproduced.

`backend/middleware/auth.js:3` also has a hard-coded signing-secret fallback. This is exploitable if deployment relies on the fallback; actual deployment configuration was not inspected. `frontend/src/context/AuthContext.jsx` stores tokens in localStorage and logout only removes local values. Password change, first-login reset, administrative reset and login rate limiting are absent from the supplied implementation. Shared demo credentials appear in the seed and landing page.

Required change: implement the plan's preferred server-managed sessions, secure HTTP-only production cookies, expiry, revocation, account status enforcement, CSRF protection as applicable, temporary credentials and reset flows. Keep demo accounts confined to development.

### 4 New test marks entry has no usable student identity

**High — sections 18–19.** `backend/routes/marks.js:79` selects `tr.*` from a left join without selecting `s.id AS student_id`. Students without a result therefore have a null student ID. The frontend uses that value for React keys, updates and save payloads in `TeacherDashboard.jsx:189` and `:198`.

The null ID was reproduced. From the frontend code, editing one null-ID row can update every null-ID row; saving populated rows then fails the result's non-null student constraint. Seeded results obscure this defect. Required change: always return the enrollment/student identity from the roster side and verify the full new-test workflow using a class with no pre-existing results.

### 5 Bulk operations can partially save and accept inconsistent context

**High — sections 19, 20 and 30.** `backend/routes/marks.js:94` validates and saves one row at a time without a transaction. A later invalid row returns an error after earlier rows have persisted; reproduced with a valid mark followed by an above-total mark. Attendance and cleanliness also lack transactions. Attendance silently ignores `leave` while returning success; reproduced.

Required change: validate the entire payload, reject duplicate/invalid IDs and unexpected statuses, authorize the whole context, then transact records and audit changes atomically. Enforce finite numbers, bounds, valid dates, enrollment membership and test/result consistency. Student/account creation and profile updates also need transactions. Existing username reuse during student creation must not attach an arbitrary existing account.

### 6 The schema cannot preserve the required academic history

**High — sections 5–9, 24 and 29.** `backend/database/schema.sql` stores the current class and a single phone number directly on each student. It has no academic years, enrollments, separate grades/sections, subject catalog, guardians or class-incharge assignments. Assignments use free-text subjects. Editing a student's class changes the class shown alongside historical records; historical test rosters are queried from current active students.

Required change: normalize these entities and relate classroom records to historical academic context. Avoid destructive cascades for retained academic history. A migration cannot reconstruct past enrollments, guardian names or years that were never recorded; these need explicit mapping or review, not invented values.

### 7 Remarks have no audience boundary

**High — sections 22–25 and 28.** The remarks table has no visibility or update field. Student reports return all remarks; parent summaries select the latest remarks without approval/visibility filtering. Per-result remarks are also exposed to students and need a defined audience policy.

Required change: enforce internal, parent and student visibility server-side, with consistent report projections. The document mentions approved remarks but does not define a separate approval workflow; settle that policy before adding one. Existing remarks must not be assumed approved for external sharing during migration.

### 8 Repeated observation saves duplicate records and reports invent positive results

**High — sections 21, 23 and 30.** Cleanliness save always inserts new rows; saving twice duplicates the observation, reproduced. The UI defaults every student to Neat and saves the whole roster. Reports return 100% attendance and Neat cleanliness when no records exist (`backend/routes/reports.js:42`, `:71`, `:134`); reproduced.

Required change: implement periodic/exception-based observations with categories and ratings, clear update/retry behavior, and bulk entry of intentional observations only. Missing records must display “No records” rather than implying an assessment or attendance result. Define attendance denominators and assessment-status treatment explicitly.

## Coverage against the complete plan

“Partial” describes useful existing behavior, not permission or production readiness. Section references cover every numbered section of the source plan.

| Plan sections | Area | Prototype assessment | Required direction |
| --- | --- | --- | --- |
| 1–2, 45, 49 | Purpose, principles and success | Partial workflow; branding emphasizes school management; adoption unmeasured | Use the refined product purpose and measurable pilot criteria |
| 3 | Accounts and incharge access | Three roles exist; incharge is a teacher flag but has no class scope | Contextual responsibilities, self-only student reads, lifecycle statuses |
| 4 | Parent access strategy | Aligned: no separate parent portal | Keep reviewed manual WhatsApp communication |
| 5–8 | Structure, years and identity | Internal student key and unique roll exist; structure/history incomplete | Years, dynamic divisions/grades/sections and enrollment history |
| 9 | Teaching assignments | Partial joins, free-text subject, teacher self-assignment | Admin-managed teacher/subject/class/year records |
| 10–13 | Login, provisioning and sessions | Password hashing and password login exist; extra division selector; lifecycle missing | Minimal login, server sessions, forced initial change and resets |
| 14, 27–28, 34 | Authorization and privacy | Role checks exist; resource/field restrictions incomplete | Central server policies with assignment and audience context |
| 15–17 | Dashboard and workspace | Class/subject selection and module tabs exist | Only authorized responsibilities, junior class grouping, recent/pending work |
| 18–19 | Bulk assessments | Separate tests/results and mark bounds exist; fresh results broken | Reliable new-test roster, result statuses, atomic writes |
| 20 | Attendance | Bulk daily entry defaults Present; uniqueness exists | Leave, context checks, atomic updates and missing-data semantics |
| 21–22 | Observations and remarks | Narrow cleanliness and generic remarks exist | Broader categories, deliberate observations, visibility and timestamps |
| 23–25 | Reports, guardians and WhatsApp | Dynamic report and manual preview/open exist | Guardians, consistent period filters, audience-safe summary |
| 26 | Administration | Student create/edit/deactivate screen only | Configure teachers, accounts, structure, subjects, assignments, reports and activity |
| 29–30 | Database and integrity | Relational SQLite with several keys/indexes; missing entities/transactions | PostgreSQL target, migrations, constraints, audit data and historical context |
| 31–32 | Scale and backend boundaries | Single process is appropriate; SQL/business rules live in routes | Modular services, pagination, bounded queries; no microservices |
| 33 | Technology | React/Vite JavaScript, Express and SQLite | Plan recommends Next.js/TypeScript, PostgreSQL, Prisma or Drizzle, Zod/equivalent |
| 35–36 | UX and mobile | Some responsive classes/loading/empty states; bulk tables scroll horizontally | Intentional mobile entry, saving/error/retry states and safe context switching |
| 37 | Operational reporting | Student summary and test results exist; no period-aware report suite | Class marks, attendance, observation and parent reports; defer advanced analytics |
| 38–39 | Audits and recovery | No audit-log model or supplied backup/restore workflow | Append-only change history and automated, restore-tested backups |
| 40–41 | MVP and exclusions | Real backend supports much of example flow; excluded ERP features absent | Complete one correct class workflow with enough admin configuration |
| 42–44 | Deployment, maintenance and adoption | No supplied deployment/runbook/pilot evidence | Separate environments, routine admin tools, controlled school pilot |
| 46 | Future expansion | Mostly absent, appropriately | Keep PDF/export, parent portal, automation and AI outside initial scope |
| 47–48 | Roadmap and architecture | Prototype predates target foundation | Follow phased modular monolith roadmap and PostgreSQL architecture |

## What to retain and what to replace

Retain the broad class-workspace workflow, bulk attendance interaction, separate tests/results concept, immutable internal student identity, password hashing concept, dynamic report generation, and manual WhatsApp preview/open interaction. Tailwind styling and useful React presentation fragments can inform the new interface after mobile verification.

Replace the schema foundation, authentication/session flow, resource authorization, self-assignment flow and global incharge permission. Rework classroom writes, reports and administrative tooling around that foundation. The 1,000-plus-line teacher dashboard should be split by module and workspace context. It currently retains old selected-student state when switching to an empty class and has no cancellation/protection against stale fetch responses; context changes need to clear state and prevent saving against mismatched data.

The document calls Next.js/TypeScript and PostgreSQL the recommended stack, and explicitly leaves Prisma versus Drizzle to the development team. Those are different from mandatory product rules. Following the user's requested direction, use that recommended architecture as the implementation baseline; document the ORM decision before setup. No framework-version choice or package migration was attempted in this review.

## Implementation sequence and completion gates

1. **Preserve the baseline and finalize domain rules.** Establish version control and a consistent database backup if existing data is to be retained. Because SQLite WAL files are present, use a database-aware backup rather than copying only the main file during writes. Record a requirement-to-test checklist and resolve the policy decisions below.
2. **Build technical foundation and security.** Set up the selected Next.js/TypeScript application, PostgreSQL schema/migrations, validation, users/roles/permissions and server sessions. Implement status enforcement and credential lifecycle. Gate: student/teacher/admin access matrix passes, including direct resource requests and revoked sessions.
3. **Build academic structure and minimum administration.** Add years, divisions, grades, sections, subject catalog, teacher profiles, students, guardians, enrollment, teaching and incharge assignments. Bring enough admin configuration into this phase to avoid developer-created operational records. Gate: an administrator configures the pilot class, and promotion preserves the prior year's records.
4. **Build the complete teacher workflow.** Authorized dashboard/workspace, roster, new tests, bulk marks/statuses, daily attendance with Leave, observations and visible remarks. Audit changes from the start. Gate: new tests save correctly, invalid bulk requests leave no writes, cross-class requests fail, repeat saves are safe, and switching class never retains editable data from the prior class.
5. **Build reporting and communication.** Reuse one report service with period and audience policies for student, staff and parent outputs. Add guardian selection and manual WhatsApp preview/open. Gate: internal notes and unauthorized contacts cannot enter external outputs; summary dates and totals match the selected period; no automatic send.
6. **Complete administration and reliability.** Lifecycle operations, authorized corrections, account/assignment management, operational reports, audit viewing, pagination and error recovery. Configure automated backups and document a successful restore. Gate: routine school changes need no database editing, mobile workflows are verified, and realistic 500+ student data is tested.
7. **Run the one-class pilot, then widen deployment.** Measure attendance and marks entry time against the current process, errors, missing records, teacher adoption and parent-summary usefulness. Resolve observed issues before import/training and school-wide rollout.

Security, validation and auditability should be implemented alongside each feature; the later reliability phase verifies them rather than postponing them. This is consistent with the plan's foundation-first requirements.

## Policy decisions the document leaves open

These are inputs for implementation, not defects in the prototype or assumptions already approved by the school.

| Decision | Why it matters | Suggested starting position for discussion |
| --- | --- | --- |
| Existing database: demo or records to preserve? | Determines migration and reconciliation work | Preserve until the user confirms data is disposable |
| Roll-number uniqueness and reuse | Plan explicitly leaves final uniqueness policy to the school | Stable school-wide unique portal ID; clarify whether displayed class rolls differ |
| Daily attendance ownership | Multiple subject teachers share one class, but the plan does not assign the recorder | Incharge or explicitly designated teacher; authorized admin corrections |
| Contact and whole-report access | Subject teachers must not automatically see all administrative detail | Explicit permission for contacts/sharing; incharge and admin as initial candidates |
| Remark visibility and approval | “Approved remarks” and three visibility audiences lack an approval protocol | Internal default; define who may publish and whether parent/student visibility may coexist |
| Year dates, transfers and corrections | Controls current enrollments, history and who may edit prior periods | Explicit dated enrollments and separately authorized historical corrections |
| Term filters | Section 23 includes term filters, but section 46 defers term management | Agree MVP date/month/year filtering versus a minimal configured term date range |
| Leave and assessment statuses in totals | No denominator or grading policy is specified | Display counts/statuses distinctly and agree calculation rules before reporting |
| Deletion/retention and reset identity checks | Production operational rules remain unspecified | Preserve history; document controlled reset and retention procedures |

## Reproduction notes

Run `node docs/review/verify-prototype.cjs` from the workspace root using the installed backend dependencies. It makes local HTTP requests only to its own ephemeral loopback server, uses synthetic credentials and records, and closes its in-memory database afterward. It does not send messages or open WhatsApp.

After implementation, these defect-confirming checks should be replaced or inverted into regression tests for the intended behavior. The single positive control already expects another student's overall-report request to be rejected. A passing frontend build only proves the bundle compiles; it does not negate the reproduced runtime and authorization defects.
