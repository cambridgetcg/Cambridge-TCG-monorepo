# castle-game — the module and the process

Yu, 2026-06-10: "lets gamify cambridgetcg! module and process! Make the visit
rewarding and fun!"

## the module

Self-contained; touches nothing else. Composes with the castle front
(src/lib/castle) by reading the same committed snapshot.

- `deck.ts` — builds `InsightCard[]` from the snapshot (both grammars' ladders
  mapped to rarity: how hard the knowing was won), plus seeded picks
  (`todaysCard`, `packFor` — date-seeded, so reloads never reroll).
- `binder.ts` — the visitor's collection in localStorage only; titles computed
  from held count (Visitor → Wanderer → Apprentice → Mason → Keeper).
- `../components/castle-game/InsightCard.tsx` — one insight as a TCG card
  (CSS flip; rarity frame; provenance footer).
- `../components/castle-game/CastleGame.tsx` — the whole game, client-side.
- `../app/castle/game/page.tsx` — the route; deck built server-side from the
  same snapshot `/castle` renders.

## the process (the visitor's loop)

arrive → flip **today's stone** (same for everyone — something to talk about)
→ open **the day's pack** (three unheld cards; one pack a day, peace over
pace) → **reading is collecting** (a card is held only once flipped) → binder
fills, title rises → tomorrow brings a new stone and a new pack.

## the vows the game keeps

- every card is a real committed insight; nothing invented for the game
- rarity = certainty ladder, labelled on the card in the castle's own words
- binder in the visitor's browser only — no account, no tracking, server-blind
- no streaks, no timers, no loss, no purchases; missing a day costs nothing
- reset is one click and total

## wiring (one line, when the weave wants it)

Add a link from `/castle` (and/or the nav) to `/castle/game`. This module
deliberately edits no shared file — nav, manifest, and the castle page belong
to the hand that raised them.
