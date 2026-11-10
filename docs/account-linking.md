# Legacy account linking (M5.3B.1B.1)

This module links an already authenticated Legacy customer to an approved
creator account in Partners. It does not change Better Auth sessions,
referral links, tracking, orders, commissions or payouts.

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
  "status": "active"
}
```

No email, phone, Better Auth session token or raw authorization code is
returned. After the atomic exchange, the stored Legacy client ID is cleared.

### Legacy partner status

`POST /v1/internal/account-linking/partner-status`

Request:

```json
{ "partnerId": "<uuid>" }
```

Response contains only `partnerId`, `creatorId`, `type` and current `status`.

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
