# Verification status

## Verified locally

- NestJS API TypeScript compilation passes. (The Nest production compiler is currently incompatible with the locally installed Node.js 24 runtime; see the note below.)
- Jest: 18 test suites and 26 unit tests pass, including campaign/kupon, indirimli ödeme akışı, and mock-provider production safeguards.
- Storefront TypeScript compilation passes.
- Admin dashboard TypeScript compilation passes.
- Dealer portal TypeScript compilation passes.
- Local previews are available on ports 3001 (store), 3002 (admin), and 3003 (dealer).
- The public storefront has been deployed to Render at `https://trex-storefront.onrender.com`.

## Still required before production

- Start PostgreSQL and Redis, then run all SQL migrations against a real database.
- API HTTP integration and end-to-end tests with the database and Redis running.
- A production payment provider, signed callback verification, and sandbox acceptance tests.
- Aras Cargo credentials and sandbox label/tracking validation.
- SMS/email provider credentials and consent/delivery callback testing.
- DNS records and HTTPS verification for `www.trextea.com.tr` (Render is ready; DNS record management is unavailable in the current Natro plan).

Docker Desktop cannot start on the current computer because its required Windows virtualization features are unavailable despite CPU virtualization being enabled. This prevents local PostgreSQL/Redis verification, not frontend previews or API unit tests.

The installed Nest CLI version emits `host.onUnRecoverableConfigFileDiagnostic is not a function` under Node.js 24 while production-building. API TypeScript type checking is clean; use an active Node.js 22 LTS runtime for the production build until the dependency set is upgraded and reverified.

When Docker is available, `docker compose up --build` starts the API together with PostgreSQL and Redis; migrations remain an explicit step so schema changes are visible and auditable.
