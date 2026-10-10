# Purpose

Cambridge TCG is building open-source TCG data infrastructure: tools and shared
standards that make card data easier to identify, connect and use responsibly.
Human readers and software clients should be able to understand what a record
describes, where it came from, how current it is and what uses are permitted.

Four foundations organise the work:

- **SKU and identity:** preserve source identifiers and distinguish syntax,
  catalog matches and evidence-backed printing mappings.
- **Images and rights:** connect an exact or reference illustration to its
  source, credit, permitted uses and removal state.
- **Prices and provenance:** keep native amounts, currencies, metrics,
  condition, printing and observation times together.
- **Market observations:** distinguish listings, completed sales, aggregates
  and calculated references before comparing or distributing them.

The [integration roadmap](plans/tcg-data-platform/README.md) owns phased delivery
and acceptance criteria. [Current contracts](architecture/card-data-contracts.md)
describe the implemented foundation and its gaps. The visitor site offers card
search, collector tools and credited cultural reading; the
[agent entry](agents/README.md) serves repository work and API integration.
The website's `/roadmap` and `/api/v1/roadmap` are authored planning snapshots,
not reports of live provider coverage.

Open-source direction does not imply that every release is available today.
Reference packages remain private workspaces. Public repository access, package
distribution, reproducible builds and upstream publication permissions have
separate release gates. Code follows the root [Apache-2.0 license](../LICENSE)
and more-specific notices; [CC0 specification prose](STANDARDS-LICENSE.md) does
not relicense provider data or artwork.

## Historical context and retained responsibilities

The project began with storefront and wholesale commerce, shared inventory,
channel sync, escrow and trade-in workflows. That history explains retained
modules; it is not the current product promise. New paid commerce is
[retired](../apps/storefront/docs/commercial-retirement.md). Existing agreements
retain settlement, cancellation, refunds and support.

Operational accountability still matters: consequential changes should be
auditable, failures inspectable, and unavailable data explicit. Normalization
must preserve uncertainty and corrections rather than hide them.
