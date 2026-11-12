# Vizaje Partners isolated Dev

This profile is for a separate Partners environment used with Legacy Dev. It does not deploy anything and does not connect to production.

## Revised M5.4.4B plan

The separate `vizaje-partners-dev` Compose profile is prepared but is **not being deployed yet**. The current controlled integration test uses the existing Partners production hosts together with `https://dev.vizaje-nica.com`.

For that temporary rollout, set `REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS` to exactly one approved test creator Partner UUID. The API fails closed for attribution when this list is empty or the partner is not listed: the referral redirect still works, but no handoff token, click attribution or analytics event is created for that partner. `CREATOR_FINANCE_ENABLED` and `PAYOUTS_ENABLED` remain `false`, so analytics order events do not enter the financial modules.

Use a separate `LEGACY_ANALYTICS_HMAC_KEYS` key ring for the Legacy Dev caller. Do not reuse resolver, account-linking or production analytics keys.

## Current readiness

The proposed names are:

- Web: `partners-dev.vizaje-nica.com` (proposal, not DNS-confirmed).
- API: `partners-api-dev.vizaje-nica.com` (proposal, not DNS-confirmed).

On 2026-11-12 the API hostname had no DNS A/AAAA answer. HTTPS and `/health` therefore could not be checked. Do not request an ACME certificate or publish Nginx until DNS points to the intended dev server.

The repository does not contain `docs/m5.4.3-legacy-referral-analytics.md`. Legacy-side compatibility is therefore not asserted here; the mandatory checks are listed below.

## Files

- `.env.partners-dev.example` — placeholders only; copy to `.env.partners-dev` on the dev host.
- `compose.partners-dev.yml` — independent project `vizaje-partners-dev`.
- `docs/partners-dev-nginx.conf.example` — proposed host Nginx configuration.

The dev Compose project uses a separate network, volume and host ports:

```text
web:      127.0.0.1:3100 -> container 3000
api:      127.0.0.1:3101 -> container 3001
postgres: private Docker network only, postgres:5432
```

The main local Compose project and the production Compose project are not reused. The dev database is `vizaje_partners_dev` and the volume is `vizaje-partners-dev-postgres-data`.

## Required environment values

Required before starting `api`/`web`:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
- `DATABASE_URL` pointing to `postgres:5432/vizaje_partners_dev`.
- `BETTER_AUTH_SECRET`, at least 32 random characters and unique to Dev.
- `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `WEB_APP_URL`.
- `NEXT_PUBLIC_API_BASE_URL`, `API_INTERNAL_URL`.
- `REFERRAL_SERVICE_TOKEN`, unique to Dev.
- `REFERRAL_SHORT_URL_ORIGIN`, `VIZAJE_DESTINATION_HOSTS`.
- `EMAIL_FROM`.

Required to accept Legacy analytics calls:

- `REFERRAL_ANALYTICS_ENABLED=true`.
- `REFERRAL_ANALYTICS_ALLOWED_PARTNER_IDS` containing the exact test creator Partner UUID; this is required for a controlled rollout.
- `LEGACY_ANALYTICS_HMAC_KEYS`, with exactly one active Dev key.

Optional or disabled in this profile:

- `RESEND_API_KEY` is optional; configure a Dev-only Resend key only if email delivery is being tested.
- `LEGACY_RESOLVER_ENABLED=false`, `LEGACY_INTERNAL_BASE_URL` empty, `LEGACY_RESOLVER_HMAC_KEYS` empty.
- `LEGACY_TO_PARTNERS_HMAC_KEYS` stays empty unless account-linking is explicitly included in the Dev test scope.
- `LEGACY_ACCOUNT_LINK_REDIRECT_URI` may point to the Legacy Dev callback, but it does not enable account linking by itself.
- `REFERRAL_TRACKING_ENABLED=false`, `CREATOR_FINANCE_ENABLED=false`, `PAYOUTS_ENABLED=false`.

`LEGACY_ANALYTICS_HMAC_KEYS` must use a different key from resolver and account-linking rings:

```env
LEGACY_ANALYTICS_HMAC_KEYS=[{"keyId":"legacy-analytics-to-partners-dev-2026-11","secret":"<base64url-without-padding>","active":true}]
```

The secret must decode from unpadded Base64URL to at least 32 bytes. Generate it in the secret manager or an operator terminal; never put the value in Git, Docker build arguments, browser variables or logs.

## Safe setup sequence

Run on the intended Dev host from the repository directory. Do not run these commands with the production `.env.production` file.

```bash
cp .env.partners-dev.example .env.partners-dev
chmod 600 .env.partners-dev
# Edit .env.partners-dev and replace every placeholder.

docker compose --env-file .env.partners-dev -f compose.partners-dev.yml config --quiet
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml build --pull api web migrate
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml up -d postgres
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml ps
```

Before migration, verify the target without printing the password:

```bash
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml exec -T postgres \
  sh -c 'printf "db=%s user=%s\n" "$POSTGRES_DB" "$POSTGRES_USER"; pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

If the database already contains data, take a Dev-only backup before migrating:

```bash
install -d -m 700 /opt/vizaje/backups/partners-dev
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > /opt/vizaje/backups/partners-dev/partners-dev-$(date -u +%Y%m%dT%H%M%SZ).dump
chmod 600 /opt/vizaje/backups/partners-dev/*.dump
```

Apply migrations once, explicitly, only after the database check above:

```bash
docker compose --env-file .env.partners-dev --profile migrations -f compose.partners-dev.yml \
  run --rm --no-deps migrate
```

This applies pending Drizzle migrations `0000–0018`. Normal `up` does not start the migration service.

Start the application:

```bash
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml up -d api web
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml ps
curl --fail http://127.0.0.1:3101/health
curl --fail http://127.0.0.1:3101/v1/health/db
curl --fail http://127.0.0.1:3100/
```

## HMAC configuration check

This checks that the API accepts a correctly signed request and reaches application validation. It does not create an attribution or event and keeps the key in the API process only:

```bash
docker compose --env-file .env.partners-dev -f compose.partners-dev.yml exec -T api bun -e '
const { createHash, createHmac, randomBytes } = require("node:crypto")
const keys = JSON.parse(process.env.LEGACY_ANALYTICS_HMAC_KEYS || "[]")
const key = keys.find((candidate) => candidate.active)
if (!key) throw new Error("No active analytics key configured")
const path = "/v1/internal/referral-analytics/attribution/exchange"
const body = JSON.stringify({ handoffToken: "A".repeat(43) })
const timestamp = String(Math.floor(Date.now() / 1000))
const nonce = randomBytes(16).toString("base64url")
const canonical = ["VP-HMAC-SHA256-V1", key.keyId, "POST", path, timestamp, nonce, createHash("sha256").update(body).digest("hex")].join("\\n")
const signature = createHmac("sha256", Buffer.from(key.secret, "base64url")).update(canonical).digest("hex")
const response = await fetch(`http://127.0.0.1:3001${path}`, { method: "POST", headers: { "content-type": "application/json", "x-vp-key-id": key.keyId, "x-vp-timestamp": timestamp, "x-vp-nonce": nonce, "x-vp-signature": signature }, body })
console.log(`status=${response.status}`)
console.log(await response.text())
if (response.status !== 400) process.exit(1)
'
```

Expected result is HTTP `400 ATTRIBUTION_INVALID`, not `401 SERVICE_AUTH_INVALID`. The command must not print the key, signature, nonce or full environment.

## Legacy Dev compatibility checklist

Because the Legacy contract file is not present in this workspace, Windows Legacy Codex must confirm these items before cross-system testing:

1. Legacy sends requests only to the Dev Partners API hostname, never production.
2. Legacy uses `LEGACY_ANALYTICS_HMAC_KEYS` key ID and the separate Dev secret.
3. HMAC canonical path includes the exact `/v1/internal/...` pathname and query string.
4. Raw JSON bytes used for hashing are exactly the bytes sent over HTTP.
5. Timestamp is within 60 seconds; every attempt gets a new timestamp and nonce.
6. Attribution exchange sends the opaque `handoffToken` once and removes `vp_attribution` after exchange.
7. Event names are `add_to_cart`, `order.created`, `order.updated`, `order.confirmed`, `order.cancelled`.
8. Money values are decimal strings with at most two fractional digits; currency is `MDL`.
9. `orderId` is stable in the Legacy namespace and remains identical across status events.
10. Duplicate event ID/payload is treated as success; changed payload returns `409 IDEMPOTENCY_CONFLICT`.
11. Older order status or an event after cancellation is not retried as a new state; Partners returns `409 ORDER_EVENT_STALE`.
12. Retry only network/timeout/`429`/`502`/`503`; do not retry authentication, validation, expired or stale errors blindly.
13. Payloads contain no email, phone, address, password, session token or payment details.

## First cross-system E2E

Run only after DNS/TLS and the Dev key are confirmed:

1. Create or select a Dev referral link targeting only `dev.vizaje-nica.com`.
2. Request `/r/{code}` through the Dev web host and capture the redirect without exposing the handoff token.
3. Let Legacy exchange the token against the Dev API and verify the returned signed attribution context in memory.
4. Send one add-to-cart event and repeat it with the same event ID.
5. Send `order.created`, repeat it, then send `order.confirmed` and `order.cancelled` with the same stable order ID.
6. Verify Partner analytics and database rows in the Dev database only.
7. Repeat negative cases: invalid HMAC, replay nonce, changed payload, stale order and expired attribution.
8. Keep all production flags and all production endpoints disabled throughout the test.
