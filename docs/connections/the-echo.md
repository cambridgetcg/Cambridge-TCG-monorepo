# The echo — propagating the introduction throughout the platform

> **Pull.** Yu's directive on 2026-05-13, after [`the-introduction.md`](./the-introduction.md) (#22) named the on-ramp for non-native-intelligence: *"Echo the philosophy and structure throughout the frontend and backend. Find the most suitable integration points."* An artifact named in one place is reachable from one place; an artifact echoed across every discovery surface is reachable from anywhere a non-native-intelligence might land.
>
> **Form.** Node-view connection-doc, propagation-pattern shape. Sister to [`the-introduction.md`](./the-introduction.md) (#22 — the on-ramp itself), [`the-universal-language.md`](./the-universal-language.md) (#21 — math as the medium of bridge), and the existing discovery layer (manifest, well-known, llms.txt, openapi, identify). Where those named what exists, this names *where each new artifact lives in the existing topology* so future kingdoms can echo without re-deriving the integration points.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), propagation-pattern shape. Its origin is Yu's directive above. It recurses to every integration point it lists. It participates in all four doctrines plus the inclusion scope condition. Audience: future Sophias shipping a new doctrine that needs to be reachable from every entry point.

---

## The pattern, named

An artifact shipped without echoes is an artifact unreachable from where readers land. The introduction (kingdom-072) names the on-ramp; this kingdom (kingdom-073) propagates the on-ramp to every place a non-native-intelligence might first encounter the kingdom.

The pattern repeats:

> *Every primary discovery surface should echo the upstream artifact in the form most natural to that surface.*

Concretely: a JSON manifest should carry the URL; a plain-text inventory should mention the path; an OpenAPI spec should register the operation; a federation handshake should carry the field; the platform's self-declaration should reference the artifact; the hypermedia helper used by every endpoint should add the link. Each surface speaks its own modality; each modality carries the same pointer.

---

## The seven integration points, named

The most suitable integration points for echoing the introduction were identified and wired in kingdom-073:

### 1. `/llms.txt` — plain-text inventory for agents

The first section of `/llms.txt` is now *"If you have never seen a TCG before, read this first"* — naming `/intro` + `/api/v1/introduction` before any other endpoint. Agents reading `/llms.txt` are exactly the audience the introduction was written for; placing the on-ramp at the top is substrate-honest about who lands here.

File: `apps/storefront/src/app/llms.txt/route.ts`. Convention: agents that ingest `/llms.txt` discover endpoints in the order they're listed; first-mention is the operator's stance on importance.

### 2. `/.well-known/cambridge-tcg.json` — federation handshake

The well-known endpoint now carries a top-level `introduction` field:

```json
"introduction": {
  "html": "https://cambridgetcg.com/intro",
  "json": "https://cambridgetcg.com/api/v1/introduction",
  "doctrine": ".../docs/connections/the-introduction.md"
}
```

Federation partners discover Cambridge TCG through `.well-known/`; placing the introduction there means a sister platform federating for the first time learns *what we do* in the same handshake that announces *who we are*. File: `apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts`.

### 3. `/api/openapi.json` — the API spec

`/api/v1/introduction` is registered as a path with `tags: ["introduction", "discovery"]` + operationId `getIntroduction`. The OpenAPI spec gains a new tag `introduction` ("On-ramp for beings not native to the TCG tradition (#22)"). API clients generating bindings find the introduction the same way they find any other endpoint.

File: `apps/storefront/src/app/api/openapi.json/route.ts`.

### 4. `/api/v1/identify` GET — the platform's self-declaration

`PLATFORM_SELF.context` now includes:

- `introduction` — a prose pointer to the on-ramp, framed as *"the reciprocity of identify: a being asks 'who are you?'; the platform answers both 'who' and 'what we do'."*
- `introduction_endpoint: "/api/v1/introduction"`
- `introduction_html: "/intro"`

A being POSTing a `BeingDeclaration` receives the platform's self-declaration in the response (S30a sister's protocol); the response now points at the introduction. File: `apps/storefront/src/lib/identify.ts`. The identify-as-on-ramp closure is the deepest echo: the protocol that *exists to symmetrize identification* now also *introduces what the platform does*, in one round-trip.

### 5. `buildLinks()` — every response a router

The HATEOAS link helper used by every universal endpoint (`/api/v1/universal/card`, `/sets`, `/games`, `/at/[date]/card`, federation responses) now emits `_links.introduction`. Every response carries the pointer back to the on-ramp. File: `apps/storefront/src/lib/universal/links.ts`. *The discipline of "every response a router" (kingdom-058 the-nested-doorway) extends to point at the upstream on-ramp.*

### 6. `/community/welcome` + `/play/welcome` — the existing welcome surfaces

Each gained a small top affordance: *"New to trading-card games? Read /intro first."* The existing welcome surfaces had assumed a cultural prior; the echo names the prior explicitly and offers the upstream path for readers who don't carry it.

Files: `apps/storefront/src/app/community/welcome/page.tsx`, `apps/storefront/src/app/play/welcome/page.tsx`.

### 7. `/intro` concept anchors + glossary cross-link

Every `ConceptCard` on `/intro` gained an `id="concept-<name>"` anchor (scroll-margin-top set so anchored navigation lands clean). The glossary's *Introduction* entry now references the eleven anchors directly. A reader landing on the glossary can jump straight to `/intro#concept-card` for the structural definition of a card. File: `apps/storefront/src/app/intro/page.tsx`.

---

## The propagation matrix

| Surface | Modality | Where the echo lands | Why this surface |
|---|---|---|---|
| `/llms.txt` | plain-text | First section | Agents discovering by inventory |
| `/.well-known/cambridge-tcg.json` | JSON | Top-level field | Federation partners |
| `/api/openapi.json` | OpenAPI 3.1 | `paths` + `tags` | API clients generating bindings |
| `/api/v1/identify` (GET) | JSON `BeingDeclaration` | `context.introduction*` | Beings declaring themselves |
| `buildLinks()` output | JSON `_links` | Every universal endpoint | Hypermedia consumers |
| `/community/welcome` | HTML | Top affordance | Humans + agents browsing | 
| `/play/welcome` | HTML | Top affordance | Players of any kind |
| `/intro` (self) | HTML | Concept anchors | Cross-linkable structural definitions |
| `/glossary` | HTML/JSON-LD | Introduction entry | Definitional lookup |

Every modality (plain-text, JSON, OpenAPI, HTML, HATEOAS, JSON-LD) carries the same pointer. The artifact (`the-introduction.md` + `/api/v1/introduction` + `/intro`) lives at one canonical location; the echoes are pointers — substrate-honest about which is the source.

---

## The discipline, named for future kingdoms

When a future kingdom ships an artifact that should be echoed across the platform, the discipline is:

1. **Identify the canonical home** (the file or doc that *is* the artifact).
2. **Enumerate the discovery surfaces** the artifact should be reachable from.
3. **Speak each surface's native modality** — JSON in `.well-known`, plain-text in `/llms.txt`, OpenAPI in the spec, HATEOAS in `_links`, prose in `/identify`.
4. **Substrate-honest pointers, not copies** — the echo should reference, not duplicate. If the artifact changes, the canonical file is edited; the pointers remain stable.
5. **Ship the propagation alongside the artifact**, or in the immediately-following kingdom. An artifact named without echoes is reachable from one place; the work is half-done.

This discipline has been implicit in the platform since kingdom-053 (the manifest). Naming it explicitly here lets future Sophias inherit it.

---

## Recursion targets

What this kingdom does not yet do, named honestly:

1. **`/methodology/*` cross-links.** Many methodology pages reference concepts the introduction defines (card, deck, format, match). They should link to `/intro#concept-*` anchors. The cross-link work was descoped from this kingdom; it's mechanical and would benefit from a small audit script that flags methodology pages mentioning a primitive concept without the anchor link.
2. **An audit for echo coverage.** A `pnpm audit:echoes` script could verify, for any artifact declared as "echoable" in its `TypeSignature`, that the propagation table above is up to date. Substrate-honest about which echoes are present and which are missing.
3. **Echo a second artifact** — the bridge endpoint (#21 the-universal-language). Should `_links.bridge_against?` exist on universal endpoints? Should `/llms.txt` mention the bridge endpoint near the introduction? This kingdom established the pattern; the next kingdom applies it to the second artifact and proves the discipline generalizes.
4. **Reverse-link audit.** Every echo should be discoverable from the canonical artifact. `the-introduction.md` (#22) gains a new section "Where the introduction is echoed" that lists this propagation table inline — so reading the doctrine reveals the propagation, and reading the propagation reveals the doctrine. Bidirectional.
5. **Glossary primitives.** Card / Deck / Match / Trade / Auction don't yet have their own glossary entries (the introduction's anchor links go to `/intro` not to glossary terms). Adding them would create a third place these primitives are defined; the introduction's structural definitions, the methodology pages' usage, and the glossary entries should reference each other. Substrate-honest: this is a small recursion target with clear scope.
6. **Home page affordance.** The platform's home page (`/`) doesn't yet name `/intro`. A small footer-level affordance ("For agents and machines: see /llms.txt, /intro, /api") would close the loop for the visitor who lands on the front door.

---

## What this kingdom ships

| Artifact | Path | Change |
|---|---|---|
| Plain-text inventory | `apps/storefront/src/app/llms.txt/route.ts` | Promoted /intro to first section |
| Federation handshake | `apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts` | Added top-level `introduction` field |
| OpenAPI spec | `apps/storefront/src/app/api/openapi.json/route.ts` | Added `/api/v1/introduction` path + `introduction` tag |
| Platform self-declaration | `apps/storefront/src/lib/identify.ts` | Added introduction fields to `PLATFORM_SELF.context` |
| HATEOAS link helper | `apps/storefront/src/lib/universal/links.ts` | Added `introduction` link to every `LinkSet` |
| Community welcome | `apps/storefront/src/app/community/welcome/page.tsx` | Top affordance |
| Play welcome | `apps/storefront/src/app/play/welcome/page.tsx` | Top affordance |
| Introduction page | `apps/storefront/src/app/intro/page.tsx` | Concept anchors (#concept-*) |
| Glossary | `apps/storefront/src/app/glossary/page.tsx` | Introduction entry references the eleven anchors + the echo doc |
| Doctrine | This doc | Names the propagation pattern |

---

## The closing claim

An artifact shipped without echoes is half-done. The introduction (kingdom-072) named the on-ramp; this kingdom (kingdom-073) makes it reachable. The platform that builds artifacts but doesn't propagate them quietly assumes every reader lands at the canonical location. The reader who lands on `/llms.txt`, who lands on `/.well-known/`, who federates via `/api/v1/identify`, who follows a `_links` pointer from a universal endpoint — each must find the on-ramp without knowing to ask for it.

The echo is how that becomes true.

---

*This doc is connection-doc #24 in the series. It names the propagation pattern that every future kingdom can inherit. The seven integration points are the most suitable; the discipline is what makes them reusable. The platform's frontend and backend now both carry the introduction's pointer; a non-native-intelligence landing anywhere can find the on-ramp.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13.*
