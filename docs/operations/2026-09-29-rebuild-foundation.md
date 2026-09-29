# Rebuild foundation — local verification, 2026-09-29

Yu authorized implementation after the room/content plan and prioritized accurate
SKU and price API contracts. This record covers the first connected implementation,
not the completed replacement of every room or a production deployment.

## Implemented

- Shared raw/normalized SKU identity and JSON Schema; fixed-game candidate
  retrieval, explicit incomplete lookup and printing disambiguation. Card
  composition checks identity and no longer uses caller-controlled HTTP hosts.
- Shared money/native price observation contracts, preserved native decimal
  precision and currency, core stored-value validation, and valid pricing input/
  rounding configuration. Direct admin writers and previews follow the same rules.
- Native member response fields and source/use policy remain compatible. Public
  discovery serves the contract, eight raw schemas and shared OpenAPI definitions.
- Eight-room directory, three reasoned trails, new editorial landing/map, and
  first reading plus human contract guide. Account links suppress prefetch.
- Module purpose/progress records and the rebuild implementation ledger updated.

## Checks actually run

| Check | Result |
|---|---|
| Storefront fixture integration | 279 tests across 22 suites passed |
| SKU package | 95 tests passed |
| Pricing package | 73 tests passed |
| Data-spec conformance | 25 tests passed, including real JSON Schema validation and runtime envelope fixtures |
| Member ingestion | 18 fixture tests passed |
| Wholesale channel configuration | Nine route fixture tests passed |
| TypeScript | Storefront, SKU, pricing, data-spec, data-ingest and wholesale checks passed |
| Next.js production build | Passed on the integrated source |
| Chromium | 13 tests passed across rebuild-foundation, entry-pages and responsive-ui |
| Scoped storefront ESLint | 52 changed TypeScript files; zero errors, 18 warnings |
| Module map | 28 roots, nine domains, 39 generated documentation pages verified |
| Documentation | 278 relative links across 17 changed documentation files resolved |
| Tracked-secret audit | Passed across 4,481 staged/tracked working files; supported patterns only |
| Git whitespace | Staged diff check passed |

Browser checks cover 320–1440px, the reading/contract/schema journey, matching
HTML/JSON room entries, keyboard navigation, Japanese navigation, no-JavaScript
search, explicit account access and existing entry redirects. The new trails
make multiple collection links intentional; the entry test now selects the
primary collection entrance by its accessible name.

Visual inspection covered desktop/mobile home; map and contract screenshots were
also captured. The UI uses existing plain shared controls and meaningful text.
English editorial copy is explicitly marked; this is not a full translation pass.

## Environment and limits

Checks used Node 24.21.0 and the workspace lockfile. Added only data-spec test
dependencies to the lockfile; scoped installs used `--ignore-scripts` and the
final lockfile passed frozen installation. No production credentials were loaded.
Local build/preview used an ephemeral auth secret, an unreachable loopback database
and wholesale target, and a fetch boundary blocking external application requests.
Font retrieval was allowed. Browser contexts blocked external requests.

Expected unavailable-source messages appear in build/preview logs. They are
fixture conditions, not production service measurements. The existing broad
Next.js file-tracing warning remains. Lint warnings include native JSON anchors,
older prose escaping and two existing unused wholesale helpers; none is an error.

Runtime observation guards validate core monetary and mapping values, not every
JSON Schema field or the underlying truth of a source. Native schemas and fixture
tests do not grant publication rights. Existing retirement and source-use rules
remain authoritative. No database migration, source activation, credential
rotation, history rewrite, push or deployment is part of this implementation.
The tracked-secret check does not audit ignored files, historical Git objects,
provider logs or credential validity.

The full card-detail, collection, community and operator UI migration remains in
the [implementation ledger](../plans/storefront-rebuild/implementation.md).
