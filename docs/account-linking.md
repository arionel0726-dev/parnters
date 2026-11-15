# Legacy account linking (M5.3B.1B.1)

This module links an already authenticated Legacy customer to an approved
creator account in Partners. It does not change Better Auth sessions,
referral links, tracking, orders, commissions or payouts.

After exchange, Partners issues a scoped opaque grant for the Legacy server.
Partners stores only the grant hash, its Legacy client ID, Partner UUID and
scopes. Legacy still keeps its own `clients.id ↔ Partner UUID` mapping. The
grant is the verifiable proof that this exact pair completed the user-approved
link flow; dashboard requests cannot choose a Partner UUID.

The browser flow is split into two short-lived, one-time steps:

1. Legacy creates an initiation context server-to-server.
2. Partners shows a confirmation page to the logged-in creator and then
   creates the existing one-time authorization code.

The browser receives only an opaque initiation ticket. It never submits the
Legacy client ID, Partner UUID, redirect URI or PKCE challenge.

## Registered callback

Partners accepts exactly one configured callback URI from
`LEGACY_ACCOUNT_LINK_REDIRECT_URI`. It must use the fixed path
`/account/creator-link/callback` and cannot contain credentials, a query or a
fragment. The expected deployments are:

- development: `https://dev.vizaje-nica.com/account/creator-link/callback`;
- production: `https://vizaje-nica.com/account/creator-link/callback`.

The Legacy application owns this callback route. It should verify the Legacy
session and state before exchanging the code, then remove `code` and `state`
from the browser URL.

## Endpoints

### Legacy initiation

`POST /v1/internal/account-linking/initiate`

This is a server-to-server endpoint protected by the separate
`LEGACY_TO_PARTNERS_HMAC_KEYS` key ring. The request contains the Legacy
context and is accepted only when its redirect URI exactly matches the
configured callback:

```json
{
  "legacyClientId": "12345",
  "redirectUri": "https://dev.vizaje-nica.com/account/creator-link/callback",
  "codeChallenge": "<base64url-sha256-of-code-verifier>",
  "state": "<opaque-legacy-state>"
}
```

The response contains a five-minute opaque ticket and the browser URL:

```json
{
  "ticket": "<43-character-one-time-ticket>",
  "authorizeUrl": "https://partners.vizaje-nica.com/link/legacy/authorize?ticket=<ticket>",
  "expiresAt": "<RFC3339 timestamp>"
}
```

The ticket is stored only as a SHA-256 hash. The short-lived initiation row
also stores the Legacy client ID, exact callback, PKCE challenge and state
needed to create the final callback. The Legacy client ID is moved into the
one-time code row and cleared from the initiation row in the same transaction
when the creator confirms.

### Browser inspection

`POST /v1/partner/account-linking/inspect`

Requires a Better Auth session, a trusted `Origin` and an active creator. The
browser sends only:

```json
{ "ticket": "<opaque-ticket>" }
```

The response exposes only the expiry time. No client ID or other Legacy
context is returned.

### Browser confirmation

`POST /v1/partner/account-linking/authorize`

The page at `/link/legacy/authorize?ticket=...` does not issue a code on page
load. After the creator explicitly confirms, the browser sends only:

```json
{ "ticket": "<opaque-ticket>", "confirmed": true }
```

Partners checks the stored initiation context and the current active creator,
consumes the ticket with a compare-and-set update, creates the existing
short-lived authorization code, and returns a callback URL containing the
code and the unchanged Legacy state. The page validates the fixed callback
path before navigating to it.

Unauthenticated users are sent to the existing login page with a local,
allowlisted return path. Suspended, banned and ordinary accounts cannot
inspect or confirm the ticket. Cancelling returns to the creator dashboard.

The callback and authorization responses use `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. The browser page is also excluded from
`robots.txt`.

### Legacy exchange

`POST /v1/internal/account-linking/exchange`

This remains a server-to-server endpoint protected by the independent
`LEGACY_TO_PARTNERS_HMAC_KEYS` key ring. It validates the one-time code, exact
redirect URI, Legacy client ID, PKCE verifier, expiry and current creator
status.

Request:

```json
{
  "code": "<one-time-code>",
  "legacyClientId": "12345",
  "redirectUri": "https://dev.vizaje-nica.com/account/creator-link/callback",
  "codeVerifier": "<43-128-character-pkce-verifier>"
}
```

Success response:

```json
{
  "partnerId": "<uuid>",
  "creatorId": "CRE-000001",
  "type": "creator",
  "status": "active",
  "grantToken": "<43-character-secret; store server-side only>",
  "scopes": ["account:status", "analytics:read", "links:read", "links:write", "account:unlink"]
}
```

No email, phone, Better Auth session token or raw authorization code is
returned. The one-time code row clears its Legacy client ID. The grant token is
returned only to the signed Legacy server response; its SHA-256 hash is stored
by Partners. One active grant is allowed per Legacy client and per Partner.
Re-linking the same pair rotates the grant. A different pairing is rejected
with `409 LEGACY_ACCOUNT_ALREADY_LINKED`.

### Legacy partner status

`POST /v1/internal/account-linking/partner-status`

Request:

```json
{
  "grantToken": "<43-character-secret>",
  "legacyClientId": "12345"
}
```

Requires an active account grant with `account:status`. The Partner UUID is
resolved from that grant, never accepted from the caller. The response contains
only `partnerId`, `creatorId`, `type` and current `status`, including a
suspended/banned status so Legacy can disable the cabinet. A revoked or
mismatched grant returns `401 ACCOUNT_LINK_GRANT_INVALID`.

## Legacy creator dashboard API

These routes use the same `LEGACY_TO_PARTNERS_HMAC_KEYS` service authentication
as account linking. Every body includes `grantToken` and `legacyClientId`.
Partners hashes the token, verifies the exact client ID, checks that the grant
is active, checks the requested scope, and resolves the Partner UUID from its
own grant row. `partnerId` is deliberately rejected in these request bodies.
This prevents a caller from changing a link or analytics request to another
creator. The HMAC proves the Legacy server; the grant proves that the specific
Legacy client and creator completed account linking.

All routes are `POST` requests and require the four HMAC headers described
below. Generate a fresh nonce and signature for every HTTP attempt. The grant
token is a credential: keep it only in protected Legacy server storage and
never send it to the browser. Browser requests go to Legacy, which checks its
current session and mapping before making a signed server-to-server request.

### Read creator analytics

`POST /v1/internal/creator-dashboard/analytics`

Request:

```json
{
  "grantToken": "<43-character-secret>",
  "legacyClientId": "12345"
}
```

Returns the existing Referral Analytics summary and per-link metrics: clicks,
add-to-cart events, created/confirmed/cancelled orders, confirmed sales in
MDL, and conversion. The endpoint requires `analytics:read` and
`REFERRAL_ANALYTICS_ENABLED=true`. It does not expose M4 finance data or infer
orders from add-to-cart events.

### List referral links

`POST /v1/internal/creator-dashboard/referral-links/list`

Request (`status` is optional and defaults to `all`):

```json
{
  "grantToken": "<43-character-secret>",
  "legacyClientId": "12345",
  "status": "all"
}
```

Returns `{ "links": [...] }` using the existing referral-link response
fields, including target, short URL, status, clicks and orders. Requires
`links:read`.

### Create a referral link

`POST /v1/internal/creator-dashboard/referral-links/create`

Request:

```json
{
  "grantToken": "<43-character-secret>",
  "legacyClientId": "12345",
  "idempotencyKey": "<uuid generated once for this user action>",
  "link": {
    "linkType": "product",
    "targetUrl": "https://vizaje-nica.com/ru/katalog/teni/111157",
    "requestedLocale": "ru",
    "label": "Мои тени"
  }
}
```

`link` uses the existing `referralLinkCreateSchema`, including the supported
types `homepage`, `product`, `category`, and `brand`. The same destination
validation, optional Legacy resolver, eligibility rules and audit behavior as
the creator API are used. A successful first request returns HTTP 201 and
`{ "link": ..., "idempotent": false }`. Retrying with the same key and same
payload returns HTTP 200 with the same link and `idempotent: true`. Reusing a
key with a different payload returns `409 IDEMPOTENCY_CONFLICT`. The idempotency
record and created link commit atomically.

### Revoke a referral link

`POST /v1/internal/creator-dashboard/referral-links/{linkId}/revoke`

Request body:

```json
{
  "grantToken": "<43-character-secret>",
  "legacyClientId": "12345"
}
```

Requires `links:write`. Ownership is resolved from the grant; a link owned by
another Partner returns `404 REFERRAL_LINK_NOT_FOUND`. Repeated revocation is
safe and returns the already-revoked link with `idempotent: true`.

### Unlink the account

`POST /v1/internal/creator-dashboard/unlink`

The Legacy server calls this only after authenticating the current Legacy
user and confirming the stored mapping. The matching grant is revoked
atomically; repeat calls return `idempotent: true`. After success, Legacy
should remove its own client-to-Partner mapping and grant token. The token is
not returned again and cannot access dashboard routes after revocation.

### Dashboard API errors

- `401 SERVICE_AUTH_INVALID`, `SERVICE_TIMESTAMP_INVALID`, or
  `ACCOUNT_LINK_GRANT_INVALID`: fix service signing or restart account linking.
- `409 AUTH_NONCE_REPLAY`: retry with a new timestamp, nonce and signature.
- `403 PARTNER_NOT_ACTIVE`: the linked creator is suspended, banned or no
  longer eligible.
- `403 ACCOUNT_LINK_SCOPE_REQUIRED`: the grant lacks the requested scope.
- `404 REFERRAL_LINK_NOT_FOUND`: link does not belong to this grant.
- `409 IDEMPOTENCY_CONFLICT`: use the original payload with that key or create
  a new key for a distinct action.
- `503 FEATURE_DISABLED`: analytics are not enabled.
- `400 INVALID_DESTINATION` or a `LEGACY_*` response: correct the URL/type or
  retry after the resolver is available.

## HMAC

Partners expects a separate `LEGACY_TO_PARTNERS_HMAC_KEYS` JSON key ring. Do
not reuse `LEGACY_RESOLVER_HMAC_KEYS` or `REFERRAL_SERVICE_TOKEN`.

Headers:

```text
X-VP-Key-Id
X-VP-Timestamp
X-VP-Nonce
X-VP-Signature
```

The canonical string is exactly seven LF-separated lines with no trailing LF:

```text
VP-HMAC-SHA256-V1
{keyId}
{HTTP method}
{pathname + query}
{unix timestamp}
{nonce}
{sha256 hex of exact raw UTF-8 body}
```

`X-VP-Signature` is lowercase hexadecimal HMAC-SHA256 over that canonical
string. Timestamp skew is limited to 60 seconds. Nonces are stored with a
unique `(key_id, nonce)` constraint for at least ten minutes.

Example configuration shape, with a placeholder only:

```text
LEGACY_TO_PARTNERS_HMAC_KEYS=[{"keyId":"legacy-to-partners-2026-11","secret":"<43+ character unpadded base64url secret>","active":true}]
LEGACY_ACCOUNT_LINK_REDIRECT_URI=https://dev.vizaje-nica.com/account/creator-link/callback
```

## Storage and one-time use

`legacy_account_link_initiations` stores the SHA-256 hash of the opaque
ticket, the short-lived Legacy context, a state hash and the exact state
needed to return it unchanged. It expires after five minutes and is consumed
atomically. Its Legacy client ID is nullable so it can be cleared as soon as
the final authorization code is issued.

`legacy_account_link_codes` stores only the SHA-256 hash of the final code.
Codes expire after five minutes. Exchange uses a compare-and-set update on
`consumed_at`; concurrent exchanges cannot both succeed. After a successful
or rejected exchange for an inactive creator, `legacy_client_id` is cleared,
while the hash and consumed timestamp remain for replay detection and audit.

`legacy_account_link_nonces` prevents HMAC replay. Expired nonce rows are
removed when a new authenticated request arrives.

`legacy_creator_access_grants` stores the SHA-256 grant hash, linked Legacy
client ID, Partner UUID, scopes and revocation timestamp. Partial unique
indexes enforce one active grant per Legacy client and per Partner. The raw
grant is never persisted. `legacy_referral_link_idempotency` binds a create
key and canonical request hash to its resulting referral link; both are
written in the same transaction.

## Windows Legacy Codex requirements

Legacy must:

1. Generate a PKCE verifier with 43–128 RFC 7636 characters.
2. Send its SHA-256 digest as unpadded Base64URL `codeChallenge`.
3. Store the verifier only for the short-lived linking flow.
4. Keep the Partners HMAC secret server-side in protected configuration.
5. Generate a fresh 16-byte Base64URL nonce and current Unix timestamp for
   every request, including retries.
6. Sign the exact raw JSON bytes that are sent.
7. Use the `legacy-to-partners` key ID, never the Partners-to-Legacy resolver
   key.
8. Treat `401`, `409`, `400` and `403` responses as a failed link and never
   retry with the same nonce.
9. Keep the Legacy customer session and state server-side until callback
   validation succeeds.
10. On callback, verify `state`, exchange the code server-to-server, persist
    the durable `clients.id` ↔ Partner UUID relation, and redirect to a clean
    page without query parameters.

The expected flow is:

1. An already logged-in Legacy customer starts linking and Legacy creates a
   verifier, challenge and state.
2. Legacy sends the signed initiation request and redirects the browser to
   the returned Partners `authorizeUrl`.
3. Partners requires an authenticated active creator and displays the
   confirmation page.
4. The creator explicitly confirms, or cancels without any code being issued.
5. Partners consumes the initiation ticket and redirects to the fixed Legacy
   callback with `code` and the unchanged `state`.
6. Legacy validates its session/state, exchanges the code with a fresh HMAC
   request and stores the durable account relation.

This repository does not implement the Legacy UI, Legacy callback, Legacy
database write, cookies, order attribution or financial effects.
