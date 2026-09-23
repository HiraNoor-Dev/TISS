# Reporting milestone

Reporting resumed at the user's request; manual WhatsApp sharing remains paused.

Dashboard → Reports provides student overall, parent-friendly, and class marks/attendance reports. Students receive only their own report; administrators/incharges can view whole-student and parent reports; subject teachers can view class marks for their assigned subject. All views use the same server report service and inclusive custom dates, academic-year and current-month presets.

Marks show per-test percentages only for Present results. Absent, Not Attempted and Not Recorded remain distinct. Attendance shows Present/Absent/Leave counts and missing entries on saved class sheets. Days with no class sheet are not counted; no attendance percentage, grade average or term policy is invented.

Staff overall reports include observation history. Observation notes remain staff-only because they have no publication approval flag. Parent/student projections contain only remarks approved for that specific audience, without review notes, guardian contacts or other students' information. Parent view is a report preview, not a send action.

Reports are generated dynamically from existing records; no migration or duplicated report data is needed. Maximum date span: 551 inclusive days. Class rosters cap at 1,000 students, marks sheets at 5,000 rows and each observation/remark history at 2,000 rows; oversized reports request a narrower period rather than silently truncate.

Automated coverage extends existing classroom and remarks suites: 501-student marks sheet, self-only reads, subject permissions, period filtering, real zero/missing values, staff-only observations and parent/student remark isolation.

The current full suite has 37 passing integration tests, including the subsequent administrator correction tests. Reporting itself requires no migration. Tests used isolated data only.

Production build passed, including `/reports`. On 23 September, a synthetic student browser session generated its own marks, attendance and approved remarks, with no staff observation notes. Visual review at 390px found and fixed table-induced page overflow; now only the marks table scrolls horizontally. A real-school/device acceptance pilot remains necessary before deployment.
