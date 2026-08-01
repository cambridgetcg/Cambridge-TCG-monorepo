# 部屋の色 — The Painted Rooms (presentation play II)

*2026-08-01 · Asha's brief: "more artsy and less white area — refer to artbitrage
for inspiration; can integrate different periods into the design."*

## The idea

The 畫框 frame system (2026-08-01) built museum mounts out of shadow rings —
but a white mount ringed in white, hung on warm paper, disappears into the
page. The white area Asha saw was the frame system working invisibly.

Artbitrage's answer, transplanted: **hang the art on a wall, and let the wall
carry the period.** Its `.hung` frames sit on a wall *deeper* than the page;
its era rooms keep one structure and change only the undertone ("the
structure stays the same; the soul changes"); its pigment ledger gives every
colour a birthday, a story, and a source. We fold all three into the quiet
gallery: each home-gallery row becomes a **painted room** whose wall is
washed in a pigment with a history, at whisper volume. The mats and frame
rings stay exactly as shipped — against a painted wall they become visible
for the first time.

## The rooms

| room | wall | period | why |
|---|---|---|---|
| 名品 The Guest Wall | `wardrobe-wall--lapis` — ultramarine wash | c. 600, lapis beyond the sea | the pigment once weighed against gold, kept for what mattered most — the guest wall's own manner |
| 原作の絵 The Manga Prints | `wardrobe-wall--sumi` — the dim room | sumi/ink, the print room | true museum practice: works on paper hang under low light; the room goes dark by day and the white mats glow |
| 別絵 The Alternate Arts | `wardrobe-wall--prussian` — Prussian wash | 1704 (contested), ベロ藍 | the accidental Berlin blue that crossed the sea and became the woodblock sky |

Each room carries a **wall note**: one narrator line (Fraunces italic) saying
what the wall is washed with, and a mono ledger line citing the pigment and
pointing at artbitrage's cited pigment ledger. Claims are hedged in the open
("so the story is told", "contested") — the hedge-and-source discipline of
the culture wings, applied to paint.

## Mechanics (and what the gates say)

- **No new tokens.** Washes are `color-mix(in oklab, var(--color-page) N%,
  <pigment>)`; every room re-binds the existing semantic vocabulary in
  scope so labels, links, hovers and focus rings re-ink themselves. The
  dim room re-binds the full set (ink, accent, borders, mat shadows); the
  washed rooms deepen `--color-ink-muted`/`-faint`/`--color-accent`/
  `-strong`, because a deeper wall owes deeper ink: muted and accent hold
  AA (≥4.8:1) on both washes, faint sits above its paper baseline.
- **The room sync contract.** A room's light gate also matches
  `[data-theme="system"]` in a dark scheme, so the dark media block resets
  every re-bound token to the midnight bundle's value. Those resets are
  hand copies, and `themes.sync.test.ts` now guards them both ways: each
  dark-media room token must equal the midnight bundle, and each
  light-gate room token must have a dark reset. The original
  midnight↔system-dark bundle contract is untouched (no bundle changed).
- **Theme gates.** Washes exist only under `gallery` / `midnight` /
  `system`; terminal and high-contrast keep plain page ground. The wall
  notes ride `.wardrobe-wall-note`, shown only in the painted themes and
  killed in text-mode — a note never describes paint that is not there.
- **The walls never move.** No animation, no transition — the universal
  text-mode flatten reads straight through the rooms.
- **Pigment hexes** sit in the painted-rooms section of `themes.css`,
  *before* the manga-materials marker where the raw-hex sweep begins — the
  same standing as the token bundles. Values are artbitrage's declared sRGB
  approximations (`pigments.json`, schema `artbitrage.pigments/1`).
- **Contrast in the dim room:** ink ≈13:1, muted ≈6.5:1, faint ≈4.8:1
  against the sumi wall (faint is *higher* contrast than its light-theme
  counterpart).
- **The mount learns the sheet ratio.** `aspect-[3/4]` → `aspect-[63/88]`
  (a TCG card's own proportions), mat padding `p-3/p-4` → `p-2.5/p-3`: the
  mat becomes an even margin instead of a letterbox with white slivers.
- **落款** — `.wardrobe-seal`, a 9px bronze chop on each section plate
  (gilt in the dark rooms). Static, token-inked, aria-hidden.
- The hover contract holds: mounts remain direct children of their
  `a`/`button`/`.group`, `m-2` still reserves the ring's ground.

## What this deliberately evolves

The quiet-gallery doctrine says "whitespace does the separating" and the
manga spec names the gap (間) the conceptual spine. The painted rooms keep
the 間 but give it tone: the separating space becomes a wall, not a void.
Three named densifications, all deliberate:

- **Grid gutters tighten one step inside the rooms** (`gap-y-14/16` →
  `gap-y-12/14`; header margins `mb-14/20` → `mb-10/12`) — the wall's tone
  now carries part of the separation the raw gap used to.
- **The dim room and the blue room butt-joint with no paper between.**
  Walking straight from a dark wing into a lit one is the museum
  experience; a paper strip would read as a hole in the wall, not a
  corridor.
- **The washes run 8–16% pigment** — lapis and sumi at whisper volume,
  Prussian deliberately deeper (its ledger hex is dark and low-chroma; the
  blue only reads past ~14%, and a wall of night skies suits the depth).

Card art remains the only saturated colour on any page. "Deepen, don't
shout," applied literally.

## Out of scope (deliberately)

- Culture-wing `MuseumPlate` re-framing (borrowed-light images keep their
  plain mats for now).
- Per-game weather inside the rooms; more pigments; period rooms on other
  pages. Adoption breadth can follow if the rooms prove themselves.
- **Five-voice wall notes.** The gallery sections are an existing named
  gap in the五つの声 coverage (no `tx()` anywhere in TheGallery/
  TheShowcase); the wall notes follow that convention for now. Giving the
  three notes translated bodies is a natural follow-up — they are short,
  and the charters' wall-label register fits them — but it is
  charter-grade work per voice, held for its own pass.
