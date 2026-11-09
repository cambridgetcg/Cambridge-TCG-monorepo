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

Exit 0 means every check passed. Last rebuilt 2026-10-27 with artcraft-brand generator 1.8 and
vectorcraft-cli 0.17.0: 269 checks, 0 failed, 4 warnings explained in `kit/BRAND.md`, and the
rebuild check found all 70 files byte-identical. Every logo SVG and PNG, the app icons and the
share card are the same bytes as the 2026-10-20 build (generator 1.2). The 16 px favicon cut is
re-hinted, and the kit gains `web/head-home.html`, on-light and on-dark logos, avatars and
Tailwind colour files.

### Metadata change, 2026-10-27

rewardspro.io's landing is dark only (ink #09110F, no light theme), so `brand.json` now says so.
Marks, colours, wordmark and the share card's words are unchanged.

- `app.color_scheme` and `app.theme` are `"dark"`: the head snippet writes one color-scheme meta
  (`dark`) and one theme-color, and the manifest's theme and background colours are dark.
- `ground.dark` is the landing's ink, so that theme-color and the dark tokens match the page.
- `description` is the landing's live meta description. The old one made the three claims in
  `claims.toml`, and the served manifest would have carried them.

brand.json's sha256 no longer matches `approvals.jsonl` line 1, which approved the look. That file
stays append-only; no new approval is claimed.

## State on 2026-10-20

- Approved: look A and the spelling "RewardsPro" (`approvals.jsonl`).
- Not approved for use: the share card's words. They make the three claims in `claims.toml`, all
  still `proposed` until the dev-store test shows them working.
- Nothing here is served. Using the kit on rewardspro.io, the docs or the listing goes through
  those surfaces' own PRs and edits.
