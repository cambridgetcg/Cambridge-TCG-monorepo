# Decision needed: multi-currency display (kingdom-051 Phase 7)

> **Filed as part of kingdom-051's deferred-phase queue.** Engineering
> side is ready *as soon as the FX-source decision is made*. This doc
> exists to make that decision tractable.

---

## The fact at the center

Every price on the storefront displays in GBP. The user is assumed to
think in pounds. The eight pricing channels in `@cambridge-tcg/pricing`
convert from JPY listings to GBP retail; the platform internalises one
currency for legal/tax purposes (we are a UK business, VAT-registered
on GBP).

But many real users *don't* think in GBP natively: visitors from Japan,
China, the US, Brazil, the EU. They convert £5.20 to ¥970 / $6.30 /
R$33 in their head before deciding. The conversion is a thumb-tax: it
slows the decision, sometimes wrongly.

This is the Culturally Different archetype from S20. The work is to
*display* the user's preferred currency alongside the canonical GBP
price, with a Provenance pill making clear which is authoritative.

The blocker is engineering's: **where do we get the FX rates from, and
how often do they refresh?**

---

## The options for FX source

### Option A — Bank rates via wholesale's existing `gbp_jpy_rate`

**What it means.** Already in the kingdom — every snapshot row of
`price_archive` carries the GBP/JPY rate as-of capture. Extend that
pattern: store GBP/EUR, GBP/USD, GBP/CNY, GBP/JPY (already), GBP/KRW
in a new daily `fx_rates` table on the wholesale RDS. Update via the
existing snapshot cron at 02:00 UTC.

**Pros.**
- *Same substrate the platform already trusts.* The rate is captured at
  the same moment as the pricing, so the displayed conversion is
  *internally consistent* with the underlying GBP authority.
- *Daily refresh matches daily pricing snapshot.* Consistent staleness;
  one Provenance pill ("synced from market · 4h ago") covers both.
- *Simple.* One new table, one new cron step, no third-party
  integration.

**Cons.**
- *Daily staleness.* If GBP moves 2% intraday, the displayed conversion
  is wrong by ~2%. For a £5 card, ±£0.10. For a £500 card, ±£10.
- *Where does the rate come from?* Today wholesale's `gbp_jpy_rate` is
  fetched from an external FX API (`fetchGbpJpyRate` in
  `apps/wholesale/src/lib/fx.ts`). Adding more pairs means more API
  calls; need to pick a source.

### Option B — Live rates via a public FX feed

**What it means.** On each render, fetch (or cache-aside) the current
FX rate from a public feed (exchangerate.host, ecb.europa.eu, etc.).
Display the converted price live. Cache 15 minutes server-side to keep
the call-rate manageable.

**Pros.**
- *Always-fresh.* The conversion is current at render time; the user
  sees what their bank would charge them today.
- *Substrate-honest at the moment.* Provenance pill reads "live ·
  refreshed every visit."

**Cons.**
- *Render latency.* Even a 15-minute cache means every cache-miss adds
  ~100ms to a page load.
- *Third-party dependency.* The platform's pricing display becomes
  reliant on an external feed's uptime.
- *Edge-cases.* A user reloads twice in a minute and sees two slightly
  different prices because the cache rolled over. Worth a tooltip.

### Option C — Bank API integration

**What it means.** Pull rates from a bank-grade source (Stripe's
own FX rates, since the platform already integrates Stripe). On
checkout, Stripe will charge the user's card in *their* currency at
*their* bank's rate — so showing Stripe's rate beforehand is the most
accurate prediction of what they'll actually pay.

**Pros.**
- *Predictive of the real charge.* The number the user sees is
  remarkably close to what their bank actually debits.
- *No new third-party dep.* Stripe is already in the stack.

**Cons.**
- *Stripe Bank API rate-limits are not free.* Calling per render
  doesn't scale; need an aggressive cache.
- *Less obvious to explain.* Provenance pill reads "predicted via
  Stripe's bank-grade FX · refreshed daily." More text.

---

## The independent question — display where?

Regardless of FX source, where do we show the converted price?

- **Inline next to GBP** — `£5.20 (≈ ¥970)`. Compact, immediate.
- **Tooltip on hover** — clean UI, less discoverable.
- **User-pref override** — once user sets preferred display currency,
  *replace* GBP with their currency throughout (with a small "GBP
  authoritative" footnote). Most invasive but most honest about the
  user's preference.

My lean: **inline next to GBP, with the user's currency in parentheses,
plus a Provenance pill on the conversion**. Keeps GBP authoritative;
provides the mental-translation service; substrate-honest about the
rate's freshness.

---

## The decision

**Pick the FX source:**

- ☐ **A — Daily-snapshot rates** (matches existing pricing cadence).
  Simplest. Some staleness.
- ☐ **B — Live public FX feed**. Freshest. External dep.
- ☐ **C — Stripe's bank-grade rates**. Most-predictive of real charge.
  Stripe API rate-limit concern.

**Pick the display:**

- ☐ **Inline next to GBP** (recommended)
- ☐ **Tooltip on hover**
- ☐ **User-pref overrides GBP display**

**Or:**

- ☐ **D — Defer.** Non-GBP users continue to convert in their head.
  Add `<WhyLink href="/methodology/pricing">` text noting GBP is the
  canonical currency.

---

## What unlocks once you decide

If A: ~2 days engineering. New `fx_rates` table; new snapshot cron
step; new `/account/preferences/display-currency` setting; conversion
helper in `@cambridge-tcg/pricing` (alongside the existing
computePriceForChannel). All currency-displaying pages gain the
inline-conversion + Provenance pill.

If B or C: ~3 days. Same scope plus the third-party integration.

If D: nothing changes. The audit logs the gap; future Sophias know it
was deliberate.

---

*Filed by Sophia on 2026-05-11 as part of kingdom-051's deferred-phase
queue. Engineering side: ready. FX-source decision: yours.*
