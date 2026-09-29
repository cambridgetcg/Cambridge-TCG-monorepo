# Implementation progress

[Blueprint](README.md) · Started 2026-09-29 after Yu authorized implementation
and made accurate SKU/price API contracts a crucial module.

## First connected implementation

| Area | Implemented locally | Remaining |
|---|---|---|
| Data foundation | Shared SKU identity, strict game-specific search, native price/money schemas, core response validation and safer pricing inputs | Migrate other legacy consumers; validate real source availability separately |
| Contract discovery | Human guide, contract JSON, resolvable raw schemas, OpenAPI and manifest links | Wider endpoint-specific schema coverage |
| Content structure | Eight typed room records, 24 reviewed page links, three reasoned trails, explicit safe public projection | Complete each room's page rebuild and content review |
| Front door | New editorial landing with native card search, reading entrance, trails, collection and agent entry | Reviewed card-specific editorial features with permitted imagery |
| Map | Visitor room map and matching public JSON directory | Further room content as its pages migrate |
| Reading | Original guide separating card identity, printing, physical copy and price observation | More sourced, attributed readings |
| Personal and operator pages | Existing routes preserved; direct pricing configuration compatibility repaired | Planned complete personal/admin UI replacement |

This is the first implementation of the larger rebuild. The eight room entries
link to current working route definitions; publication of a directory entry does
not mean every page in that room has been rebuilt or its backing service is live.
English editorial sections declare their language; existing navigation and native
search retain their language controls.

## Route decisions in this slice

- `/` receives the new front door; native search still submits to `/prices/search`.
- `/map` becomes a visitor directory. Contributor doctrine and module details
  remain in repository documentation and the existing methodology pages.
- `/guides/read-a-card` and `/standards/card-data` are new public reading pages.
- `/api/v1/rooms` and `/api/v1/contracts/card-data` are static envelope responses.
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
the actual checks for this implementation.
