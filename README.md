# Vizaje Partners

Vizaje Partners is a Bun workspace with a Next.js admin shell, a Hono/Bun API, PostgreSQL 17, Drizzle ORM, and shared Zod contracts.

## Local development

Copy `.env.example` to `.env`, set a random `BETTER_AUTH_SECRET` with at least 32 characters, then install dependencies:

```bash
bun install
```

Start PostgreSQL and the two local services in separate terminals:

```bash
docker compose up -d postgres
bun run dev:api
bun run dev:web
```

The API health checks are available at `http://localhost:3001/health` and `http://localhost:3001/v1/health/db`. The PostgreSQL volume is named `postgres_data` and is not recreated by the application.

## Authentication

Better Auth is used for email/password authentication with its Drizzle adapter. It owns opaque, PostgreSQL-backed sessions and password hashing, while the existing `users` table remains the identity source. The API mounts Better Auth at `/v1/auth/*`; Next.js exposes a same-origin BFF at `/api/auth/*` that forwards only the required request headers and preserves `Set-Cookie` responses. Cookies are HttpOnly, SameSite, and Secure in production. Better Auth's origin/CSRF checks and rate limiting remain enabled.

The initial administrator is created manually; the application never seeds credentials during startup:

```bash
bun run --cwd apps/api bootstrap:admin -- --email admin@example.com
```

The command prompts for the password without echoing it, refuses to run when any user already exists, creates the user/account/audit record in one transaction, and does not print secrets. Public signup and password reset remain disabled; creator activation is issued from an approved application.

## Verification commands

```bash
bun run typecheck
bun run --cwd apps/web lint
bun run test:api:unit
bun run --cwd apps/api test
bun run db:check
bun run build:web
```

The API enforces centralized RBAC permissions in Hono middleware. Initial administrator roles are `super_admin`, `program_manager`, `support`, `finance`, and `analyst`. `GET /v1/admin/me` is the authenticated identity/partner lookup used by the web shell; creator-linked sessions can read this endpoint for routing, but the server rejects them from all other `/v1/admin/*` routes.

## Creator applications and partner management

M3 adds the public creator application flow at `http://localhost:3000/apply`, plus protected admin surfaces at `/app/applications`, `/app/partners`, and `/app/partners/:id`. Applications require consent and at least one social profile, normalize phone numbers to E.164, rate-limit submissions, reject active duplicates, and remain `pending` until an administrator reviews them.

The API endpoints are:

- `POST /v1/applications`
- `GET /v1/admin/applications`
- `GET /v1/admin/applications/:id`
- `POST /v1/admin/applications/:id/approve`
- `POST /v1/admin/applications/:id/reject`
- `GET /v1/admin/partners`
- `GET /v1/admin/partners/:id`
- `PATCH /v1/admin/partners/:id/status`
- `POST /v1/admin/partners/:id/agreements`

Approval creates a unique internal `CRE-000001`-style ID, a partner record and a one-time activation invitation transactionally. The user sets the password on `/activate`; invitation and moderation events are stored in the email outbox and audit log.

## Referral links

Creator-owned links are available at `/app/links` (the creator shell used after login) and `/dashboard/links`; the administrator sees a read-only links and finance section in `/app/partners/:id`. A partner account is represented by the `partner_accounts` one-to-one mapping; creator API access is allowed only when the linked record is an active `creator` with a `creator_id`.

Partner API contracts:

- `GET /v1/partner/dashboard` — current creator profile, active agreement and real referral-link counts.
- `GET /v1/partner/profile` — current creator profile.
- `PATCH /v1/partner/profile` with `{ "displayName": "...", "phone": "+373...", "instagram": "https://..." | null, "tiktok": "https://..." | null, "otherSocial": "https://..." | null }` — edits display name, phone and social profile URLs only. Email, Creator ID, role, status and commission rate are immutable through this endpoint.
- `GET /v1/partner/referral-links?status=all|active|revoked` — list only the authenticated creator's links.
- `POST /v1/partner/referral-links` with `{ "linkType": "homepage|product|category|brand", "targetUrl": "https://...", "label"?: "...", "expiresAt"?: "ISO-8601 timestamp" | null }` — create an active link. Expiry must be in the future when supplied.
- `GET /v1/partner/referral-links/:id` — get one creator-owned link; a link belonging to someone else returns 404.
- `PATCH /v1/partner/referral-links/:id` with `{ "label": "..." }` — update the creator-only internal name.
- `PATCH /v1/partner/referral-links/:id/revoke` — revoke only the authenticated creator's link; repeated calls are idempotent.
- `GET /v1/admin/partners/:id/referral-links` — admin read-only view with click/order counts, protected by `partners:read`.
- `GET /v1/partner/analytics` and `GET /v1/partner/orders` — click, order, turnover, commission and balance data, with optional date filters.
- `GET /v1/partner/payouts` and `POST /v1/partner/payouts` — creator payout history and currency-specific payout requests.
- `GET /v1/admin/payouts` and `PATCH /v1/admin/payouts/:id/status` — finance queue and audited status transitions.
- `GET /v1/admin/agreements` — agreement history; creation remains on the partner card via `POST /v1/admin/partners/:id/agreements`.
- `GET /v1/admin/audit` — the latest audit entries, protected by `audit:read`.
- `GET /v1/admin/overview` — aggregate partner, link, click, order, email and payout counters.
- `POST /v1/internal/referral-links/validate` with `{ "code": "XXXXXXXXXX" }` — internal validation, protected by `x-service-token`, rate limited to 120 requests per minute, and returns no active result for revoked/expired links or suspended/banned creators.
- `POST /v1/internal/referral-links/click` — service-authenticated click recording used by the short URL route.
- `POST /v1/internal/referral-orders/events` — service-authenticated, idempotent `order.created|updated|cancelled` ingestion.
- `GET /r/:code` — server-side short URL redirect through the protected internal click endpoint; invalid/revoked/expired links do not redirect.

`POST /v1/partner/referral-links` is limited to 10 requests per minute per creator. Destinations are validated against `VIZAJE_DESTINATION_HOSTS` and the selected RU/RO homepage, product, category, or brand path before storage. Short codes use a unique 10-character opaque alphabet and never contain the creator ID. Existing link rows stay intact if their creator is suspended or banned, but cannot be used to redirect; they become usable again if the creator is restored to active status, subject to each link's own status and expiry.

Financial summaries keep the original scalar fields for compatibility and also return currency-specific breakdowns (`grossSalesByCurrency`, `commissionByCurrency`, `requestedPayoutByCurrency`, `paidPayoutByCurrency`, `availableByCurrency`). The creator and admin interfaces use these breakdowns so MDL, RON and EUR are not added together as if they were one currency. The admin overview exposes the same approach through `pendingPayoutsByCurrency`.

The creator portal is available at `/dashboard`, `/dashboard/links`, `/dashboard/orders`, `/dashboard/earnings`, `/dashboard/payouts`, and `/dashboard/settings`. Creator settings can edit display name, phone and social URLs; email, Creator ID, role, status and commission terms remain immutable. The responsive creator shell includes RU/RO switching, a mobile burger menu, profile dialog and avatar color preference. Notifications and global search are currently presentation-level placeholders.

Application email events (`submitted`, `in_review`, `approved`, `rejected`) are written to `email_deliveries` as encrypted outbox payloads. A worker in the API process claims due rows, retries transient failures with backoff, uses the event key for provider idempotency and stops ambiguous deliveries for reconciliation. Administrators can inspect safe delivery metadata and retry eligible failures under `/app/email`.

Database changes: migrations `0009_fuzzy_captain_cross.sql` and `0010_flippant_starbolt.sql` add private link labels, rate-limit counters and optional link expiry. Migration `0011_public_quentin_quire.sql` adds click, order and payout ledgers. Apply pending migrations locally with `bun run db:migrate`; do not reset the local database. The current working tree includes the generated migration, but runtime tests that write these new tables require it to be applied first.

The exact internal referral URL and validation response contract is documented in [docs/referral-links-contract.md](docs/referral-links-contract.md).
