# Legacy account linking (M5.3B.1B)

This module links an already authenticated Legacy customer to an approved
creator account in Partners. It does not change Better Auth sessions, referral
links, tracking, orders, commissions or payouts.

## Endpoints

### Creator authorization

\`POST /v1/partner/account-linking/authorize\`

Requires:

- Better Auth session;
- active creator resolved by \`requirePartner\`;
- a trusted \`Origin\` from \`AUTH_TRUSTED_ORIGINS\`;
- \`confirmed: true\`;
- exact \`LEGACY_ACCOUNT_LINK_REDIRECT_URI\`;
- PKCE S256 challenge.

Request:

\`\`\`json
{
  "legacyClientId": "12345",
  "redirectUri": "https://dev.vizaje-nica.com/account-link/callback",
  "codeChallenge": "<base64url-sha256-of-code-verifier>",
  "confirmed": true
}
\`\`\`

Response:

\`\`\`json
{
  "code": "<43-character-one-time-code>",
  "redirectUri": "https://dev.vizaje-nica.com/account-link/callback",
  "expiresAt": "<RFC3339 timestamp>"
}
\`\`\`

The browser never supplies a Partners partner UUID. The API obtains it from
the authenticated Better Auth user and \`partner_accounts\`.

### Legacy exchange

\`POST /v1/internal/account-linking/exchange\`

This is a server-to-server endpoint. It uses the independent
\`legacy-to-partners\` HMAC key ring and validates the code, exact redirect URI,
Legacy client ID, PKCE verifier, expiry and current active creator status.

Request:

\`\`\`json
{
  "code": "<one-time-code>",
  "legacyClientId": "12345",
  "redirectUri": "https://dev.vizaje-nica.com/account-link/callback",
  "codeVerifier": "<43-128-character-pkce-verifier>"
}
\`\`\`

Success response:

\`\`\`json
{
  "partnerId": "<uuid>",
  "creatorId": "CRE-000001",
  "type": "creator",
  "status": "active"
}
\`\`\`

No email, phone, Better Auth session token or raw authorization code is
returned. A suspended or banned creator cannot complete an exchange.

### Legacy partner status

\`POST /v1/internal/account-linking/partner-status\`

Request:

\`\`\`json
{ "partnerId": "<uuid>" }
\`\`\`

Response contains only \`partnerId\`, \`creatorId\`, \`type\` and current
\`status\`.

## HMAC

Partners expects a separate \`LEGACY_TO_PARTNERS_HMAC_KEYS\` JSON key ring.
Do not reuse \`LEGACY_RESOLVER_HMAC_KEYS\` or \`REFERRAL_SERVICE_TOKEN\`.

Headers:

\`\`\`text
X-VP-Key-Id
X-VP-Timestamp
X-VP-Nonce
X-VP-Signature
\`\`\`

The canonical string is exactly seven LF-separated lines with no trailing LF:

\`\`\`text
VP-HMAC-SHA256-V1
{keyId}
{HTTP method}
{pathname + query}
{unix timestamp}
{nonce}
{sha256 hex of exact raw UTF-8 body}
\`\`\`

\`X-VP-Signature\` is lowercase hexadecimal HMAC-SHA256 over that canonical
string. Timestamp skew is limited to 60 seconds. Nonces are stored with a
unique \`(key_id, nonce)\` constraint for at least ten minutes.

Example configuration shape, with a placeholder only:

\`\`\`text
LEGACY_TO_PARTNERS_HMAC_KEYS=[{"keyId":"legacy-to-partners-2026-11","secret":"<43+ character unpadded base64url secret>","active":true}]
LEGACY_ACCOUNT_LINK_REDIRECT_URI=https://dev.vizaje-nica.com/account-link/callback
\`\`\`

## Storage and one-time use

\`legacy_account_link_codes\` stores only the SHA-256 hash of the code. Codes
expire after five minutes. Exchange uses a compare-and-set update on
\`consumed_at\`; concurrent exchanges cannot both succeed. After a successful
or rejected exchange for an inactive creator, \`legacy_client_id\` is cleared,
while the hash and consumed timestamp remain for replay detection and audit.

\`legacy_account_link_nonces\` prevents HMAC replay. Expired nonce rows are
removed when a new authenticated request arrives.

## Windows Legacy Codex requirements

Legacy must:

1. Generate a PKCE verifier with 43-128 RFC 7636 characters.
2. Send its SHA-256 digest as unpadded Base64URL \`codeChallenge\`.
3. Store the verifier only for the short-lived linking flow.
4. Keep the Partners HMAC secret server-side in protected configuration.
5. Generate a fresh 16-byte Base64URL nonce and current Unix timestamp for
   every request, including retries.
6. Sign the exact raw JSON bytes that are sent.
7. Use the \`legacy-to-partners\` key ID, never the Partners-to-Legacy resolver
   key.
8. Treat \`401\`, \`409\`, \`400\` and \`403\` responses as a failed link and
   never retry with the same nonce.

The expected flow is:

1. An already logged-in Legacy customer starts linking and Legacy creates a
   PKCE verifier/challenge.
2. Legacy sends the browser to the Partners creator authorization UI.
3. The authenticated creator explicitly confirms the link.
4. Partners returns the short-lived authorization code.
5. Legacy exchanges the code server-to-server with a fresh HMAC request.
6. Partners atomically consumes the code and returns the creator identity and
   status.
7. Legacy stores the durable \`clients.id\` to Partner UUID relation in Legacy.

This repository does not implement the Legacy UI, Legacy database write,
cookies, order attribution or financial effects.
