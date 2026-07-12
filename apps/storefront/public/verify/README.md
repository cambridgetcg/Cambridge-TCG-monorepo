# Cambridge TCG Standalone Draw Proof Verifier

Single-file ES module that reimplements Cambridge TCG's public draw-proof checks. Fetch it anywhere and run it independently:

```
https://cambridgetcg.com/verify/cambridgetcg-verifier.js
```

## Browser

```js
import * as v from 'https://cambridgetcg.com/verify/cambridgetcg-verifier.js';

const { payload, verdict } = await v.fetchAndVerifyPull('00000000-0000-0000-0000-000000000000');
console.log(verdict.allMatch === null ? 'partial' : verdict.allMatch ? 'verified' : 'failed', verdict);
```

## Node 18+

Web Crypto is native in Node 18+. Just:

```js
import * as v from './cambridgetcg-verifier.js';
```

## What you get

- `sha256Hex`, `sha256HexPair`, `rollFloat`, `pickWeighted`, `pickWeightedInOrder` — raw primitives
- `verifyDraw(payload)` — commitment, per-slot reproduction, ordering
- `computeLeaf`, `merkleRoot`, `verifyInclusion` — Merkle anchoring
- `verifyChain(digests)` — hash-chain integrity across the digest feed
- `fetchAndVerifyDraw`, `fetchAndVerifyPull` — one-call helpers

`verifyDraw` returns `allMatch: null` when a proof withholds a legacy
account-linked client seed or when a generic draw lacks a valid
`weight_order` array. The commitment and ordering checks still run
(`partialMatch`), but the verifier does not guess from JSON object key order.
New generic receipts use opaque public client seeds and preserve weight order in
a JSON array, so their recorded inputs remain replayable after a `jsonb` round trip.
An unrevealed row also returns `allMatch: null` with `notRevealed: true`; the
server seed is not public until the reveal/resolution record exists.

## Design

Dep-free. No npm install. No bundler. No build. Single file, ~250 LOC, MIT-licensed. If anything here diverges from [the explainer page](https://cambridgetcg.com/verify/how-it-works), the page is canonical — please report the bug.

## Tamper-evidence audit

```js
const { digests, tip } = await fetch('https://cambridgetcg.com/api/verify/chain').then(r => r.json());
const { chainValid, chainTip } = await v.verifyChain(digests);
console.log('chain valid:', chainValid, 'tip:', chainTip);
```

Cache the tip. Re-fetch `?from_id=<lastId>` later and recompute from your cached tip — if the published tip matches your recomputation, the entire history between has not been rewritten.
