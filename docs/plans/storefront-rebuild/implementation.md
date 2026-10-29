# Implementation progress

[Blueprint](README.md) · Started 2026-09-29 after Yu authorized implementation
and made accurate SKU/price API contracts a crucial module.

The subsequent direction is **open-source TCG data infrastructure**. The
[canonical integration roadmap](../tcg-data-platform/README.md) now owns delivery
across SKU identity, images, pricing and market observations. This record tracks
the storefront implementation that presents those foundations.

## First connected implementation

| Area | Implemented locally | Remaining |
|---|---|---|
| Data foundation | Shared SKU identity, strict game-specific search, native price/money schemas, core response validation and safer pricing inputs | Migrate other legacy consumers; validate real source availability separately |
| Contract discovery | Human guide, contract JSON, resolvable raw schemas, OpenAPI and manifest links | Wider endpoint-specific schema coverage |
| Image references | Shared official-media checks, market/universal SKU references, separate starter/practice card-number references and credit carried through setup/saves | Independent artist/gallery and retained PvP readers, legacy-photo evidence and object/cache removal |
| Practice flow | Whole-response timeout/byte cap for optional art, shared browser/API projection, text faces for missing metadata, compact credit legends and accessible visible-card inspection | Server enrichment has separate latency; existing multiplayer rendering still needs migration |
| Content structure | Eight typed room records, reviewed page links including standards and roadmap, three reasoned trails, explicit safe public projection | Complete each room's page rebuild and content review |
| Front door | Data-platform purpose, native card search, warm ivory/plum/mandarin design, credited portrait, collector shortcuts and separate agent entry | Review remaining card-detail and personal task flows |
| Platform direction | Shared authored foundation/stage records, human roadmap and static roadmap API; standards page and JSON share one registry | P0 is in progress; remaining image-policy reconciliation and public-release verification precede broader integration |
| Services | Shared human task catalog for pricing, retained history, collection, condition notes and permitted downloads | Backing service availability remains source/account dependent |
| Map | Visitor room map and matching public JSON directory; reading trails in a disclosure | Further room content as its pages migrate |
| Reading | Original guide separating card identity, printing, physical copy and price observation | More sourced, attributed readings |
| Personal and operator pages | Existing routes preserved; direct pricing configuration compatibility repaired | Planned complete personal/admin UI replacement |

This is the first implementation of the larger rebuild. The eight room entries
link to current working route definitions; publication of a directory entry does
not mean every page in that room has been rebuilt or its backing service is live.
English editorial sections declare their language; existing navigation and native
search retain their language controls.

## Route decisions in this slice

- `/` receives the new front door; native search still submits to `/prices/search`.
- `/services` is the compact human tools entry. Navigation now leads with Prices,
  Services, Standards and Roadmap; Collection and Play remain in More alongside
  Guides, Culture and the map. `/prices`
  puts card search first, then source access and compact game browsing.
- `/map` becomes a visitor directory. Contributor doctrine and module details
  remain in repository documentation and the existing methodology pages.
- `/guides/read-a-card` and `/standards/card-data` are new public reading pages.
- `/api/v1/rooms` and `/api/v1/contracts/card-data` are static envelope responses.
- `/roadmap` and `/api/v1/roadmap` share a static authored planning snapshot.
  They do not activate providers or report live service capabilities.
- `/standards` and `/standards.json` share the existing three specification IDs,
  versions and statuses; SKU registry counts are not current catalog counts.
  (2026-10-29: CTCG-NAMES-v1 was appended as a fourth entry, in the same
  registry.)
- `/spec/v1/[schema]` serves only reviewed schema names, with no envelope.
- Existing API and account paths retain their names. No blanket URL migration,
  database migration, credential loading or production activation occurs.

The route/ownership CSVs retain their explicit `f2a8359b` planning baseline.
Their hashes are historical source evidence, not expected hashes of the changed
implementation. New source coverage is maintained in the module catalog; the
CSV migration decisions will be completed deliberately as each route is rebuilt.

The [card-data architecture](../../architecture/card-data-contracts.md) explains
the contracts, units, effects and current limits. The
[verification record](../../operations/2026-09-29-rebuild-foundation.md) records
the actual checks for this implementation. The subsequent
[pricing, services and art pass](../../operations/2026-09-29-pricing-entry.md)
records the human-facing refocus and its local verification.
The [collector's desk refresh](../../operations/2026-09-29-visual-refresh.md)
records the subsequent color, art and shared-interface replacement.
The [data-platform entry verification](../../operations/2026-09-29-data-platform.md)
records the shared roadmap, standards registry, discovery wiring and access checks.
The [image-reference verification](../../operations/2026-09-29-image-references.md)
records the shared image projection, schema, consumer labels and remaining scope.
The [practice-media verification](../../operations/2026-09-29-practice-media.md)
records the subsequent starter-to-board connection and optional-load fallbacks.
