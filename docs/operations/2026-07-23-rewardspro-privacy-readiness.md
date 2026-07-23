# Rewards Pro privacy readiness

**Reviewed:** 23 July 2026
**Scope:** code-backed privacy claims and operational gaps discovered while
publishing the source-controlled `rewardspro.io` landing page.
**Public notice:** `apps/rewardspro/landing/public/privacy-policy/index.html`

This is an engineering and operations review, not legal sign-off. The public
notice deliberately uses qualified language where the current application does
not support a stronger claim.

## Shipped in the landing release

- A real, public `/privacy-policy` page replaces the Shopify App Store link's
  homepage fallback.
- The notice separates website visitors, merchants/staff, and merchant
  shoppers.
- It distinguishes Cambridge TCG Limited's controller activities from
  merchant-directed processing.
- It discloses the actual optional telemetry, replay, email, integration, and
  AI paths found in the application.
- It provides a direct privacy request, objection, incident, and complaint
  route through `contact@rewardspro.io`.
- It names the current Companies House registered office and company number.

## P0 operational gaps

### 1. Data access requests are not delivered

`customers/data_request` currently compiles a report and logs record counts, but
the secure delivery and merchant notification path remains a TODO:

- `apps/rewardspro/app/routes/webhooks.compliance.tsx:230`
- `apps/rewardspro/app/routes/webhooks.compliance.tsx:257`

Build a durable request record, encrypted export, authenticated merchant
download, expiry, operator alert, and completion audit. Do not claim automated
delivery until that path is tested end to end.

### 2. Redaction failures can be acknowledged as success

Customer and shop redaction handlers catch processing errors while the top
webhook handler acknowledges most non-authentication errors with HTTP 200:

- `apps/rewardspro/app/routes/webhooks.compliance.tsx:79`
- `apps/rewardspro/app/routes/webhooks.compliance.tsx:370`
- `apps/rewardspro/app/routes/webhooks.compliance.tsx:542`

Persist compliance jobs before acknowledgement, retry idempotently, alert on
deadline risk, and make terminal failure visible to an operator.

### 3. Shop cleanup is best-effort and can report success with errors

The cleanup service continues after per-model errors and can return
`success: true` alongside an error list:

- `apps/rewardspro/app/services/shop-data-cleanup.server.ts:54`
- `apps/rewardspro/app/services/shop-data-cleanup.server.ts:305`

Generate deletion coverage from the current schema, define lawful-retention
exceptions, verify post-delete counts, and treat incomplete coverage as a
failed compliance job.

### 4. Logging needs an allowlist, not partial redaction

The request logger removes header names containing `token` or `secret`, but can
record other headers and complete non-GET bodies:

- `apps/rewardspro/app/utils/request-logger.ts:23`
- `apps/rewardspro/app/utils/request-logger.ts:54`

Replace this with route-specific allowlisted metadata, structured field
redaction, payload-size limits, and tests containing representative customer,
OAuth, webhook, and payment-adjacent payloads.

### 5. Encryption claims need one enforced production contract

Shopify access tokens are encrypted before Aurora persistence, but another
secret helper can fall back to plaintext when its encryption key is absent:

- `apps/rewardspro/app/utils/session-data-api-adapter.ts:54`
- `apps/rewardspro/app/utils/encryption.server.ts:1`

Fail closed in production when encryption prerequisites are missing, migrate
any legacy plaintext, rotate keys, and document which fields use which key
management path.

### 6. Monitoring and analytics need a reviewed consent/data-minimisation path

The embedded application always mounts Vercel Analytics and Speed Insights,
optionally loads GA4, and configures Sentry with sampled replay:

- `apps/rewardspro/app/root.tsx:154`
- `apps/rewardspro/app/components/GA4Provider.tsx:77`
- `apps/rewardspro/app/entry.client.tsx:6`

Confirm which production variables are enabled. Add consent mode where
required, reduce replay capture, mask all merchant/customer text by default,
remove raw shop domains from third-party analytics, and publish a tested
telemetry matrix.

## P1 governance work

- Adopt a retention schedule by record family. The code currently has narrow
  cleanup windows for sessions and processed webhooks but no general,
  enforceable customer/order schedule.
- Maintain a subprocessor and international-transfer register for Shopify,
  AWS, Vercel, Cloudflare, SendGrid/SES, Sentry, Datadog, Google Analytics,
  GitBook, Bedrock/Anthropic, and merchant-enabled services.
- Surface the privacy notice through merchant/storefront collection points;
  publishing a page alone does not satisfy indirect-collection notice duties.
- Add a merchant data-processing agreement and instructions for store-specific
  shopper requests.
- Add AI prompt controls and tests proving Shopify merchant/customer data is
  not used for model development or training without the required written
  consent.
- Add a documented privacy-complaint workflow: acknowledgement within 30 days,
  investigation, updates, outcome, evidence retention, and ICO escalation
  information.
- Update the Shopify Partner/App Store business address. The listing still
  shows the former Hatton Garden address; Companies House records the current
  registered office as 60 Tottenham Court Road, Suite 4583a, London W1T 2EW.

## Publication claim guardrails

Until the P0 work is complete, do not say:

- “fully GDPR compliant”;
- “all data is encrypted at rest”;
- “we never log personal data”;
- “all data is deleted automatically on uninstall”;
- “customer exports are delivered automatically”;
- “the embedded app is cookie-free”; or
- “Sentry never receives customer or merchant data.”

Prefer concrete, testable descriptions of the current behavior and name manual
support where the self-service path does not yet exist.
