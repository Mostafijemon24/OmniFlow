# OmniFlow — Creator OS

A production-shaped Creator OS that combines a **digital bio-link store** with a **comment-to-inbox Auto-DM engine** for Instagram and Facebook. Every flow is backed by real persistence, real file delivery, and the official Meta Graph API — there is no seeded demo data and no mocked behaviour anywhere in the app.

Payments exist to sell OmniFlow plans to creators. **Selling creator products through a payment gateway is not enabled yet**: free products are delivered end to end, and paid products show as not purchasable. See [What is not built yet](#what-is-not-built-yet).

## Stack

- Next.js 14 (App Router), React 18, Tailwind CSS
- Prisma ORM — SQLite locally, PostgreSQL-ready
- NextAuth with JWT sessions: email + password, and Facebook once the admin configures it
- Stripe Checkout for OmniFlow plan subscriptions, plus a manually verified bKash flow
- Meta Graph API: OAuth, page subscriptions, signed webhooks, `private_replies`
- Resend for automated delivery email
- Local file storage with expiring, download-limited links

## Getting started

```bash
npm install
cp .env.example .env      # then edit the secrets, including SUPER_ADMIN_EMAIL
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and register the first creator account. The database starts empty by design.

### Required environment values

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file locally, Postgres URL in production |
| `NEXTAUTH_SECRET` | Session signing |
| `ENCRYPTION_KEY` | AES-256-GCM key for platform gateway credentials and Meta page tokens. Minimum 32 characters; the app refuses to encrypt without it |
| `NEXT_PUBLIC_APP_URL` | Public origin used in checkout links and Auto-DM messages |
| `SUPER_ADMIN_EMAIL` | Designates the platform administrator. Empty means nobody is an admin |

`STRIPE_WEBHOOK_SECRET` is the only other environment value that matters, and only if you use Stripe. Everything else — the Stripe secret key, the plan price IDs, the bKash number, the Meta app credentials — is configured through the admin UI, because a running server cannot write to its own `.env`.

## What a fresh install looks like

Before anyone configures anything:

- Registration, login, the bio store builder, products, Auto-DM rules, the matcher testbench, the orders CRM and analytics all work.
- **Free** products can be bought, delivered and downloaded end to end.
- **Paid** products display as "Not available for purchase yet" and `/api/checkout` refuses them with `gateway_unavailable`.
- Plan checkout says no payment method is available. Accounts keep working on their current limits.
- **Connections** says Instagram and Facebook are not available yet. Rules can still be written and tested; they start firing once a page is connected.
- The Facebook sign-in button is absent, because the provider does not exist until the connector is configured.
- Delivery emails record `unconfigured` rather than failing the order.

None of these are error states. They are the honest default of an unconfigured platform.

## Super admin

The administrator is whoever registers with the address in `SUPER_ADMIN_EMAIL`. The role is not a database column and cannot be granted through any API, so it cannot be escalated into.

- **Dashboard → Platform Setup** (`/dashboard/admin`) configures Stripe, bKash and the Meta connector, each with its own enable switch.
- **Platform Setup → Manual payment queue** (`/dashboard/admin/payments`) is where bKash transfers are verified.
- Both the pages and `/api/admin/*` answer **404** to everyone else, so the endpoints do not advertise themselves. Middleware gates them from the JWT; every route additionally re-reads the account from the database through `requireSuperAdmin()`, which is the real boundary.

Ordinary creators never see gateway credentials and have no gateway settings of their own.

## How each module works

### Bio store builder
Profile fields save on blur. Cover art and avatars upload to `storage/public` and are served through `/api/files/[key]`; deliverables go to `storage/private`, which nothing serves without a valid download token. Every upload is recorded against the creator who made it, so a product or profile can only reference that creator's own files. Products are typed: a **digital file** requires an uploaded deliverable, a **consultation** requires a meeting link plus bookable slots. Product limits are enforced per plan, and products that already have orders are archived rather than deleted so buyer history stays intact.

### Comment Auto-DM engine
1. The admin configures the platform's Meta app once under Platform Setup.
2. A creator connects their own page at **Dashboard → Connections** (`/api/meta/oauth/start`). OmniFlow exchanges the code for a long-lived token, stores each page token encrypted, and lists Instagram business accounts. A page already connected to another account is refused rather than moved.
3. Press **Subscribe** to call `POST /{page-id}/subscribed_apps` so Meta starts delivering comment webhooks.
4. `POST /api/webhooks/meta` verifies the `x-hub-signature-256` HMAC with a timing-safe comparison, deduplicates retries by comment ID, routes the comment to the owning creator, ignores comments the page itself wrote, enforces the plan's monthly DM quota and Meta's 24-hour messaging window, then sends the checkout link with `POST /{comment-id}/private_replies`.

Keywords are matched case-insensitively on token boundaries, so `KIT` fires on "send KIT" but not on "KITCHEN", while a hashtag keyword like `#KIT` still matches mid-sentence. When several rules could match, the longest keyword wins. A rule pinned to one connected page never fires for a different page.

Page tokens are issued by a specific Meta app, so changing the App ID invalidates all of them. Affected pages are flagged `needsReconnect` and their owners are told to reconnect, rather than the DMs silently failing.

Every attempt is written to `DmLog` with status and latency, which is what the analytics screen reports. The **Keyword Matcher Testbench** is an explicit dry run: it resolves a comment against your live rules using the same matcher the webhook uses, sends nothing, and writes no analytics.

### Signing in
Email and password always work. Facebook sign-in appears once the admin has configured the Meta connector; NextAuth's options are built per request so the provider can take its credentials from the database.

There is **no auto-linking**. A Facebook account whose email already belongs to a password account is refused, because a provider-asserted email is not proof of owning that account. The owner signs in normally and links Facebook from **Connections**, which runs its own OAuth exchange against the already-authenticated session. Facebook-created accounts can set a password from the same page, and unlinking is blocked when it would leave no way to sign in.

### Paying for a plan
- **Plans** (`/dashboard/plans`) compares tiers. **Checkout** (`/dashboard/checkout?plan=…`) offers only the gateways the platform can actually take money through for that specific plan. **Billing** (`/dashboard/billing`) shows the current entitlement and any bKash payment awaiting review.
- **Stripe** subscriptions renew automatically. A plan is only purchasable by card when Stripe is enabled, the secret key is stored, *and* that plan has a price ID — a missing price ID makes exactly that one plan unavailable.
- **bKash** is a manual transfer, verified by a person. The creator sends money to the platform's bKash number and submits the transaction ID; the admin checks it against the bKash statement and approves it. The amount is derived server-side from the chosen plan and the admin's BDT-per-USD rate, never accepted from the client. Transaction IDs are unique, so one transfer cannot be claimed twice, and approval is a conditional state transition, so a replayed approval cannot grant a second period.
- Manually paid plans last **30 days and do not renew**. Past `planPeriodEnd` the account falls back to Starter limits — enforced through `effectivePlanOf()` on every limit check, not just displayed. Creators are warned in-app a week ahead, and the admin queue shows who is lapsing.
- Availability is re-checked server-side on `/api/billing/subscribe` and `/api/payments/manual`, so a disabled gateway is refused even if the UI is bypassed.

### Store checkout and fulfilment
- The charged amount always comes from the product row in the database. Nothing about price, currency, or payment state is taken from the client.
- **Free products complete immediately** and are delivered end to end. Paid products are refused with `gateway_unavailable` before an order row exists, so nothing dead accumulates in the CRM.
- Fulfilment is idempotent under concurrency: claiming the order's `deliveredAt` with a conditional update means two callers can never both fulfil. It books the consultation slot with a conditional update so a slot cannot be double-booked, mints an expiring and download-limited token, emails the buyer, and records a `DeliveryLog`. Re-sending a delivery reuses the same token row — its expiry is renewed, but no extra download capacity is ever minted.
- `/api/checkout/confirm` retrieves the Stripe session that *this order* created — a `session_id` in the URL is only accepted if it matches the order's stored reference — and fulfils only when `payment_status === "paid"` and the captured amount and currency match. That path is intact but currently unreachable, since no gateway-backed store order can be created.
- `POST /api/webhooks/stripe` verifies the `stripe-signature` against the raw body and de-duplicates by event id. Signature checking is local HMAC, so the webhook works before Stripe is otherwise configured. It drives OmniFlow's own subscription lifecycle.

### Orders CRM
Real orders with search, status filter, revenue totals, per-order delivery state, the buyer's download link with its remaining downloads and expiry, and a re-send delivery action.

### Analytics
Comments detected → Auto-DMs sent → bio visits → orders closed over 7/30/90 days, plus revenue, measured average DM latency, conversion rates, monthly quota usage, and the most recent dispatches with their failure reasons. Revenue is reported per currency and never summed across currencies. A creator previewing their own storefront does not count as a bio visit.

### Plans and quotas
`src/lib/plans.ts` is the single source of truth: the marketing page, the plan cards, and the server-side limit checks all read the same table, so a published feature list cannot drift from what is enforced.

| Plan | Price | Products | Auto-DMs per month |
| --- | --- | --- | --- |
| Starter | $19 | 3 | 500 |
| Pro Growth | $49 | 25 | 5,000 |
| Agency Volume | $99 | 100 | 25,000 |

Limits are enforced in the API, not the UI. Monthly usage is counted from the `DmLog` rows sent since the first of the current month, so there is no stored counter to reset and no cron job to miss. The tiers differ by volume only — there are no seats, sub-accounts or team features, and the plan cards do not claim any.

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/register`, `/api/auth/[...nextauth]` | Account creation and sessions |
| `GET/PATCH /api/profile` | Creator profile, plan, and usage |
| `GET/DELETE /api/account/social`, `POST /api/account/password` | Linked logins and password management |
| `GET /api/account/facebook/start`, `/callback` | Link Facebook to the signed-in account |
| `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]` | Product management |
| `POST/DELETE /api/products/[id]/slots` | Consultation availability |
| `GET/POST /api/auto-dm`, `PATCH/DELETE /api/auto-dm/[id]` | Keyword rules |
| `POST /api/auto-dm/simulate` | Dry-run matcher |
| `GET /api/meta/accounts`, `POST/DELETE /api/meta/accounts/[id]` | Connected pages, subscribe, disconnect |
| `GET /api/meta/oauth/start`, `/api/meta/oauth/callback` | Meta OAuth |
| `GET/POST /api/webhooks/meta` | Hub verification and comment ingestion |
| `POST /api/checkout`, `GET /api/checkout/confirm` | Store checkout and verified fulfilment |
| `POST /api/webhooks/stripe` | Subscription lifecycle |
| `GET /api/billing/options`, `POST /api/billing/subscribe` | Purchasable gateways and Stripe subscription |
| `GET/POST /api/payments/manual` | Submit and review your own bKash payments |
| `GET /api/orders`, `POST /api/orders/[id]/resend` | CRM and delivery retry |
| `POST /api/upload`, `GET /api/files/[key]`, `GET /api/download/[token]` | Storage and secure delivery |
| `GET /api/analytics`, `GET /api/stats` | Creator funnel and public platform counts |
| `GET /api/avatar` | Generated initials avatar for creators with no uploaded photo |
| `GET/PUT /api/admin/settings` | **Admin only.** Platform gateways and Meta connector |
| `GET /api/admin/payments`, `POST /api/admin/payments/[id]` | **Admin only.** Manual payment queue |

## Configuring the integrations

All of this happens in **Dashboard → Platform Setup**, as the super admin.

- **Stripe**: paste the secret key (checked against Stripe before it is encrypted and stored), then the three plan price IDs. Add `{APP_URL}/api/webhooks/stripe` as a webhook endpoint in the Stripe dashboard and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- **bKash**: enter the receiving number, the BDT-per-USD rate and the instructions buyers should follow. Payments then queue for your manual verification.
- **Meta**: enter the App ID, App secret, a webhook verify token and the Graph version. Register `{APP_URL}/api/meta/oauth/callback`, `{APP_URL}/api/account/facebook/callback` and `{APP_URL}/api/webhooks/meta` in the Meta developer console — the exact URLs are shown on the page.
- **Email**: set `RESEND_API_KEY` and `EMAIL_FROM` in the environment. Without it, orders still complete and download links remain available in the CRM, and the delivery log records `unconfigured`.

## What is not built yet

These are deliberately absent, not broken:

- **Selling creator products through a gateway.** Paid store products cannot be bought. The schema carries `Order.platformFeeCents`, `netCents`, `payoutStatus`, `paidOutAt`, `gatewayPaymentRef`, the `Payout` model and `PlatformSettings.platformFeePercent` so that enabling this later needs no second migration, but nothing writes to them and nothing displays them.
- **Commission and payouts.** There is no commission calculation, no earnings screen and no payout tooling, because there is no creator revenue to split yet.

## Verification

```bash
npm run typecheck
npm run build
BASE=http://localhost:3000 bash scripts/e2e-check.sh
bash scripts/audit-probe.sh
```

The smoke test registers a creator, logs in, uploads a deliverable, publishes a product, creates a rule, runs the matcher, buys a free product through the public store, downloads the file, asserts that paid checkout is refused with `gateway_unavailable` and that unsigned Meta webhooks are rejected, and checks that the order shows up in analytics.

`scripts/audit-probe.sh` is a second, adversarial pass over the same running instance. It creates two creators and asserts that neither can read or mutate the other's uploads, products, orders, or profile; that the public file route cannot be walked out of its directory; that SVG and oversized uploads are refused; that download limits and plan limits hold; that the matcher is whole-token; that the testbench writes nothing; and that malformed bodies return 400 rather than 500. It also signs in as the super admin to assert that `/api/admin/*` is invisible to everyone else, that a disabled gateway is refused server-side, that a duplicate transaction ID is rejected, that a submitted payment cannot choose its own amount, and that approving an already-approved payment does not grant a second plan period.

The probe configures and then switches off the platform gateways as part of its run, so point it at a development instance rather than a live one.

## Deploying with PostgreSQL

1. Set `provider = "postgresql"` in `prisma/schema.prisma`.
2. Point `DATABASE_URL` at your database and run `npx prisma migrate deploy`.
3. Replace local disk storage with a bucket if you run multiple instances — `src/lib/storage.ts` is the only file that touches the filesystem.
4. `src/lib/rate-limit.ts` holds its counters in process memory, so move it to a shared store before running more than one instance.
