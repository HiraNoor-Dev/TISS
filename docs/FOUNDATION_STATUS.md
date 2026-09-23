# Foundation milestone status

Implemented in `platform/` on 21 September 2026. This is a foundation milestone, not the complete refined-plan MVP.

## Verification results

- PostgreSQL-compatible migration/integration suite: 12 groups passed (13 tests including the parent test). Uses synthetic records in isolated PGlite, actual Drizzle migrations, production services and the HTTP handler.
- TypeScript: passed.
- Next.js 16.3.5 production build: passed. App pages, protected dashboard, roster and API routes compiled successfully.
- Browser smoke check: login page rendered; phone-sized layout inspected at 390 × 844. Desktop DOM bounds at 1280 pixels confirmed the heading and form fit without horizontal document overflow. A full desktop screenshot could not be captured by the browser tool. Authenticated browser workflows are not yet verified against a live PostgreSQL instance.
- Baseline preservation: compared the source archive against the original files; no archived prototype or plan files were changed.
- Dependencies: npm audit reported four moderate development-tool advisories from the Drizzle Kit/esbuild loader chain, with no production dependency advisories reported. The setup guide documents this limitation.

## Remaining before live use

1. Provision a separate PostgreSQL database, configure `.env.local`, run migrations and bootstrap the administrator using the setup guide. No live database credentials or admin password were chosen during implementation.
2. Verify migrations and multi-connection behavior on that PostgreSQL deployment. Test TLS, runtime database privileges, backups and restoration.
3. Implement academic configuration, guardian/enrollment administration and admin-controlled assignments. Tables and access policies exist, but configuration screens and write services are the next milestone.
4. Implement classroom operations, audience-aware reports and manual WhatsApp sharing. None of the unsafe prototype routes are reused by the new application.
5. Verify authenticated desktop/mobile flows and run the one-class school pilot after the full workflow exists.

Open school-policy decisions remain recorded in `REFINED_PLAN_REVIEW.md`. Student IDs and history are preserved by the new model; no attempt has been made to infer old academic years from prototype records.
