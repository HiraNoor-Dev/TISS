# TISS Student Monitoring and Parent Communication Platform

The application is in [platform](platform/README.md). It includes secure accounts, academic configuration, assignments, students/guardians, tests, bulk marks, attendance, observations, approved remarks, audience-scoped reports, administrator corrections and activity history. WhatsApp remains paused; online hosting is deferred until final acceptance. Old prototype data will not be imported.

- [Refined plan review and roadmap](docs/REFINED_PLAN_REVIEW.md)
- [Foundation implementation decisions](docs/FOUNDATION_DECISIONS.md)
- [Academic administration milestone and walkthrough](docs/ACADEMIC_MANAGEMENT_STATUS.md)
- [Classroom milestone and walkthrough](docs/CLASSROOM_STATUS.md)
- [Remarks and approval walkthrough](docs/REMARKS_STATUS.md)
- [Reporting implementation and limits](docs/REPORTING_STATUS.md)
- [Saved development checkpoint](docs/SESSION_CHECKPOINT.md)
- [School operations, recovery and deployment runbook](docs/OPERATIONS_RUNBOOK.md)
- [Final verification and agreed exclusions](docs/FINAL_VERIFICATION.md)
- [New application setup and verification](platform/README.md)

`frontend/` and `backend/` are the original prototype, preserved for reference. Their known authorization defects remain documented in the review; they are not the new application's backend.

A consistent SQLite backup, source archive and SHA-256 manifest were saved under `.local/backups/20260921-223650/`. The backup passed SQLite integrity checking. `.local/`, databases, dependency folders, build outputs and environment secrets are ignored by Git. A Git repository has been initialized; no commit has been made.
