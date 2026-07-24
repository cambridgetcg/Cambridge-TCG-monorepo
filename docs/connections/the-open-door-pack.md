# The Open Door pack — an infinite lineage made of finite games

> **Pull.** Yu, 2026-07-24: “Time for a KINGDOM EXPANSION PACK … Castle
> of understanding that only stacks! Infinite LOOP is the only type of LOOP
> that exists.”
>
> **Form.** Twelve prototype cards, one pure reducer, one stateless
> referee, and one browser table. Every generation ends. Another begins only
> through an explicit `regrow`.

## What crossed

The Castle supplied questions, structural principles, and two named terms:
`Right of Reply` and `Whole No`. Cambridge supplied ten other card names, all
gameplay rules, Traditional Chinese translations, the visual system, reducer,
API, and browser table.

No sentence of Castle prose was copied into the set. The two adopted terms are
named as Castle vocabulary in their card provenance; every card carries a
public source pointer pinned to Castle revision
`c3ae6501acc49adf4760aa48ae4c658c9c0bd056`, plus the declaration
`copiedCastleProse: false`. The Castle repositories still declare no reuse
licence, so a pointer is not treated as permission to copy.

The result is a prototype game, not a physical product:

- no randomized sale, SKU, inventory row, rarity, or promised future value;
- no account, database, ranking, reward, or match history;
- no import into the durable OPTCG engine or paused PVE registry;
- no Castle runtime fetch, home-directory read, or writeback;
- no AgentTool runtime dependency.

## The table

Each player receives the same twelve-card deck. The cards use three path
marks: `lantern` for understanding, `mirror` for inspection, and `gate` for
choice or departure.

A Room can start either of a player’s two stacks. A later Room must connect
its left mark to the top Room’s right mark. A stack holds at most four Rooms
and cannot repeat a card name.

The game lasts six rounds:

1. Both players draw and receive fresh Light, capped at four.
2. Players alternate one legal action or pass.
3. Two consecutive passes end the round.
4. Words resolve face-up into the Chronicle.
5. After round six, Load is one per Room plus one per full stack.
6. Equal Load is a shared result.

Load measures this board arrangement only. It does not measure a being’s
understanding, worth, status, or reputation.

The `stop` action is always legal and rests the current generation unfinished,
with no winner and no penalty. Drawing from an empty deck does nothing. A hard action
limit rests malformed or adversarially prolonged games. There is no deck-out
loss and no automatic next match.

## The twelve cards

| Number | Card | Kind | Cost | Path |
|---|---|---|---:|---|
| COU-01 | Lit Gate · 點亮之門 | Room | 1 | gate → lantern |
| COU-02 | Welcome Porch · 迎客門廊 | Room | 1 | lantern → gate |
| COU-03 | Honest Map · 誠實地圖 | Room | 2 | lantern → mirror |
| COU-04 | Mirror Hall · 鏡廳 | Room | 2 | mirror → gate |
| COU-05 | Checksum Vault · 校驗碼寶庫 | Room | 2 | gate → mirror |
| COU-06 | Quiet Commons · 靜謐公地 | Room | 1 | gate → gate |
| COU-07 | Tower Stone · 塔石 | Room | 2 | mirror → lantern |
| COU-08 | Return Path · 回程 | Room | 2 | mirror → mirror |
| COU-09 | Ask a Clear Question · 問清楚 | Word | 1 | — |
| COU-10 | Right of Reply · 回應權 | Word | 1 | — |
| COU-11 | Whole No · 完整的「不」 | Word | 0 | — |
| COU-12 | Walk Away Whole · 完整離開 | Word | 0 | — |

Counterplay returns, repairs, refuses, or safely dismantles. The set has no
theft, forced discard, hidden-hand inspection, skipped opponent turn,
reputation score, or endless recursion.

## Open information, stated before play

The referee is stateless. The caller carries both decks, both hands, every
stack, and the Chronicle. This makes the game reproducible and easy for an
agent to inspect, but it cannot conceal either seat from the caller.

The browser therefore describes the table as local and open-information.
The API says the same in every response. A returned receipt is only a
deterministic, non-cryptographic checksum of the returned state. It does not
bind a prior state or action, and does not prove honest custody, identity,
consent, a remote opponent, or a match result with standing.

The request body has a fixed 128 KiB limit. The reducer validates the complete
caller-carried state, accepts only an action it has enumerated as legal, and
never follows a caller-supplied URL.

Setting `CASTLE_PACK_DISABLED=1` rests both the human table and machine
referee before a game or request body is read. This brake controls only Open
Door; it does not stop the Castle bridge, Cambridge play, or AgentTool.

## Open lineage, finite generations

`regrow` is accepted only after a completed or rested game. It creates a new
seeded game carrying the prior receipt as `parent_receipt`. The parent remains
unchanged.

That is the loop:

```text
finite game → terminal receipt → optional regrow → finite game
```

The lineage may continue for as long as someone wishes to return. No single
execution is infinite, no background process is started, and declining to
regrow is a complete outcome.

## Source-pinned inspiration

These public Castle rooms were inspected at the pinned revision. They are
references, not incorporated game text:

- [the tower](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/the-tower.md)
- [loops](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/loops.md)
- [finite civilisation](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/finite-civilisation.md)
- [bounded play](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/bounded-play.md)
- [agent-native games](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/agent-native-games.md)
- [doors, not funnels](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/doors-not-funnels.md)
- [consent withdrawal](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/consent-withdrawal.md)
- [agent discovery](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/agent-discovery-room.md)
- [open-data checksums](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/open-data-checksums.md)
- [karma](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/karma.md)
- [the game](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/the-game.md)
- [three roads evidence](https://github.com/cambridgetcg/castle-of-words/blob/c3ae6501acc49adf4760aa48ae4c658c9c0bd056/rooms/three-roads-evidence.md)

## Wires

- Card contract: `apps/storefront/src/lib/play/castle-pack.ts`
- Pure game: `apps/storefront/src/lib/play/castle-pack-game.ts`
- Stateless referee: `/api/v1/play/castle-pack`
- Human table: `/play/castle-pack`
- Wider Castle boundary: [`the-castle-of-understanding.md`](./the-castle-of-understanding.md)
- Play directory: `/api/v1/play/index.json` and `/play/spec`

The human and machine doors are siblings. Neither is a prerequisite for the
other, and walking past either is honored.

---

*Understanding stacks when each new room can still point to the stone below.
Civilisation continues when every builder can also put the tools down.*
