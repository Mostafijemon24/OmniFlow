# OmniFlow — Creator OS

A production-shaped Creator OS that combines a **digital bio-link store** with a **comment-to-inbox Auto-DM engine** for Instagram and Facebook. Every flow is backed by real persistence, real payment verification, real file delivery, and the official Meta Graph API — there is no seeded demo data and no mocked behaviour anywhere in the app.

## Stack

- Next.js 14 (App Router), React 18, Tailwind CSS
- Prisma ORM — SQLite locally, PostgreSQL-ready
- NextAuth (credentials) with JWT sessions
- Stripe Checkout (creator stores + platform subscriptions), bKash tokenized checkout
- Meta Graph API: OAuth, page subscriptions, signed webhooks, `private_replies`
- Resend for automated delivery email
- Local encrypted file storage with expiring signed download links

## Getting started

```bash
npm install
cp .env.example .env      # then edit the secrets
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and register the first creator account. The database starts empty by design: your account, products, rules, orders, and analytics are the only data the app ever shows.

### Required environment values

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file locally, Postgres URL in production |
| `NEXTAUTH_SECRET` | Session signing |
| `ENCRYPTION_KEY` | AES-256-GCM key for gateway credentials and Meta page tokens. Minimum 32 characters; the app refuses to encrypt without it |
| `NEXT_PUBLIC_APP_URL` | Public origin used in checkout links and Auto-DM messages |

Everything else is optional and unlocks a specific capability (see below).

## How each module works

### Bio store builder
Profile fields save on blur. Cover art and avatars upload to `storage/public` and are served through `/api/files/[key]`; deliverables go to `storage/private`, which nothing serves without a valid download token. Every upload is recorded against the creator who made it, so a product or profile can only reference that creator's own files. Products are typed: a **digital file** requires an uploaded deliverable, a **consultation** requires a meeting link plus bookable slots. Product limits are enforced per plan, and products that already have orders are archived rather than deleted so buyer history stays intact.

### Comment Auto-DM engine
1. Connect a page at **Dashboard → Integrations** (`/api/meta/oauth/start`). OmniFlow exchanges the code for a long-lived token, stores each page token encrypted, and lists Instagram business accounts.
2. Press **Subscribe** to call `POST /{page-id}/subscribed_apps` so Meta starts delivering comment webhooks.
3. `POST /api/webhooks/meta` verifies the `x-hub-signature-256` HMAC with a timing-safe comparison, deduplicates retries by comment ID, routes the comment to the owning creator, ignores comments the page itself wrote, enforces the plan's monthly DM quota and Meta's 24-hour messaging window, then sends the checkout link with `POST /{comment-id}/private_replies`.

Keywords are matched case-insensitively on token boundaries, so `KIT` fires on "send KIT" but not on "KITCHEN", while a hashtag keyword like `#KIT` still matches mid-sentence. When several rules could match, the longest keyword wins. A rule pinned to one connected page never fires for a different page.

Every attempt is written to `DmLog` with status and latency, which is what the analytics screen reports.

The **Keyword Matcher Testbench** is an explicit dry run: it resolves a comment against your live rules using the same matcher the webhook uses, sends nothing, and writes no analytics.

### Checkout and fulfilment
- Creators enter their own Stripe secret key (validated against Stripe, then encrypted) and/or bKash credentials. Buyers pay into the creator's own account, so OmniFlow never holds the money and takes no cut.
- The charged amount always comes from the product row in the database. Nothing about price, currency, or payment state is taken from the client.
- Stripe purchases go through Stripe Checkout; the redirect never marks an order paid on its own. `/api/checkout/confirm` retrieves the session that *this order* created — a `session_id` in the URL is only accepted if it matches the order's stored reference — and fulfils only when `payment_status === "paid"` and the captured amount and currency match the order.
- bKash purchases use the tokenized grant → create → execute sequence. The callback only acts on a still-pending order whose stored payment id matches, and only a `Completed` execute response with a matching amount fulfils the order.
- Stripe is used for USD, EUR, and GBP; ৳ products are charged with bKash, which is BDT only.
- Fulfilment is idempotent under concurrency: claiming the order's `deliveredAt` with a conditional update means two callers can never both fulfil. It books the consultation slot with a conditional update so a slot cannot be double-booked, mints an expiring and download-limited token, emails the buyer, and records a `DeliveryLog`. Re-sending a delivery reuses the same token row — its expiry is renewed, but no extra download capacity is ever minted.
- Free products (price 0) complete immediately without a gateway. Paid products are blocked with a clear error before an order is created, so an unconfigured gateway leaves no dead rows in the CRM.
- `POST /api/webhooks/stripe` verifies the `stripe-signature` against the raw body and de-duplicates by event id. It drives OmniFlow's own subscription lifecycle. It also contains a backup fulfilment path for store orders, but that only runs if a creator additionally points a webhook on **their own** Stripe account at this endpoint — creator storefronts charge on the creator's account, so those events do not reach the platform account by default. `/api/checkout/confirm` is the primary path.

### Orders CRM
Real orders with search, status filter, revenue totals, per-order delivery state, the buyer's download link with its remaining downloads and expiry, and a re-send delivery action.

### Analytics
Comments detected → Auto-DMs sent → bio visits → orders closed over 7/30/90 days, plus revenue, measured average DM latency, conversion rates, monthly quota usage, and the most recent dispatches with their failure reasons. Revenue is reported per currency and never summed across currencies. A creator previewing their own storefront does not count as a bio visit.

### Plans and quotas
`src/lib/plans.ts` is the single source of truth: the marketing page, the billing screen, and the server-side limit checks all read the same table, so a published feature list cannot drift from what is enforced.

| Plan | Price | Products | Auto-DMs per month |
| --- | --- | --- | --- |
| Starter | $19 | 3 | 500 |
| Pro Growth | $49 | Unlimited | Unlimited |
| Agency & Team | $99 | Unlimited | Unlimited |

Limits are enforced in the API, not the UI. Monthly usage is counted from the `DmLog` rows sent since the first of the current month, so there is no stored counter to reset and no cron job to miss. Agency currently carries the same quotas as Pro Growth; it is priced as a support tier, and the feature list says so rather than implying seats or sub-accounts that do not exist yet.

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/register`, `/api/auth/[...nextauth]` | Account creation and sessions |
| `GET/PATCH /api/profile` | Creator profile, plan, and usage |
| `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]` | Product management |
| `POST/DELETE /api/products/[id]/slots` | Consultation availability |
| `GET/POST /api/auto-dm`, `PATCH/DELETE /api/auto-dm/[id]` | Keyword rules |
| `POST /api/auto-dm/simulate` | Dry-run matcher |
| `GET /api/meta/accounts`, `POST/DELETE /api/meta/accounts/[id]` | Connected pages, subscribe, disconnect |
| `GET /api/meta/oauth/start`, `/api/meta/oauth/callback` | Meta OAuth |
| `GET/POST /api/webhooks/meta` | Hub verification and comment ingestion |
| `POST /api/checkout`, `GET /api/checkout/confirm` | Store checkout and verified fulfilment |
| `GET /api/bkash/callback` | bKash execute + fulfil |
| `POST /api/webhooks/stripe` | Subscription lifecycle and backup fulfilment |
| `GET /api/orders`, `POST /api/orders/[id]/resend` | CRM and delivery retry |
| `POST /api/upload`, `GET /api/files/[key]`, `GET /api/download/[token]` | Storage and secure delivery |
| `GET/PUT /api/settings/payments` | Gateway credentials, validated then encrypted at rest |
| `GET /api/analytics`, `GET /api/stats` | Creator funnel and public platform counts |
| `GET /api/avatar` | Generated initials avatar for creators with no uploaded photo |
| `POST /api/billing/subscribe` | Plan change via Stripe subscription |

## Enabling the optional integrations

- **Meta**: set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`. Add `{APP_URL}/api/meta/oauth/callback` as a valid OAuth redirect and `{APP_URL}/api/webhooks/meta` as the webhook callback in the Meta developer console.
- **Stripe (creator store)**: each creator pastes their secret key in Dashboard → Integrations.
- **Stripe (OmniFlow plans)**: set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` IDs.
- **bKash**: each creator enters app key/secret/username/password and chooses sandbox or live. BDT (৳) pricing only.
- **Email**: set `RESEND_API_KEY` and `EMAIL_FROM`. Without it, orders still complete and download links remain available in the CRM, and the delivery log records `unconfigured`.

## Verification

```bash
npm run typecheck
npm run build
BASE=http://localhost:3000 bash scripts/e2e-check.sh
```

The smoke test registers a creator, logs in, uploads a deliverable, publishes a product, creates a rule, runs the matcher, buys through the public store, downloads the file, asserts that paid checkout without a gateway and unsigned Meta webhooks are both rejected, and checks that the order shows up in analytics.

`scripts/audit-probe.sh` is a second, adversarial pass over the same running instance. It creates two creators and asserts that neither can read or mutate the other's uploads, products, orders, or profile; that the public file route cannot be walked out of its directory; that SVG and oversized uploads are refused; that download limits and plan limits hold; that the matcher is whole-token; that the testbench writes nothing; and that malformed bodies return 400 rather than 500.

## Deploying with PostgreSQL

1. Set `provider = "postgresql"` in `prisma/schema.prisma`.
2. Point `DATABASE_URL` at your database and run `npx prisma migrate deploy`.
3. Replace local disk storage with a bucket if you run multiple instances — `src/lib/storage.ts` is the only file that touches the filesystem.
