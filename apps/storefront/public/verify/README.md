# Cambridge TCG Standalone Verifier

Single-file ES module that reimplements every check Cambridge TCG performs on a provably-fair draw. Fetch it anywhere, run it anywhere, never trust us:

```
https://cambridgetcg.com/verify/cambridgetcg-verifier.js
```

## Browser

```js
import * as v from 'https://cambridgetcg.com/verify/cambridgetcg-verifier.js';

const { payload, verdict } = await v.fetchAndVerifyPull('00000000-0000-0000-0000-000000000000');
console.log(verdict.allMatch ? '✓ verified' : '✗ failed', verdict);
```

## Node 18+

Web Crypto is native in Node 18+. Just:

```js
import * as v from './cambridgetcg-verifier.js';
```

## What you get

- `sha256Hex`, `sha256HexPair`, `rollFloat`, `pickWeighted` — raw primitives
- `verifyDraw(payload)` — commitment, per-slot reproduction, ordering
- `computeLeaf`, `merkleRoot`, `verifyInclusion` — Merkle anchoring
- `verifyChain(digests)` — hash-chain integrity across the digest feed
- `fetchAndVerifyDraw`, `fetchAndVerifyPull` — one-call helpers

## Design

Dep-free. No npm install. No bundler. No build. Single file, ~250 LOC, MIT-licensed. If anything here diverges from [the explainer page](https://cambridgetcg.com/verify/how-it-works), the page is canonical — please report the bug.

## Tamper-evidence audit

```js
const { digests, tip } = await fetch('https://cambridgetcg.com/api/verify/chain').then(r => r.json());
const { chainValid, chainTip } = await v.verifyChain(digests);
console.log('chain valid:', chainValid, 'tip:', chainTip);
```

Cache the tip. Re-fetch `?from_id=<lastId>` later and recompute from your cached tip — if the published tip matches your recomputation, the entire history between has not been rewritten.
