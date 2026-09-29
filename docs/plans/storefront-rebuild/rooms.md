# Room briefs

[Plan entry](README.md) · All rooms below are proposed. Source is mapped in the
[route inventory](route-inventory.csv); none of these briefs claims a new room
has shipped.

## The front door and map

**Front door · `/`** answers “What is this place, and where can I begin?”

Begin with a short invitation and one specific, credited object or story. Put
card search within immediate reach. Offer three entrances: **Meet a card**,
**Follow a story**, **Take a seat**. Then show three short trails, with a reason
for each connection. Collection, Account and Agents remain direct destinations.
Avoid a dashboard of every feature or a mandatory onboarding questionnaire.

**The map · `/map`** answers “What is here?”

Show all eight rooms with purpose, plain task labels and access context. Search
matches room names, topics and reviewed translated names. Filters describe
content type and access separately. All links work before JavaScript. A search
with no match offers reset and the complete directory. Private account records
and operator resources are not indexed into public search.

## 1. Card library — find and understand a card

**Proposed root:** `/cards` · **Question:** “What card is this, and what can I
learn about it?” · **Primary action:** Find a card.

Pages: library entrance; search/results; game and set indexes; a canonical card
page; variants; permitted source comparisons. A card page begins with identity
and observable details, then connects rules, illustration, collecting and source
evidence. A price is a qualified observation, not the page's identity.

Current sources: `/catalog`, `/prices`, `/find`, `/product/[sku]`,
`/cards/[sku]` and card-related market views. The singular `/card` is a creative
calling-card generator and belongs with experiments, not catalog migration.

Modules: SKU, catalog/cards, wholesale adapters, prices, condition, FX and
source-publication helpers. Keep one canonical SKU and preserve source/language
query semantics. Existing `/cards/[sku]` redirects to `/product/[sku]`; migration
must explicitly reverse or replace that relationship without a redirect loop.

Connections: add to **Your collection** after the relevant auth check; learn the
rules in **Reading room**; meet a maker in **Stories**; inspect evidence at the
**Source desk**. Each connection is tied to this card, not a generic footer list.

Required states: no query, match, ambiguous match, no result, unknown identifier,
source unavailable, source withheld and member-only observations. Missing data
must remain distinct from zero or a nonexistent card. Images require their own
publication basis; text identity is the fallback.

**Ready when:** one identifier produces consistent identity across search,
detail, collection and API views; no retired buying/listing action leaks in.

## 2. Your collection — keep and organise

**Proposed root:** `/collection` · **Question:** “What do I keep, and what would
I like to remember or build?” · **Primary action:** Open your collection.

Pages: signed-out room introduction; personal card list; item detail; wish list;
decks; imports/exports where already supported; recorded collection history.
Public profile sharing is a separate, explicit projection, not a view of private
records with a few fields hidden in the browser.

Current sources: `/account/portfolio`, `/account/wishlist`, `/decks`,
`/deck-builder` and their APIs. Account authentication remains responsible for
identity; this room owns collecting tasks. One deck editor should serve collecting
and play rather than grow two competing implementations.

Modules: portfolio, wishlist, decks, cards, auth and lifecycle. Review the current
portfolio GET snapshot write, image backfill and returned market actions before
carrying its response into the new UI.

Connections: a collection item returns to its canonical **Card library** record;
a deck opens **Play table**; care/condition opens **Reading room**. Existing order
and payment obligations remain under Account rather than becoming collection
acquisition prompts.

Required states: signed out, no collection, populated, stale valuation,
unavailable source, invalid import, pending save, rejected write and read-only
availability. Do not advertise new registration while admission is paused.

**Ready when:** records stay private, saves are explicit and attributable,
imports preserve identifiers, and known backend effects are intentional.

## 3. Play table — take a seat

**Proposed root:** `/play` · **Question:** “How can I play or learn right now?”
· **Primary action:** Start browser practice.

Pages: play entrance; game chooser only for supported engines; practice setup
and board; starter/deck selection; tutorial; deck check; server progress;
multiplayer rooms where their current service permits them.

Current sources: `/play`, `/decks`, `/deck-builder`, `/leaderboards`, with creative
game experiments reviewed individually. Shared game contracts and each engine
remain useful; a fresh board UI must not rewrite rules by accident.

Modules: `packages/play`, game registry, engine implementations, local-save
helpers, deck validation, PVE availability and existing authenticated room APIs.

Connections: a card opens **Card library**; an unclear rule opens **Reading room**;
a saved deck returns to **Your collection**; shared play leads to **Common room**.

Required states: browser-only practice, no saved deck, invalid deck, resume/reset
local save, unavailable server, paused server writes, reconnect and unsupported
engine. Browser saves and server progress have visibly different meaning. Rewards
and rated writes stay governed by their current service policy.

**Ready when:** a visitor can begin local practice without an account or successful
server-progress fetch, and the UI never implies that a local result was recorded
or rewarded by the server.

## 4. Reading room — learn something useful

**Proposed root:** `/learn` · **Question:** “How does this work, and what should
I look for?” · **Primary action:** Choose a guide.

Pages: guide index; beginner paths; rules references; condition/care; identifiers;
collecting practices; printable checklists. Guides explain a task with steps,
examples, definitions, supporting sources and a next action.

Current sources: `/guides`, `/intro`, `/glossary`, practical portions of
`/methodology` and play tutorials. Split long mixed-purpose pages where needed;
do not duplicate the same rulebook in both Play and Learn.

Modules: guide/glossary content, condition helpers and game-specific references.
Any interactive worksheet has a clearly named persistence model. External rules
are dated and linked to the responsible publisher.

Connections: use a rule at **Play table**, inspect a detail in **Card library**,
read a longer interpretation in **Stories**, or check the method at **Source desk**.

Required states: beginner/experienced reading routes, translated introduction
with untranslated body labelled, historical guidance and unavailable external
reference. No invented completeness or automatic grading claims.

**Ready when:** someone can answer the guide's opening question and find the
practical next step without learning repository vocabulary.

## 5. Stories — follow the art and the people

**Proposed root:** `/culture` · **Question:** “What else is held in this small
object?” · **Primary action:** Read a story or follow a thread.

Pages: story entrance; maker profiles; materials and printing; cultural histories;
close readings; attributed personal notebooks; clearly labelled experiments.
This room brings Artbitrage's content character into Cambridge directly.

Current sources: `/culture`, `/artists`, `/lineage`, `/making`, `/workshop`,
`/mekiki`, `/bridge`, `/gallery-next-door`, `/empty-frames`, and individually
reviewed creative surfaces. `/workshop` already means artists and card printing;
do not reuse that URL for API documentation.

Modules: authored cultural content, artwork/source records, Artbitrage bridge,
calling-card and other selected creative modules. Preserve authorship and
language. Facts, interpretations, metaphors and personal writing have explicit
registers; a shared invitation does not require adopting the author's beliefs.

Connections: notice a feature in **Card library**, learn a printing term in
**Reading room**, inspect a source at **Source desk**, or discuss through the
**Common room** when posting is supported.

Required states: sourced account, interpretation, personal notebook, experiment,
external project and unavailable artwork. The title “personal” describes writing;
privacy needs access controls. Museums' individual artwork rights are not a
blanket licence for card images or the whole site.

**Ready when:** a real story has a clear subject, readable beginning and end,
attribution, source-aware images and useful connections beyond itself.

## 6. Common room — meet and share

**Proposed root:** `/community` · **Question:** “Who is here, and how can we
take part?” · **Primary action:** Browse public participation routes.

Pages: community entrance; directory; public profiles; collectives; supported
shared activity. Private messages, notifications and account controls stay in
authenticated personal space and are not public-room content.

Current sources: `/community`, `/u`, `/c` and relevant account/social modules.
Audit registration, profile publication, moderation and posting separately; a
working directory does not imply that every participation action is open.

Modules: social, users, collectives, messages, notifications, reviews and auth.
Show the action's actual availability and the identity under which it executes.

Connections: shared interests lead to **Stories**, decks to **Play table**,
public collection summaries to their deliberately published records.

Required states: anonymous browsing, private profile, no public entries, signed
out, paused admission, permission denied and unavailable moderation/service.

**Ready when:** public and private projections are tested, community actions have
clear ownership, and private records never enter the directory or search index.

## 7. Source desk — understand the evidence

**Proposed root:** `/sources` · **Question:** “Where did this come from, what
does it mean, and what is available?” · **Primary action:** Inspect a source.

Pages: source index; source/field status; coverage; comparison methods; licences;
dataset directory; explanations linked from a card or decision. Organise around
reader questions rather than reproducing every internal principle document.

Current sources: `/prices/coverage`, `/data`, `/datasets`, relevant `/methodology`
pages and source status interfaces. Technical schemas remain in their existing
machine contracts. Repository audits remain contributor material.

Modules: data-ingest, data-spec, coverage, source-rights/publication helpers,
pricing/FX and public data projections.

Connections: return to the exact **Card library** value or **Reading room**
explanation that brought the visitor here; open the reviewed machine contract
through **Agent workshop**.

Required states: source known, unavailable, withheld, incomplete, stale, permitted
public field and permitted authenticated field. State rights and retrieval dates
independently. Do not place raw internal health, secrets or private provider
payloads in this public desk.

**Ready when:** each displayed claim can point to evidence, method or a stated
unknown, and source restrictions are enforced in server projections.

## 8. Agent workshop — discover and build

**Proposed root:** `/agents` · **Question:** “What can I read or call, with what
contract and authority?” · **Primary action:** Make a first public read.

Pages: practical entrance; first request; reviewed resource directory; API and MCP
guides; schema/change references; account-bound agent management where permitted.
Public machine discovery stays separate from coding-agent repository instructions.

Current sources: `/agents`, the reviewed manifest/OpenAPI/tool catalog, public
discovery documents and standards. Machine URLs retain their contracts during UI
migration. The existing resource catalogs own endpoint truth.

Modules: manifest, public-discovery, agent-tools-catalog, data-pantry, agents,
data-spec and MCP bridge. A future public room-map projection contains only room
metadata and links to reviewed resources; it does not auto-publish every API.

Connections: compare evidence at **Source desk**, inspect the same permitted
card identity as a human reader, and open optional attributed cultural writing
through an explicit secondary link.

Required states: public read, authenticated read, missing/insufficient scope,
rate limit, paused write, retired admission and unavailable service. Display
credentials only in appropriate private management flows, never in room content,
examples, generated maps, logs or copied request URLs.

**Ready when:** a client can discover the right contract without persona,
registration or belief becoming an unnecessary entry requirement.

## Account, operations and retained systems

**Account · `/account`** owns identity, preferences, privacy, messages, agent-key
management and existing orders/agreements. Collection receives a dedicated UI,
but stable account links remain until explicitly mapped. Existing settlements,
refunds, cancellations and support remain usable under their current checks.

**Operations · `/admin`** gets a complete, separate operator interface in the
rebuild: records, source operations, queues/jobs, review and audit trails. Its
navigation follows operator tasks, and every read/write retains role checks.
An operator link is not an authentication mechanism. This area is not left as
an accidental collection of old visual components.

**Retained applications** — wholesale, RewardsPro, its extensions and API — have
their own module and service boundaries. Map them and link authorised tasks where
appropriate. Their full UI replacement is a separate product decision, not an
automatic consequence of rebuilding the Cambridge website.

For every room, progress begins at **brief proposed**. Track content drafted,
contract reviewed, wireframe reviewed, implementation and verification as separate
states in the implementation work; existing source is not completed rebuild work.
