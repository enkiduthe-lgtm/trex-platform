# Trex Platform — Production blockers

The source tree supports mock/sandbox adapters only until these items are supplied and verified.

| Area | Required before production | Current mode |
| --- | --- | --- |
| Payment | Provider agreement, sandbox/prod API credentials, callback URL, signature validation test | mock (programmatically disabled under production) |
| Aras Cargo | Customer code, API credential, pickup configuration, sandbox labels/tracking test | mock (programmatically disabled under production) |
| SMS/email | Provider, sender identity, consent policy, credentials, callback processing | mock (programmatically disabled under production) |
| Hosting | PostgreSQL with backups/PITR, Redis, secret store, monitoring | public storefront is live on Render and `https://www.trextea.com.tr` is verified through Cloudflare DNS |
| Media storage | Cloudflare R2 bucket, restricted API key, public-media domain, upload/rollback test | media guide and client-side validation are ready; permanent upload is blocked until R2 is activated |
| Data | Reviewed product, price, inventory, customer/dealer imports | empty schema |
| Release | Green CI, migration rehearsal, UAT, security review, rollback plan | not verified |

No card PAN or CVV is stored by the platform. Do not put any credentials in Git or `.env.example`.
