# Inventory scope and reading guide

[Plan entry](README.md) · Source baseline:
`f2a8359bcebe864f818df93bc252c0cb178463e9` · Captured 2026-09-29.

## Three views of the existing source

| File | Coverage | How to use it |
|---|---|---|
| [route-inventory.csv](route-inventory.csv) | 297 pages, 467 handlers and eight layouts: 772 rows | Find the current path, proposed room, disposition, provisional target and review note for each source file |
| [route-families.csv](route-families.csv) | All 74 immediate route-family directories | See which families span multiple rooms before attempting a bulk move |
| [ownership-inventory.csv](ownership-inventory.csv) | 28 module roots, 68 library directories and 77 top-level helper/test files: 173 rows | Find proposed ownership and reuse-review responsibilities |

These are planning snapshots, not runtime configuration. They do not register
routes, change auth, enable a feature, move a file or generate redirects. Blank
target paths are deliberate unresolved design work. No missing target may be
silently converted into a redirect to the homepage.

## Proposed room assignment totals

| Room/space | Page files | Route handlers | Layouts |
|---|---:|---:|---:|
| Front door | 4 | 0 | 1 |
| Card library | 11 | 22 | 0 |
| Your collection | 8 | 19 | 0 |
| Play table | 25 | 42 | 2 |
| Reading room | 11 | 0 | 0 |
| Stories | 25 | 73 | 0 |
| Common room | 17 | 35 | 0 |
| Source desk | 52 | 33 | 1 |
| Agent workshop | 17 | 61 | 0 |
| Utilities: map, preferences, legal/help | 13 | 7 | 0 |
| Account and existing records | 66 | 133 | 3 |
| Operations | 48 | 42 | 1 |
| **Total** | **297** | **467** | **8** |

A route handler assigned to Stories is still an API handler with its existing
contract. A handler assigned to Account can include provider/service operations.
Ownership never implies that a route is a public link, safe GET, live service or
permission to execute it. Adjacent applications are covered by module ownership,
not by this storefront page census.

## Fields and decision categories

The route CSV records source path, current route pattern, file kind, family,
proposed room, disposition, provisional target, classification basis, review
note, unverified runtime status and the source file's SHA-256. Patterns such as
`[sku]` are filesystem route patterns, not concrete request URLs.

| Disposition | Meaning in this draft |
|---|---|
| `rebuild-page`, `rebuild-utility` | Design a replacement page; final URL/content review remains |
| `rebuild-private-page` | Personal-space migration lane; independently verify actual session/owner policy |
| `rebuild-protected-console` | Operator-page migration lane; preserve authoritative role checks |
| `rewrite-optional-content` | Rewrite or retain attributed cultural/creative content in Stories |
| `review-retired-entry` | Inspect an old commerce-related entrance; distinguish retired admission from preserved existing records |
| `review-preview-page` | Keep experimental/preview status explicit; do not promote it as a released service |
| `review-card-canonical-url`, `rebuild-card-reference` | Resolve the current cards/product relationship before changing links |
| `merge-and-redirect` | Candidate consolidation requiring parameter/fragment compatibility review |
| `review-audience-redirect` | Preserve audience-specific entry intent, rather than redirect everyone to `/` |
| `retain-contract-review` | Keep handler URL/contract while reviewing method, effects, auth, rights and consumers |
| `retain-until-shell-cutover` | Layout boundary to preserve until its replacement is verified |

Room ownership was initially grouped by source family, with explicit page and
handler overrides. Top-level helper assignments are often name-based; caller
review is required before treating them as an architecture dependency graph.

Specific reviewed distinctions include:

- `/card` is calling-card artwork; `/cards/[sku]` is currently a product alias.
- `/workshop` is cultural writing about makers/printing; `/agents` is the
  proposed Agent workshop entrance.
- `/intro` belongs to learning; `/welcome-all` and the `/welcomes` corpus belong
  to attributed Stories. Neither cultural content nor query/history should be
  erased through a generic homepage redirect.
- `/welcome` already dispatches recognised audience intent and needs to preserve
  those destinations. Its proposed target is intentionally unresolved.
- `/data`, `/datasets` and `/prices/coverage` have different jobs, even though all
  connect to the Source desk. Their proposed pages stay distinct.
- `/scrapers` is an access guide for machine readers and belongs with Agents.
- `/pull-and-pause` and `/duel-of-souls` are creative experiences assigned to
  Stories; their dependencies still need individual review.

## Coverage limits

The census finds `page.tsx`, `route.ts` and `layout.tsx` under storefront's App
Router source. It does not enumerate every function, dynamic record, generated
URL, API method or database table. No route files with the alternative JS/JSX/MDX
conventions were found in the additional filename check.

The root `src/app/sitemap.ts`, `src/proxy.ts`, `next.config.ts`, error/not-found
surfaces, navigation/resource registries, public assets and provider configuration
also need migration review. They are cross-cutting evidence, not additional page
rows. Source-generated metadata URLs and external callback consumers require
separate checks before cutover.

The other applications retain their existing module cards and source ownership.
The proposed scope keeps RewardsPro and Wholesale as separate products; their
complete page inventories and UI designs would require an expanded brief.

## Keeping the snapshot honest

For this pass, compare the CSV path sets to the current filesystem and module
catalog, check all 772 source hashes, check the 74 family directories and 173
ownership paths, and validate the plan's relative links. The snapshot records
source bytes only. None of these checks calls an API or proves runtime health.

Verified on 2026-09-29: all 772 source paths and SHA-256 hashes matched; all 74
families and 173 ownership paths matched the filesystem/catalog; all 107 relative
Markdown links in the new plan and its four entry documents resolved. The module
map audit and Git whitespace check passed. Application tests were not rerun for
this documentation-only change.

During implementation, review changed rows deliberately. Record accepted
destination, exact query/fragment adapter, service/effect review, auth review and
test evidence as additional migration fields. Do not overwrite an unresolved
decision merely because a new file now exists. A future registry validator should
check the approved room model; this snapshot must not become an accidental
production route generator.
