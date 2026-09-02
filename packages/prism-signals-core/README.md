# `@cambridge-tcg/prism-signals-core`

Pure, monorepo-extraction-ready product core for **PRISM Signals by Cambridge
TCG**. It owns the canonical brand and public links, the preview catalog offer,
the strictly parsed synthetic `OpportunitySignalV1` fixture and its public
presentation, and the Telegram update planner.

This is currently an unpublished workspace package inside the public Cambridge
TCG monorepo, not a confidential engine or independently built npm artifact.
Before extraction or publication, add an emitted
JavaScript/declaration build and run a package-tarball plus clean-consumer
install/import smoke test. Those are later release gates; this change does not
run `pnpm pack`, `npm pack`, or publish anything.

The package has no framework, environment, network, persistence, clock, or
payment side effects. Hosts remain responsible for authenticating transports,
loading configuration, enforcing body limits, acknowledging provider updates,
persisting replay evidence, and granting entitlements from authoritative
payment evidence. The current catalog offer is test-only: every commercial
rail is explicitly off and its rights decision is `not_evaluated`.

```ts
import {
  PRISM_SIGNALS_CATALOG_OFFER,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  planPrismTelegramPreviewV1,
} from "@cambridge-tcg/prism-signals-core";
```

`planPrismTelegramPreviewV1()` is a deterministic planner, not a Telegram
client. A host must verify Telegram's webhook secret before passing an update
to it, and must treat `reject_payment_update` as a retryable failure rather
than acknowledging or granting access. A non-default host supplies one bare
HTTPS origin and its own accurate, URL-free privacy paragraph through
`createPrismSignalsTelegramCopyV1()` (or the planner's optional second
argument); the core derives every context link from that one origin.
