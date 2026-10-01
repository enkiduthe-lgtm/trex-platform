# Trex Platform

Trex Platform is the operational core for Trex Tea. V1 contains a NestJS API, PostgreSQL and Redis/BullMQ readiness, controlled SQL migrations, database-backed sessions, RBAC, and initial Next.js storefront, admin, and dealer applications.

Production storefront: [`https://www.trextea.com.tr`](https://www.trextea.com.tr). The root domain redirects to `www`; DNS verification and HTTPS certificate issuance are complete.

`render.yaml` deploys the public storefront to Render's Frankfurt region from the `main` branch. It intentionally does not deploy the API, admin, dealer, payment, or shipping services until their production credentials and database/queue validation are available.

The Render build explicitly includes development dependencies because Next.js needs TypeScript type packages while compiling the storefront; the running service still uses `NODE_ENV=production`.

The first public storefront is now scaffolded under `apps/web`. Run `npm run dev:web` to view it locally at `http://localhost:3001`. Its product cards are deliberately placeholder content until the live API/product data integration is enabled.

When the API gets its own production address, set `TREX_API_URL` in the storefront service. Product listing and product detail pages will then read only active products from `GET /v1/products`; if the API is unavailable, the storefront safely keeps its current placeholder catalogue online.

The storefront routes currently include `/`, `/urunler`, `/urunler/:slug`, `/sepet`, `/hesabim`, `/hesabim/siparisler`, `/yasal`, and `/club`. Cart persistence, sign-in, checkout, and live legal content become available when the API/Redis/PostgreSQL services are connected. Trex Club is intentionally separate: its water-tracking records stay only in the visitor's browser and are never sent to the platform.

The initial storefront cart is browser-local and lets visitors add, change, and remove catalogue products before the live cart API is connected. It never creates an order or accepts payment; checkout remains intentionally disabled until the secured API, stock reservation, payment provider, and shipping provider are live.

The storefront header shows the browser-local cart count. The home selection, listing, and product detail pages all use the same API-ready product source, preventing storefront pages from drifting apart when live products are enabled.

The storefront also has a customer-friendly not-found route and a fallback error screen, so unavailable product/content links do not expose framework errors.

The initial dealer portal is in `apps/dealer` and starts locally with `npm run dev:dealer` on port 3003. It will connect to the existing dealer hierarchy, pricing, order, and commission API modules.

The initial admin dashboard is in `apps/admin` and starts with `npm run dev:admin` on port 3002. It includes dashboard, product-management, order-operation, inventory/warehouse, dealer-management, and finance routes as API-ready user interface shells.

Customer CRM notes are modeled in migration `017_customer_notes.sql`; the initial admin customer screen is available at `/musteriler`.

Campaigns and coupons are modeled in migration `018_campaigns.sql`; the initial management screen is `/kampanyalar`.

The admin media guide at `/medya` lists the required asset dimensions, formats, and usage guidance for each storefront placement. It can validate a selected local image now; permanent binary storage awaits the selected storage provider and CMS asset API connection.

Permanent media uploads use Cloudflare R2 when its server-side secrets are configured. `POST /v1/admin/assets/upload` accepts a single administrator-uploaded image (field name: `file`) plus its `placement`, stores it in R2, and records only its metadata/public URL in PostgreSQL. The required owner-side setup and the exact Render secret names are documented in [docs/MEDIA_STORAGE_SETUP.md](docs/MEDIA_STORAGE_SETUP.md); no credential belongs in Git or chat.

The mock asset-record endpoint is `POST /v1/admin/assets/mock`; it requires an admin access token and records metadata only. Actual binary uploads await a chosen storage provider.

## Run locally

1. Copy `.env.example` to `.env` and replace `JWT_SECRET`.
2. Start PostgreSQL and Redis: `docker compose up -d postgres redis`.
3. Install dependencies: `npm install`.
4. Apply schema migrations: `npm run db:migrate`.
5. Start the API: `npm run dev`.

When Docker Desktop is available, `docker compose up --build` starts PostgreSQL, Redis, and the API together. Apply migrations once with `npm run db:migrate` before using API routes.

Health is available at `GET http://localhost:3000/v1/health` (PostgreSQL + Redis job queue readiness) and liveness at `GET /v1/health/live` (process alive only).

The API image can be built from `apps/api/Dockerfile`. CI runs lint, compilation, and unit tests on every push and pull request. Production prerequisites are tracked in [docs/PRODUCTION_BLOCKERS.md](docs/PRODUCTION_BLOCKERS.md).

Başlangıçta ayar denetimi yapılır: veritabanı, Redis ve en az 32 karakterlik benzersiz JWT anahtarı zorunludur. Canlı ortamda `mock` ödeme/kargo sağlayıcıları veya `*` CORS ayarıyla başlatma engellenir.

Mock ödeme, kargo ve bildirim uçları, ikinci bir koruma olarak `NODE_ENV=production` ortamında istek kabul etmez. Gerçek sağlayıcı adaptörleri ve imzalı geri çağrılar eklenmeden API canlı satış için açılmaz.

Yönetici kampanya ve kupon işlemleri, işlem yapan yönetici ile birlikte denetim günlüğüne kaydedilir.

The latest local verification evidence and remaining environment checks are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the API |
| `npm run test` | Unit tests |
| `npm run test:e2e` | HTTP integration tests |
| `npm run lint` | Lint TypeScript |
| `npm run db:migrate` | Apply immutable SQL migrations |
| `npm run db:migrate:status` | Show applied/pending migrations |

## Authentication and roles

`POST /v1/auth/login` accepts email and password, creates a database-backed session, and returns a short-lived access token. The refresh/session token is delivered only as an `HttpOnly`, `Secure` (outside development), `SameSite=Lax` cookie. `POST /v1/auth/refresh` rotates the session; `POST /v1/auth/logout` revokes it. All session tokens are stored as SHA-256 hashes, never plaintext.

Roles defined now: `SUPER_ADMIN`, `ADMIN`, `WAREHOUSE`, `FINANCE`, `DEALER`, `CUSTOMER`. `GET /v1/auth/me` requires a valid bearer token; `GET /v1/admin/ping` demonstrates the admin boundary.

Public registration is intentionally absent. The first `SUPER_ADMIN` is created with the audited bootstrap command described below.

After migrations have run, create the first administrator once by setting `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in your local environment, then run `npm run bootstrap:admin`. It refuses passwords shorter than 12 characters, writes an Argon2id hash only, creates an audit record, and makes no change if that email already exists.

## Product API (first V1 module)

`GET /v1/products` lists active products; `GET /v1/products/:slug` returns an active product. Admin and super-admin roles can use `GET/POST /v1/admin/products` and `PATCH /v1/admin/products/:id`. Product changes are audited; SKU, barcode (when supplied), and slug are unique. Updates require the current `version`, preventing a user from silently overwriting someone else's edit.

Admins can also submit up to 250 product identities in one all-or-nothing request to `POST /v1/admin/products/import`. The request format and field rules are in [docs/PRODUCT_IMPORT_FORMAT.md](docs/PRODUCT_IMPORT_FORMAT.md). Prices, inventory, and media are deliberately excluded from this first import, so one catalogue upload cannot accidentally alter financial or warehouse data.

## Pricing API

Admins use `POST /v1/admin/prices` to create time-bounded TRY price rules. Resolution uses the fixed order: a dealer-specific price, then dealer-level price, then sales-channel price, then global price. `GET /v1/products/:id/price?channel=PUBLIC_WEB` resolves the effective price and returns its source and rule identifier; this data is designed to be snapshotted by the future checkout module rather than trusted from the browser.

## Inventory API

Inventory is tracked by product and warehouse. Warehouse users can record positive stock adjustments at `POST /v1/inventory/adjustments`. The checkout-reservation endpoint is currently restricted to administrative/internal callers: it locks the inventory row, verifies `physical − reserved`, increments only the reserved quantity, and records a time-limited reservation in one transaction. This is the base protection against overselling; fulfillment and reservation-release jobs arrive with checkout and warehouse workflows.

## Cart API

Guest carts use an opaque, random client key; the server stores only its SHA-256 hash. `POST /v1/carts/guest` creates a cart, `POST /v1/carts/:id/items` adds an active product, and `GET /v1/carts/:id` resolves its current server-side prices. Browser-provided prices are never accepted.

## Checkout foundation

`POST /v1/checkout` requires a cart ID, its guest key, a warehouse, delivery address, and an `Idempotency-Key` header. In one PostgreSQL transaction it rechecks active products and server-side prices, locks stock rows, reserves stock, snapshots line items, then writes an expiring checkout record. Orders and payment capture will be created only after payment verification; no browser amount is trusted.

## Payments (mock/sandbox)

`POST /v1/payments/initialize` creates an internal payment attempt for an open checkout. `POST /v1/payments/:id/verify` is a development-only mock verification flow; on success it creates the order from immutable checkout snapshots. No PAN, CVV, or card data is accepted or stored. Before release, a chosen payment provider, production credentials, callback URL, signed-webhook verification, and sandbox acceptance tests are required.

## Shipping (mock/sandbox)

Warehouse and admin roles can create a shipment for a paid order at `POST /v1/admin/orders/:id/shipment`. The mock adapter returns a tracking number and records the provider event. Provider failure is persisted as `FAILED` while the order remains intact, so a retry is safe. The production Aras adapter needs the contracted API credentials, service specification, pickup configuration, and sandbox validation.

## Dealer hierarchy

Admins create pending dealers with `POST /v1/admin/dealers` and set a parent via `PATCH /v1/admin/dealers/:id/parent`. A dealer may only use an active parent; self-parenting and descendant-as-parent cycles are rejected. Dealer levels and price targeting are already represented in the pricing schema. Bank account creation and payout workflows follow with the commission module.

## Returns foundation

`POST /v1/returns` records a return request against eligible paid/delivered orders and checks requested quantities against immutable order items. Admin or warehouse roles can record the inspection outcome. Refund, returned-stock receipt, commission reversal, and financial ledger entries must occur as one controlled saga in the next finance/commission stage; they are intentionally not triggered solely by a return request.

## Commission and finance foundation

Commission rules are fixed TRY-per-unit amounts only—no percentage calculation. Finance/admin roles create rules at `POST /v1/admin/commissions/rules`; confirmed entries may be reversed when an accepted return flows through its final saga. Payout batches and append-only financial ledger tables are included for the upcoming settlement workflow. The “after the 20th” payout policy is represented by the scheduled batch date and will be enforced when bank transfer adapters are selected.

## Notifications (mock/sandbox)

Admin users can create a mock notification at `POST /v1/admin/notifications`. Its outbound content and status are persisted, and a mock provider reference is recorded; no real SMS or email is sent. Production delivery needs a chosen provider, credentials, sender identity, consent policy, and delivery callback handling.

## CMS and legal foundation

Pages are versioned and are visible publicly only after an admin publishes them. Legal documents use immutable code/version pairs and record user acceptances, ready for checkout integration. Public page read: `GET /v1/pages/:slug`; admin page creation/publishing uses `/v1/admin/pages`.

Editors create a new revision at `POST /v1/admin/pages/:id/revisions`, then publish it deliberately. A published page always serves its specifically published revision, so saving a later draft never changes what visitors see.

## Warehouse operations foundation

Picking and packing schemas retain the expected quantities, operator assignment, barcode scans, and completion state. A service creates a pick session only from a paid order; the warehouse UI and scan endpoints will use these records when the administration frontend is enabled.

## External services

Payment and Aras Shipping are intentionally not wired to production. Configuration defaults to `mock`; provider credentials, merchant agreements, callback URLs, and sandbox acceptance tests remain blockers before their production adapters can be enabled. Redis is available for BullMQ workers but no business job is scheduled yet.

## Database discipline

Migrations live in `apps/api/migrations`, run in filename order, and their SHA-256 checksum is recorded. Applied migration files must never be edited. Add a new numbered SQL file for every schema change.
### Kampanyalar ve kuponlar

Yönetici, kampanyayı taslak olarak oluşturabilir, aktif/pasif yapabilir ve sabit TL veya yüzde indirimli kupon ekleyebilir. Bu uçlar yalnızca yönetici oturumu ile kullanılabilir. Yüzde kuponlar %100'ü geçemez; tarih aralığı da bitişi başlangıçtan sonra olacak şekilde doğrulanır. Siparişe kuponu uygulayan ekran, gerçek ödeme ve sipariş akışı tamamlandığında bu kayıtlarla bağlanacaktır.

Mağaza, ödeme öncesinde `POST /v1/coupons/preview` ile kupon kodu ve ara toplamı doğrulayabilir. Bu çağrı yalnızca tahmindir: kullanım adedi sipariş/ödeme kesinleşene dek artmaz; böylece müşteri sayfayı yenilediğinde kupon tüketilmez.

`POST /v1/checkout` isteğine isteğe bağlı `couponCode` eklenebilir. API indirimli toplamı kendi hesaplar, kuponu ödeme tamamlanana kadar tüketmez ve başarılı ödeme ile birlikte tek işlemde kullanım kaydını oluşturur. Gerçek ödeme sağlayıcısı bağlanırken, sağlayıcının yetkilendirme/iptal akışı bu kupon adımıyla birlikte uçtan uca test edilmelidir.

Misafir sepeti istekleri için, sepet oluşturulurken verilen `guestKey` değeri `X-Guest-Key` başlığıyla gönderilmelidir. Ödeme başlatma isteği de aynı `guestKey` değerini gerektirir. Böylece tek başına sepet veya ödeme kimliğini bilen biri müşteri verilerine erişemez.
