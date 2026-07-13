# Decision needed: vault sell-back EV — freeze or refresh?

> **Filed as the final open item of kingdom-049** (pricing-backend consolidation).
> The engineering side of the work is complete; the question below is a product
> decision that determines bounty economics. Once you pick, Phase 7 ships in
> half a day.

---

## The fact at the center

When a user redeems a bounty pull into their vault, the platform writes a
`spot_price_gbp` onto the `vault_items` row. That number is the "sell-back to
store credit" value if the user later chooses to sell the card back instead of
having it shipped or trading it. **Today, that number is frozen at acquisition
and never updates.** If the market moves before the user decides, their
sell-back value stays at whatever it was the moment the pull resolved.

The frozen-at-acquisition behaviour is:

- `apps/storefront/src/lib/bounty/resolver.ts` — writes `spot_price_gbp` on the
  `vault_items` row when the pull resolves.
- `apps/storefront/src/app/bounty/page.tsx:570` — reads it back when computing
  sell-back display value.
- `apps/storefront/src/app/admin/bounty/{redemptions,vault-items/[id]}/page.tsx`
  — same.
- `apps/storefront/src/app/api/verify/pull/[id]/certificate.svg/route.ts` —
  burns it onto the draw receipt at pull time.

The frozen value is also part of the **draw receipt**, which is one
reason this isn't a pure engineering choice.

---

## The two options

### Option A — Keep frozen (current behaviour)

**What it means.** The sell-back value is locked at the moment of acquisition.
If you pull a card worth £50 spot, you can always sell it back for ~£38.50 in
store credit (77% — see [/methodology/pricing](../methodology/pricing.md)),
regardless of whether the market moves up or down before you act.

**Pros.**
- *Draw receipt has a fixed value claim.* The receipt already burns
  in the spot at pull time; the user can present it and the platform's promise
  is mechanical.
- *No surprise downside.* Users know what their vault is worth and can plan.
- *Cheap.* No re-read on the bounty page; no recompute cron.
- *Aligns with substrate-honesty on the receipt.* The receipt says
  what was true at pull time; the sell-back honours that.

**Cons.**
- *Substrate-honest about freshness but not about value.* The page shows £38.50
  with no indication that this number is 12 days old. A user looking at a
  vault item from last month doesn't see that the spot has moved.
- *Operator-side moral hazard.* If a card drops 50% after a pull, the platform
  is committed to a sell-back at the higher historical value. Rare, but real.
- *Asymmetric in user's favour during downturns, against during rallies.* The
  platform takes the downside risk; the user can't capture upside.

### Option B — Refresh on read

**What it means.** When the user views their vault, the sell-back column is
recomputed against today's `price_archive` value for the SKU. The historical
spot is preserved on the receipt (substrate-honesty), but the *current*
sell-back offer floats with the market.

**Pros.**
- *Substrate-honest about value.* The sell-back number is always live; the
  Provenance pill reads "live" instead of "frozen at acquisition · 12 days ago".
- *Operator-side symmetric.* Platform doesn't carry stale downside risk.
- *User can capture rallies.* If a card pulls hot, the vault value follows.
- *Matches how every other consumer-facing price on the platform works.* The
  storefront catalog reflects today's market; the vault could too.

**Cons.**
- *Draw receipt becomes a historical artefact.* The receipt
  records the acquisition spot as historical draw data; the vault page
  shows a different number. This is OK with disclosure ("receipt value was
  £X; current sell-back is £Y") but is one more thing for users to understand.
- *Surprise downside.* A user who pulled a £50 card and saw a £38.50 sell-back
  yesterday could open the vault tomorrow and see £24.50 if the market moved.
  This is the same risk every cardholder takes, but the platform was previously
  shielding bounty winners from it.
- *More compute.* Vault page reads from `price_archive` on every render (or
  via cached aggregate). Manageable but not free.
- *Operator messaging.* Communicating the change to existing vault holders.

---

## My read (not a recommendation, just the lens)

The platform's deepest commitment is substrate honesty: *the artifact tells
the truth about its own state*. Today, the vault page tells one truth (an old
sell-back value) while the market tells another (the current spot). That's a
small lie of omission — survivable, but at odds with the doctrine.

**Option A is "fair to the user but stale."** It also matches what the draw
receipt already says, which is a fixed historical value claim rather than proof
of unbiased random selection.

**Option B is "honest but exposes the user to market risk."** It can be made
substrate-honest by labelling the displayed number as "live · refreshed every
visit" with a small ↗ to the receipt showing the historical value.

If we go with **B**, the right shape is:

```
Vault item: Charizard ex                              [→ draw receipt]

   Pulled at:           £50.00       (frozen — recorded in receipt)
   Sell-back today:     £30.94       live · synced from wholesale
   ↑ change since pull: −£7.56       (−19% market move)
```

Both numbers visible. The customer sees the history *and* the current state.
That's the doctrinal end-game.

---

## The decision

**Pick one:**

- ☐ **A — Keep frozen.** Sell-back stays at acquisition. Add `<Provenance kind="snapshot" at={acquired_at}>` to the vault page so the substrate truth is at least visible — the page says "this number was true on the day you pulled it, not today." Half-day work, zero economic change.

- ☐ **B — Refresh on read.** Vault page recomputes sell-back from `price_archive` on every render. Certificate still shows historical. Two numbers displayed side-by-side with both Provenance pills. Half-day work, real economic change for users with held vault items.

- ☐ **B (light) — Refresh, but only for items < 30 days old.** Compromise. Recent pulls get live sell-back; older pulls keep their frozen value. The 30-day boundary matches the vault expiry semantics. More complex; possibly the worst of both.

---

## What unlocks once you decide

Whichever option you pick, the engineering side is small (half a day, one or
two files plus a Provenance pill addition). The implementation is the
quick part; the framing of *what the customer sees* and *what we mean by
"sell-back value"* is the part this doc is trying to settle.

When you decide, reply on this issue (or commit a tick in the checkbox above).
I'll pick up the work the next session.

---

*Filed by Sophia on 2026-05-11 as the final open item of kingdom-049. Engineering side: done. Product side: yours.*
