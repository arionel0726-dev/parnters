# Audit log retention

Vizaje Partners separates audit records by operational importance:

- Technical authentication events (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `AUTH_SESSION_REVOKED`) use the short technical retention period. The default is 4 days.
- Administrative and account events, including creator applications, profile changes, agreements and password resets, use the business retention period. The default is 365 days.
- Financially significant events (`PAYOUT_REQUESTED`, `PAYOUT_STATUS_CHANGED`, `REFERRAL_ORDER_EVENT_INGESTED`) use the financial retention period. The default is 2555 days (approximately 7 years).

The API retention worker runs daily and deletes only records older than the configured period for their event class. It does not delete existing records as part of this change; deletion occurs only when the running API executes its scheduled cleanup.

Configuration:

- `AUDIT_TECHNICAL_RETENTION_DAYS` — default `4`.
- `AUDIT_BUSINESS_RETENTION_DAYS` — default `365`.
- `AUDIT_FINANCIAL_RETENTION_DAYS` — default `2555`.

The financial default is conservative and must be reviewed against applicable legal, tax, accounting and privacy requirements before production deployment. Retention values should be changed through deployment configuration, not by manually deleting rows.
