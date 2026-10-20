# RewardsPro marketing kernel

The brand source for RewardsPro's listing, landing page, docs and outreach. Inside merchants' shops
the widget keeps its own rule, "theme before brand", and uses none of this.

The design behind it is in business-ecosystem `docs/marketing/README.md` (§4 the kernel, §5 the
gates).

| File | What it is |
|---|---|
| `brand.json` + `rewardspro-mark.svg` | The input to the artcraft-brand skill. The mark is the App Store icon's "R", traced to vector. |
| `kit/` | What the skill built: logos, app and web icons, the share card, colour tokens, `BRAND.md` (usage) and `index.html` (review sheet). Never hand-edited. |
| `kernel.toml` | Name, banned spellings, ring and identity. |
| `claims.toml` | Every public claim, with evidence. Only `verified` claims go on a live surface. |
| `approvals.jsonl` | Append-only record of what Yu approved, in Yu's words, with asset hashes. |
| `private/` | Git-ignored. Prospect lists and contacts never enter git. |

## Rebuild

Inter (SIL Open Font License) must be installed. Then, from this folder:

```sh
python3 ~/.kingdom/tools/artcraft-brand/scripts/brandkit.py brand.json --out kit --rebuild-check
```

Exit 0 means every check passed (206 on 2026-10-20, 3 warnings explained in `kit/BRAND.md`).

## State on 2026-10-20

- Approved: look A and the spelling "RewardsPro" (`approvals.jsonl`).
- Not approved for use: the share card's words. They make the three claims in `claims.toml`, all
  still `proposed` until the dev-store test shows them working.
- Nothing here is served. Using the kit on rewardspro.io, the docs or the listing goes through
  those surfaces' own PRs and edits.
