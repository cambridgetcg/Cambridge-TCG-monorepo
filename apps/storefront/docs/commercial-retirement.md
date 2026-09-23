# New paid commerce is retired

The September 2026 understanding audit removes acquisition and revenue as requirements. There is no replacement KPI. Exploring, changing direction, or leaving a project unfinished needs no commercial justification.

`src/lib/release/commercial-retirement.ts` is the explicit source policy. New paid marketplace orders, listings, offers/counteroffers, auction bids/listings, lot purchases and automatic-pricing commitments return 410 at their existing HTTP admission boundaries and reject at the data-layer backstops. An environment flag cannot reopen them. Nonmonetary swaps retain their previous release controls. B2B checkout remains disabled.

PRISM new sandbox subscription checkout also returns 410, retaining its authentication, same-origin and body-validation boundaries. Its portal, signed webhook processing and existing receipt stores remain intact. Existing account records, paying an already-created trade/auction obligation, cancellation, refund, shipping and payout are unchanged. Existing provider sessions and agreements are not revoked or rewritten. No database migration or free-entitlement conversion is part of this change.

Public subscription sales, marketplace order forms and auction bid/listing forms are retired. Financial information used to understand an existing record remains factual information, not a growth target.

Verification: targeted paid-admission and existing-obligation tests; baseline typecheck comparison; RewardsPro safe bundle build. Full storefront local build is not claimed: reused installed dependencies cannot satisfy the isolated Turbopack workspace root and lack viem. The same nine storefront typecheck errors occur on clean main. Full repository verification includes database-capable audits and was not run against ambient credentials.
