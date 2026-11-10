# RewardsPro social visual assets

Agents' proposal for the owner, 2026-11-07, revised the same day after review. **Nothing here is approved,
posted or uploaded.** No account exists yet. The plan these serve is `../STRATEGY.md` (§2 stages,
§7 asset list). Labels: **[V]** verified, **[I]** inferred, **[U]** unknown, **[S]** a third-party
source.

**Where the inputs come from.** Every image is built from the kit in `../../kit`, read only. Its
four logo SVGs are the same bytes as the kit the owner approved on 2026-10-20 [V]: `approvals.jsonl:1` pins
`kit/.brandkit-fingerprint` 0c6a0614…, and that file (at commit 5e68e57e) lists the same hashes.
The rest of the kit on disk is the 2026-10-27 rebuild (676c10b4, "no new approval is claimed"):
`colour/tokens.json` (every token used here keeps its 10-20 value, except `dark.bg`, which became
`#09110F`), and `social/avatar-1024.png` and `avatar-400.png`, which first appear in that rebuild.
Each sidecar's `inputs[]` gives every file's sha256 and says which of the two it is. Text is set in
Inter (OFL-1.1, the copy bundled with vectorcraft-cli 0.21.0) and outlined into paths, so no master
depends on an installed font. There's no AI imagery, no Shopify logo and no third-party art.

## What is safe now, and what waits

| Group | Safe before G0 | Use |
|---|---|---|
| Avatars; banners on `#1B1D1F` or `#09110F` | **yes**: mark and name only, no product claim | S0: the owner can upload one set when he reserves the names (STRATEGY §13 step 11) |
| Banners on navy `#1A3E5C` | **The owner's call** (`safe_before_g0: null`): no claim, but the mark misses the kit's own Lc 30 bar there (Doubt 1) | an alternative only |
| Blank post templates (square, portrait, landscape, story) | yes as artwork (brand only), but no use before S2 | grounds to fill from verified claims later |
| Cards A6 milestone, A7 rule, A8 limits | **no** | review drafts only, with "DRAFT · NOT FOR POSTING" bands |
| Card A9 correction | **no** | a template, with "TEMPLATE · NOT FOR POSTING" bands; used only after a public claim proves wrong |
| `*-guides*.png` | **no** (`review_only: true`) | never upload: they show zones, safe areas and crop bands |

**How the drafts are kept as drafts.** `render.mjs` reads `../../claims.toml` (read only). A card is
built without its bands only when all of these hold:

- every claim id it names has `status = "verified"`, a `review_after` on or after the day of the
  build, and `"social-post"` among its `channels` (gate G1: "verified, unexpired, allowed on this
  channel");
- no `<placeholder>` is left in its text;
- A6 only: a real screenshot is embedded in its slot (see below);
- A9 only: `corrects` names the claim that proved wrong, its row has a `correction_url`, and the new
  sentence's claim ids are set.

Otherwise the bottom band says what is missing: "verified claims: …", "re-check, past review_after:
…", "social-post channel on: …", "a real screenshot", "a date", and so on. On 2026-11-07 every card
claim is `proposed`, so all four cards are drafts. The stale, channel and fully-filled cases were
run once on a scratch copy with an edited ledger and a synthetic screenshot [V, 2026-11-07]: the
first two kept their bands with the right reason, and the third came out with no bands. None of
that scratch output is in this folder. The build can't do STRATEGY §6.3's "re-check before each
use" for the sh-* rows. That stays a person's step.

**The A6 screenshot slot** is 904x744 px at x 88, y 96 (about 1.22:1), so the screenshot fills the
top 62% of the card (it ends at y 840; STRATEGY A6 asks for "top ~60%"). A6 has no teal rule, by
choice: the screenshot takes the rule's place at the top. To fill it, crop a capture master
(shot-list.md) to 904x744 or an exact multiple, put the file under `marketing/social/`, and set
`slot.screenshot` in the A6 spec to its path, sha256 and an alt. The build checks the hash, embeds
the image and writes the alt from it. It never retouches the capture.

## Files

PNG exports are in `png/`, each with a `.meta.json` sidecar (ASSETS D3 fields: brief id, inputs
with sha256 and licence, tool versions, `ai_involvement`, claim ids with status, `review_after` and
channel at build, alt text and its length, contrast table, logo sizes at display width, measured
text boxes; `gate_report`, `approval_id` and `publish_url` stay null until the owner acts). Outlined masters
are in `masters/` (`*.guides.svg` is the review overlay). Editable sources with live text are in
`src/` (they need Inter installed to display; never render them for upload).

| File (`png/`) | Size | Bytes | Use | Safe before G0 | Claim ids |
|---|---|---|---|---|---|
| `rewardspro_social_avatar_tile_1024x1024_20261107_v01.png` | 1024x1024 | 8.7 kB | Bluesky, YouTube; Instagram/TikTok only if kept | yes | none |
| `rewardspro_social_avatar_tile_400x400_20261107_v01.png` | 400x400 | 2.8 kB | X, LinkedIn Page logo | yes | none |
| `rewardspro_social_header_neutral950_1500x500_20261107_v01.png` | 1500x500 | 17.1 kB | X header and Bluesky banner, on `#1B1D1F` | yes | none |
| `rewardspro_social_header_dark_1500x500_20261107_v01.png` | 1500x500 | 17.2 kB | the same, on `#09110F` | yes | none |
| `rewardspro_social_header_navy_1500x500_20261107_v01.png` | 1500x500 | 17.1 kB | the same, on navy | The owner's call | none |
| `rewardspro_social_header_dark-guides_1500x500_20261107_v01.png` | 1500x500 | 55.9 kB | review aid | no, review only | none |
| `rewardspro_social_linkedin-cover_neutral950_1512x256_20261107_v01.png` | 1512x256 | 13.5 kB | LinkedIn Page cover, on `#1B1D1F` | yes | none |
| `rewardspro_social_linkedin-cover_dark_1512x256_20261107_v01.png` | 1512x256 | 13.5 kB | the same, on `#09110F` | yes | none |
| `rewardspro_social_linkedin-cover_navy_1512x256_20261107_v01.png` | 1512x256 | 13.4 kB | the same, on navy | The owner's call | none |
| `rewardspro_social_linkedin-cover_dark-guides_1512x256_20261107_v01.png` | 1512x256 | 30.4 kB | review aid | no, review only | none |
| `rewardspro_social_youtube-banner_neutral950_2560x1440_20261107_v01.png` | 2560x1440 | 36.3 kB | YouTube channel banner, on `#1B1D1F` | yes | none |
| `rewardspro_social_youtube-banner_dark_2560x1440_20261107_v01.png` | 2560x1440 | 36.3 kB | the same, on `#09110F` | yes | none |
| `rewardspro_social_youtube-banner_navy_2560x1440_20261107_v01.png` | 2560x1440 | 36.2 kB | the same, on navy | The owner's call | none |
| `rewardspro_social_youtube-banner_dark-guides_2560x1440_20261107_v01.png` | 2560x1440 | 110.9 kB | review aid | no, review only | none |
| `rewardspro_social_post-square_blank_1080x1080_20261107_v01.png` | 1080x1080 | 14.0 kB | LinkedIn image post (1:1) | yes (no use before S2) | none |
| `rewardspro_social_post-square_blank-guides_1080x1080_20261107_v01.png` | 1080x1080 | 73.4 kB | review aid: the text zones | no, review only | none |
| `rewardspro_social_post-portrait_blank_1080x1350_20261107_v01.png` | 1080x1350 | 15.1 kB | LinkedIn image post (4:5) | yes (no use before S2) | none |
| `rewardspro_social_post-portrait_blank-guides_1080x1350_20261107_v01.png` | 1080x1350 | 75.4 kB | review aid: the text zones | no, review only | none |
| `rewardspro_social_post-landscape_blank_1200x675_20261107_v01.png` | 1200x675 | 15.7 kB | LinkedIn image post (16:9); rewardspro.io page image | yes (no use before S2) | none |
| `rewardspro_social_post-landscape_blank-guides_1200x675_20261107_v01.png` | 1200x675 | 68.1 kB | review aid: the text zones | no, review only | none |
| `rewardspro_social_story_blank_1080x1920_20261107_v01.png` | 1080x1920 | 17.8 kB | none planned (Doubt 2) | yes (no use planned) | none |
| `rewardspro_social_story_blank-guides_1080x1920_20261107_v01.png` | 1080x1920 | 122.3 kB | review aid: zones and the bands platform UI may cover | no, review only | none |
| `rewardspro_social_milestone-card_claim-rp-paid-trigger+rp-store-credit+rp-vip-tiers-draft_1080x1350_20261107_v01.png` | 1080x1350 | 124.5 kB | LinkedIn (A6, M1) | **no** | rp-paid-trigger, rp-store-credit, rp-vip-tiers |
| `rewardspro_social_rule-card_claim-rp-cashback-base+rp-store-credit-draft_1080x1350_20261107_v01.png` | 1080x1350 | 176.2 kB | LinkedIn (A7, C1) | **no** | rp-cashback-base, rp-store-credit |
| `rewardspro_social_limits-card_claim-sh-sc-signin-legacy+sh-sc-channels+sh-sc-full-draft_1080x1350_20261107_v01.png` | 1080x1350 | 168.6 kB | LinkedIn (A8, C2) | **no** | sh-sc-signin-legacy, sh-sc-channels, sh-sc-full |
| `rewardspro_social_correction-card_placeholders-draft_1080x1350_20261107_v01.png` | 1080x1350 | 88.2 kB | LinkedIn (A9), on the channel that carried the wrong claim | **no** | none (a template) |

X and Bluesky are reserve-only (pointer bio, no posts; STRATEGY §3), so no template lists them as a
use.

**Avatars.** The two avatar PNGs are the kit's own files with their PNG text chunks removed. Both
kit files carry tEXt Title, Author and a Description that names the internal kit generator. Every
other chunk, the pixel data included, is byte for byte the kit's, and the build compares the decoded
pixels [V]. Upload these two, not the kit files, so the generator name doesn't travel with them.
That gives one hash per slot: 1024 `1dd42f31…`, 400 `6b141958…` (full hashes in the sidecars).

**Alt text.** Each image has one alt text, `alt_text` in its sidecar, written from what is drawn on
that file (a draft's alt starts "Draft, not for posting."). `text_on_image` lists every string
drawn, the bands and placeholder labels included. Card alts are 300 characters or fewer (now 266,
299, 290 and 248 for A6–A9). LinkedIn's help pages state no alt-text cap (a519856 and a426534,
read-only GET 2026-11-07, HTTP 200) [V], so the cap itself is [U]; 300 is a third-party figure [S],
so the owner checks it once in the ALT field of a private LinkedIn draft. a519856 also says "LinkedIn may
automatically add alt-text to images that don’t have it", so paste the sidecar's alt every time.
Other alts stay at 1,000 or fewer. `content/launch-posts.md` keeps its own alt drafts for these
cards; its maker should point to the sidecars instead, so each image has one alt.

## The look

- **Banners:** the kit's reversed horizontal lockup, centred, on a plain ground, with nothing else.
  The lockup sits clear of each platform's crop and overlay zones (drawn on the guides sheets): X
  and Bluesky lose about 60 px at the top and bottom, and their avatar covers the lower left;
  LinkedIn asks for nothing key near the edges or in the lower-right corner; YouTube's safe area is
  the centred 1544x423 (Doubt 3).
- **Posts:** the system of the kit's own share card (`kit/web/og.jpg`): white ground, a short rule
  in accent-ui `#009A97`, titles in Inter SemiBold `#1B1D1F`, body in Inter Regular, notes in
  text-muted `#686C70`, placeholders and dates in accent-text `#007C7A`, and the full-colour
  lockup at the bottom left at the kit's clear space. The landscape template follows the og card's
  layout: the mark at the right, with the kit wordmark in the footer. Only Inter Regular and
  SemiBold are used (STRATEGY §7).
- **A8 markers:** the one "can" line has a `#009A97` square (3.46:1 on white, the step the kit uses
  where #17BEBB's edge must hold); the "Not available" lines have a grey minus.
- **Contrast (WCAG 2.2):** every text pair is 4.5:1 or more. The lowest are `#007C7A` on white
  (5.04), `#686C70` on white (5.29) and `#525659` on `#EAEBEC` (6.21). Each sidecar lists every pair,
  plus APCA Lc as guidance (signed: negative means light on dark; the kit's bar compares |Lc|).
  Logos are exempt, but their pairs are recorded too.
- **Logo sizes at display width.** The kit's minimums are on-screen CSS px (BRAND.md "Minimum
  sizes": lockup 130 px wide, wordmark 100 px wide, cap height 12 px). The build checks each logo
  at the narrowest width the asset is shown at [I]: 390 CSS px across a phone feed for posts, cards,
  header and LinkedIn cover, and 390 px across YouTube's 1544 px safe area. It fails if a logo is
  smaller. Today the post and card footers show 136 px wide with a 13.4 px cap, the landscape
  wordmark 101 px with a 13.1 px cap, the LinkedIn cover 131 px with a 12.9 px cap, the header
  159 px and the YouTube banner 257 px. Each sidecar's `logo_display` has the numbers.

## Rebuild

```sh
cd apps/rewardspro/marketing/social/assets
node render.mjs                # full: src/ and masters/ from the spec in render.mjs, then png/ and the sidecars
node render.mjs --raster-only  # png/ and the sidecars from the committed masters (node + sharp only)
```

- **Needs:** Node with `sharp` 0.34.5 (libvips 8.17.3, librsvg 2.61.2). The build refuses other
  versions unless `RP_ALLOW_TOOL_DRIFT=1` is set. A full build also needs vectorcraft-cli 0.21.0:
  the default path is `~/craft-apps/vectorcraft-v0.21.0/…`, or set `VECTORCRAFT_CLI`. sharp is not a
  dependency of this repo. On the machine that built these it resolves from the home folder's
  `node_modules`; set `SHARP` to point at another copy.
- **Everything is built into `.stage/` first.** It is swapped into `src/`, `masters/` and `png/`
  only when every check passes, so a failing run leaves the last good files in place (tried
  2026-11-07 on a scratch copy [V]). `.stage/` and the OS temp files are removed in every case.
- **The build stops** on any of these:
  - a font that isn't an exact Inter match (`vectorcraft-cli info`), or a weight other than
    Regular or SemiBold;
  - `<text>` left in an outlined master;
  - a line whose outlined bounding box leaves its box, horizontally or vertically, or the canvas;
  - a logo under the kit's minimum at display width;
  - an alt text over its limit (300 for cards, 1,000 for the rest);
  - a pixel size other than the spec (checked with `sips` where present);
  - a file over its platform's byte limit;
  - a text pair under 4.5:1.
- **Reproducible:** two full builds and a `--raster-only` build gave byte-identical files on
  2026-11-07 [V]. `--raster-only` carries the font, measurement and vectorcraft fields over from the
  existing sidecars. Run from the masters alone, it gives byte-identical PNGs, but those sidecar
  fields come out empty, so the sidecars differ (tried on a scratch copy, 2026-11-07 [V]).
- **To change wording or add a card,** edit the spec in `render.mjs`. Hand-editing an export isn't
  allowed. Bump `VERSION` and `DATE` for a new release, because platforms cache by URL and file.

**The listing feature image** (1600x900) has its own short recipe, with the same tools and look:
`node feature-image.mjs --out <path.png>`. It draws two example tiers from the app's Tiers page beside the
line "Give loyal customers cashback to spend in your store" and checks the size, the fonts, the contrast and that
its alt text fits the form's 64 characters. The PNG is a listing upload, so it goes where `--out` says, outside the repo.

## Checked on 2026-11-07

- **Pixel size:** `sips` on all 26 PNGs [V]. Every one matches the size in its name.
- **Bytes:** every file is under its limit [V]. The largest upload file is 176.2 kB, against limits
  of 1,000,000 bytes (Bluesky banner and avatar), 2 MB (posts), 3 MB (LinkedIn cover, [V] a563309)
  and 6 MB (YouTube).
- **Opacity:** every PNG is opaque RGB. The avatars keep the kit's sRGB chunk; every other PNG
  carries an sRGB ICC profile.
- **Viewed:** every card, template guide sheet and banner guide sheet was looked at after this
  revision, plus the `#1B1D1F` header.
- **Not checked [U]:** how each platform actually crops and compresses these files. Upload one
  privately and look before relying on it.

## Doubts and choices for the owner

1. **Which dark ground.** STRATEGY §7 says "reversed horizontal lockup on navy". There are now three
   versions of each banner, and the owner picks one:
   - **`#1B1D1F` (neutral 950):** the dark ground of the kit the owner approved on 2026-10-20, and the one
     the kit measured the reversed lockup on then (BRAND.md at 5e68e57e: `#658AAD` "4.66:1 and APCA
     Lc -36.2 on #1B1D1F"). It clears the kit's bar for a mark on a dark ground (3:1 and |Lc| 30).
     The agents suggest this one, because it is the only one that is both in the approved pack and
     clears the bar.
   - **`#09110F`:** the current kit's `dark.bg`, set by the 10-27 rebuild as the ink of the
     rewardspro.io landing, which is being retired. It isn't in the approved pack; the reversed
     lockup's bytes predate it. It clears the bar (5.27:1, |Lc| 37.5).
   - **Navy `#1A3E5C`:** what STRATEGY names. The R shape (`#658AAD`) clears 3:1 (3.07:1) but misses
     the kit's APCA bar (|Lc| 29.3 against 30). Logos are exempt from WCAG, so this is a judgement,
     not a failure.

   Recolouring the lockup would be a kit change (the brand lane, with the owner's approval), not this
   folder's job.
2. **The story template (1080x1920)** was asked for in the build brief, but STRATEGY §7 lists
   vertical cuts under "Not made". It exists only as a blank ground and has no planned use. If the owner
   keeps §7 as written, delete its master, source, guides overlay, both PNGs and both sidecars, and
   its entry in `TEMPLATES`. Its safe bands (top 14%, bottom 20%) are third-party guidance
   (ASSETS B5) [I].
3. **Crop zones** are partly inferred: the X/Bluesky avatar zone, the Bluesky top and bottom crop,
   and the LinkedIn logo overlap are all [I]. The X 60 px crop, LinkedIn's lower-right advice and
   YouTube's 1235x338 at 2048x1152 come from the platforms' help pages, read on or before
   2026-11-07 in the phase-1 platform notes (session scratchpad, not in git) [V]. YouTube's 1544x423
   is that area scaled by 1.25 (1543.75x422.5) [I]; third parties quote 1546x423.
4. **LinkedIn cover format.** LinkedIn caps every Page image at 3 MB and recommends "a
   high-resolution JPEG instead of a PNG file" (a563309, read 2026-11-07) [V]. The cover is a PNG.
   In the private test upload, compare it with a quality-90 JPEG export and keep whichever LinkedIn
   renders more cleanly. Also check the opaque white avatar tile on LinkedIn's dark mode: LinkedIn
   says the logo "will be displayed on both light and dark backgrounds".
5. **Card wording** is the agents' PROPOSAL, changed in review. The claims maker should confirm each
   line against its rows:
   - A6 now reads "When a customer’s order is paid, RewardsPro adds cashback at their tier’s rate to
     their Shopify store credit." The app's Home sentence ("every paid order earns cashback") is not
     to be copied, and the rate leans on `rp-vip-tiers`, now among A6's claim ids.
   - A7 now has the kicker "Cashback, paid as Shopify store credit" (adds `rp-store-credit`). Its
     date line reads "Checked with a test build on our development store", because the worked
     example is staging check B (`apps/rewards/docs/staging-run.md:7-9, 23`: the "RewardsPro
     Staging" app with a throwaway database), not the released app. If production check B is run,
     the line can say so instead.
   - A8 is now titled "Some of Shopify’s rules for spending store credit", so it doesn't claim to be
     the whole list (`sh-sc-channels` also records other sales channels, B2B stores and
     subscriptions, which the card leaves out; POS stays out per STRATEGY §6.4). The partial-balance
     line now reads as the limit it is: "Customers can’t use part of it: Shopify applies the whole
     balance."
6. **Not made here, and why:**
   - A5, the link card (`kit/web/og.jpg`), is the brand lane's: it fails the free-pair rule and
     needs a kit rebuild that the owner approves.
   - A10–A12 (screenshots, recording V1, the YouTube thumbnail) need real captures from the G0 shot
     list. A13, the listing feature image, is drawn by `feature-image.mjs` (below), with no capture.
   - A14 is Shopify's own badge file, used unaltered. It isn't redrawn here.
   - A15, the 10-page 1080x1350 LinkedIn document carousel that `content/launch-posts.md` asks for
     (CAR1, calendar week 6): not in STRATEGY §7, and most pages need A10 captures and G0. The owner
     decides whether it joins the asset list. If it does, it must be a PDF with real text, not
     flattened images.
7. **Where this goes later:** this folder sits under `apps/rewardspro/`, which switch step B5
   deletes. It is self-contained (it only reads `../../kit` and `../../claims.toml`), so it moves
   with `marketing/` wherever the owner chooses.
