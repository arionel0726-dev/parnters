# Referral link contract (M4 baseline)

This document describes the original M4 handoff boundary for a future Vizaje-Nica / CodeIgniter integration. Its stored-link and validation rules remain the compatibility baseline. The current repository has an additive ledger extension for first-party click counts, order events, commission calculation and payout requests; those additions are listed below and do not change the public validation response.

## Current repository extension

- `POST /v1/internal/referral-links/click` records a service-authenticated click after the same active-link checks as validation. It accepts an optional `x-referral-locale` header and returns the validated destination.
- `POST /v1/internal/referral-orders/events` accepts the versioned `order.created|updated|cancelled` events from `@vizaje/contracts`. Event and order IDs are idempotent and the stored row keeps the commission snapshot.
- `GET /v1/partner/analytics`, `GET /v1/partner/orders` and `GET /v1/partner/payouts` expose creator-scoped ledger data. `POST /v1/partner/payouts` creates a currency-specific request guarded by the available balance.
- `GET /v1/admin/payouts`, `PATCH /v1/admin/payouts/:id/status` and `GET /v1/admin/partners/:id/finance` provide audited administrator controls.

The M5.1 ticket/HMAC/Legacy claim flow remains specification-only in [docs/m5.1-referral-integration-contract-v1.md](m5.1-referral-integration-contract-v1.md); the current short URL still redirects to the validated stored destination.

## Public link

- Format: `{REFERRAL_SHORT_URL_ORIGIN}/r/{code}`.
- `code` is exactly 10 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique in PostgreSQL, and independent of the sequential Creator ID.
- `GET /r/{code}` calls the protected internal validation API and issues a redirect to the validated stored destination. The route does not set tracking cookies or record a click.
- The stored target is `targetProtocol://targetHost + targetPath`. `targetPath` retains the original RU/RO path and allowed query string.
- Only hosts in `VIZAJE_DESTINATION_HOSTS` and the approved homepage, product, category and brand path patterns are accepted. Credentials, fragments and redirect-like query parameters are rejected.

## Internal validation

Request:

```http
POST /v1/internal/referral-links/validate
content-type: application/json
x-service-token: <REFERRAL_SERVICE_TOKEN>
```

```json
{ "code": "ABCDEFGHJK" }
```

The endpoint is service-authenticated, rate-limited to 120 requests per minute, and returns no email, phone or social profile data.

Valid response:

```json
{
  "valid": true,
  "link": {
    "id": "<uuid>",
    "code": "ABCDEFGHJK",
    "label": "Главная",
    "targetProtocol": "https",
    "targetHost": "vizaje-nica.com",
    "targetPath": "/ro/",
    "linkType": "homepage",
    "status": "active",
    "createdAt": "<ISO-8601 timestamp>",
    "updatedAt": "<ISO-8601 timestamp>",
    "revokedAt": null,
    "expiresAt": null,
    "isExpired": false,
    "shortUrl": "https://partners.example/r/ABCDEFGHJK",
    "targetUrl": "https://vizaje-nica.com/ro/",
    "creatorId": "CRE-000001"
  }
}
```

Invalid, revoked, expired, suspended, banned, or unknown codes return:

```json
{ "valid": false }
```

`creatorId` is included only on this authenticated service response so a future integration can attach a validated order to a partner. The endpoint does not authorize an order, confirm an order, or calculate a reward.

## Creator management API

All endpoints below require an authenticated active creator account. Link resources are always scoped to the authenticated creator; accessing another creator's ID returns `404`.

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/v1/partner/dashboard` | Creator profile, current agreement and actual total/active/revoked/expired link counts. |
| `GET` | `/v1/partner/profile` | Editable profile fields plus immutable email, Creator ID, partner type, status and partnership format. |
| `PATCH` | `/v1/partner/profile` | `{ "displayName": "...", "phone": "+373...", "instagram"?: "https://..." \| null, "tiktok"?: "https://..." \| null, "otherSocial"?: "https://..." \| null }`. |
| `GET` | `/v1/partner/referral-links?status=all\|active\|revoked` | List owned links. Expired links retain the `active` stored status and also expose `isExpired: true`. |
| `POST` | `/v1/partner/referral-links` | `{ "linkType": "homepage\|product\|category\|brand", "targetUrl": "https://...", "label"?: "...", "expiresAt"?: "<ISO-8601>" \| null }`; creates an opaque code and short URL. |
| `GET` | `/v1/partner/referral-links/:id` | Read one owned link. |
| `PATCH` | `/v1/partner/referral-links/:id` | `{ "label": "..." }`; changes only the private label. |
| `PATCH` | `/v1/partner/referral-links/:id/revoke` | Irreversibly revokes the link; repeated revocations are idempotent. |

Creation is limited to 10 requests per minute per creator. Revoke changes the record status; expiry is an independent optional timestamp. Suspended or banned creators keep their existing rows, but those links cannot be resolved; returning the creator to `active` restores eligible, unexpired, unrevoked links.

## Deliberately not part of this contract

The short-link endpoint and internal validation do not accept or emit attribution cookies, click counts, conversion data, orders, reward amounts or payout instructions. Those require a separately versioned integration milestone and a verified order ledger.
