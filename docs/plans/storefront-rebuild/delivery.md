# Delivery, decisions and progress

[Plan entry](README.md) · Sequence for the complete rebuild. Yu authorized
implementation on 2026-09-29, prioritizing SKU and price API contracts. The
[progress record](implementation.md) names the first implemented slice.

## Phase 0 — settle the purpose and ledger

**Deliver:** the agreed product purpose, room names, source inventory and route
dispositions. Review the 31 pages flagged for retired-commerce entry decisions,
53 personal-page assignments and 48 operator pages. These are inventory review
categories, not a runtime access audit.

Resolve specific collisions: card identity versus calling-card artwork;
catalog/prices/product aliases; cultural Workshop versus Agent workshop; public
map versus repository doctrine; collection read effects versus mutations.

Review existing Git work before porting it. `f2a8359b` is the current source
baseline, not a consolidation of every preserved feature branch. The prior
checkpoint, trust-breakdown work and Glass Exchange preview remain separate
review paths in the local Git ledger. Keep them recoverable; no blind merge or
history rewrite is proposed.

**Gate:** each current page has an owner and a proposed outcome; any unresolved
target remains explicitly preserved. Agree which existing content is rewritten,
split, retained with attribution, or placed in an archive/experiment section.

## Phase 1 — content and wireframes first

**Deliver:** fresh wireframes and real draft writing for Front door, Map, Card
reference, one Story, Collection and Play. Draft the first three trails using a
small set of reviewed records and actual available capabilities.

Define page anatomy, room vocabulary, content registers, authorship, image/source
fields and a mobile reading order. Include signed-out, empty, withheld,
unavailable, paused and permission-denied examples. Give the operator shell a
separate task model now, even though it is built later.

**Gate:** someone can explain what the place is, find a card, follow a story,
start practice and locate account support from the drawings. Confirm the content
character and visual direction before building a new component system.

## Phase 2 — the new shell and one connected slice

**Deliver:** a fresh shell, room/content registry, public map projection,
navigation, page templates and necessary shared controls. Build one full slice:
Front door → Card search → Card record → Source explanation → Story/lesson.

Use clearly labelled local fixtures during design. Keep them out of production
data fallbacks. Preserve accessible themes, keyboard control and native links/
simple forms. Validate duplicate IDs, missing pages/anchors, orphaned rooms,
public projection allowlists and trail reasons.

**Gate:** the slice works on narrow/mobile and desktop views, with keyboard and
screen-reader landmarks, without leaking withheld/private fields. Review the
new composition as a whole, not as a patch to the old homepage.

## Phase 3 — complete the public rooms

**Deliver:** Card library, Reading room, Stories, Source desk, Agent workshop and
browser-local Play. Replace every assigned public page or give it an explicit
retained/redirect/archive outcome. Curate content rather than regenerating all
essays from templates.

Preserve published API contracts while improving their human orientation. Keep
schema/resource discovery sourced from existing reviewed registries. Review
content sources and artwork permissions per item; unavailable images receive a
designed text-first state.

**Gate:** public-room journey tests, source-state fixtures, read-only/local
practice boundaries and complete public-route ledger coverage pass.

## Phase 4 — complete personal and participation spaces

**Deliver:** Your collection, decks, wish lists, public community projections,
private community settings/messages and Account records/remedies.

Review collection snapshot/image-backfill effects and remove retired action
suggestions through the proper service boundary. Preserve ownership, session,
registration admission, publication consent and existing agreement policies.
Any necessary backend repair is a small separate contract change with its own
tests, rather than an incidental effect of a visual component.

**Gate:** anonymous/member/owner fixtures prove separation; another account's
data cannot appear in HTML, client payloads or APIs. Saves, unavailable writes,
existing settlement gates and recovery paths are understandable and tested.

## Phase 5 — complete operations

**Deliver:** rebuild all 48 currently inventoried operator pages into coherent
record, source, review, queue/job and service-management workspaces. Retain domain
actions, authoritative role checks, audit trails and unavailable-query semantics.

Use fixtures and an explicitly scoped development database for operational
verification. Never use a generic page crawler against cron, callback or provider
action endpoints. Audit each action's effects before exercising it.

**Gate:** operator journeys and rejected-access cases pass; every admin family has
a disposition. The old admin visual system is not left as an unexplained second
application. `apps/admin` remains the compatibility redirect shell.

## Phase 6 — migrate and remove replaced presentation

**Deliver:** explicit canonical/alias rules, parameter and fragment preservation,
metadata/sitemaps, old mail/deep-link checks and a rollback map. Complete all page
ledger rows and verify that useful content and existing records remain reachable.

Only after a route's replacement passes its checks should its old presentation
be removed. Keep domain services and contracts that are still in use. Preserve
API verbs, status/error semantics, signed callback paths and retired-admission
responses. Do not treat an archive label as permission to erase records.

**Gate:** production build, relevant type/lint checks, contract tests and browser
journeys pass against the candidate. Publishing/deployment remains a separate
action requiring the user's authorization. The plan itself authorises neither.

## Acceptance matrix

| Area | Evidence required |
|---|---|
| Content | Clear purpose and task; attribution; source/interpretation distinction; useful next connection |
| Room registry | Unique IDs, valid page/anchor refs, no orphaned required pages, safe public projection |
| Navigation | 320px through desktop; keyboard entry/dismissal/focus; meaningful no-JS baseline |
| Data | Empty/unavailable/withheld/stale distinct; no private/withheld serialization |
| Identity and writes | Session, owner and role rejection cases; explicit consent/publication choices |
| Games | Existing rules tests; local save compatibility; paused server/reward boundaries |
| Commerce/records | Retirement tests and existing-obligation tests; gate-specific settlement state |
| Agents | Existing tool-access/public-discovery tests; scope, rate-limit and disabled-write states |
| Operations | Role gates, meaningful audit events, queue/job visibility and unavailable-query states |
| Migration | Every current page decided; explicit deep-link/parameter mapping; no redirect cycles |
| Credentials | Server-only dependencies and sanitized outputs; source scan plus separately scoped historical/provider review |

## Decisions to settle through the first wireframes

| Decision | Proposed starting point | What would change it |
|---|---|---|
| Main entrances | Meet a card / Follow a story / Take a seat; Collection always visible | A preferred visitor emphasis from Yu |
| Room names | Characterful room title plus plain task label | Confusion in a simple find-a-page walkthrough |
| Card canonical URL | `/cards/[sku]` with explicit legacy adapters | Identifier/source review exposes an unsuitable identity model |
| Writing workflow | Trusted content records; no new CMS dependency initially | Editors need workflows that files cannot reasonably support |
| Visual character | Editorial table, credited objects, readable controls | Wireframe review calls for a different atmosphere |
| Initial rich content | A small reviewed selection and three trails | Available sources/rights cannot support a proposed subject |
| Other app UIs | Map and retain Wholesale/RewardsPro as separate products | A later explicit brief expands replacement to those products |

No calendar estimates are assigned yet. Service-contract discoveries and content
review determine effort more than the number of CSS components.

## Progress record

Use separate fields for **brief**, **content**, **contract review**, **wireframe**,
**implementation**, **verification** and **migration**. Statuses are not inferred
from the presence of an old route. A room is complete only when its assigned
routes are resolved and the relevant gates pass.

The initial source inventory and briefs are complete. The first implementation
adds the contract foundation, room directory, landing/map and first reading.
Detailed room pages, personal/operator UI and complete migration remain pending.
Local source checks do not verify live services.
