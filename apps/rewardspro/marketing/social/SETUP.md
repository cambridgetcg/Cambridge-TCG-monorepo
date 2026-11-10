# RewardsPro social accounts: setup checklist

Agents' proposal for the owner, 2026-11-07, revised the same day after a verifier pass. **Nothing on
this list has been done.** No account, sign-up, login, DNS change, post or payment was made. The texts
and files to use are in [profiles.md](profiles.md); the reasons are in [STRATEGY.md](STRATEGY.md).
"The owner" is the one person who publishes, sends or spends for RewardsPro; this file names no person
and no account detail beyond what each platform requires.

**Who does each step:**
- **Owner (word):** a decision the owner gives in writing.
- **Owner (hand):** an act only the owner does, logged in: accounts, settings, DNS, mail, posting,
  merging, deploying, money.
- **Ai on the owner's yes:** an agent does it after the owner says yes. It is always local or read-only,
  or a PR that the owner merges. Agents never hold, see or use a login, password, recovery code or
  one-time code, and never post, follow, like or schedule.

**Time:** about 25 minutes of decisions, about 45 minutes of accounts, about 10 minutes of DNS and 2
minutes for the contact test. That is STRATEGY §13 steps 1–4 and 10–12, about 1 h 25 m in all. The listing
clean-up (step 9, about 30 minutes) is separate, and so are the keep-alive logins (2.6.3).

---

## Phase 0. Decisions before any account

| # | Step | Who |
|---|---|---|
| 0.1 | Say whether these are yours: Instagram `@rewardspro.io`, TikTok `@rewardspro`, the GitHub org `RewardsPro`, X `@RewardsPro`. | Owner (word) |
| 0.2 | Yes, no or edits on: the channel roles (STRATEGY §3); the handle `rewardsproapp` and Bluesky `@rewardspro.io`; the set A texts (profiles.md §2.1), including whether S0 carries the AI line AI0 (D5). | Owner (word) |
| 0.3 | Pick the banner ground, one for all three banners: neutral 950 `#1B1D1F` (the banners fix pass's suggestion, the only one both in the approved 2026-10-20 pack and clearing the kit's bar), dark `#09110F` or navy (profiles.md §3.2; assets/README.md, "Doubts and choices" 1). Pick the avatar files: the kit's `kit/social/avatar-400.png` and `avatar-1024.png` (default here), or the social copies with the same pixels and the PNG text chunks that name the internal generator stripped (`assets/png/rewardspro_social_avatar_tile_*`; the banners maker's suggestion). | Owner (word) |
| 0.4 | Pick the sign-up mailbox (1.1). | Owner (word) |
| 0.5 | Remove the two KINGDOM TXT records on rewardspro.io, and keep one of the two DMARC records? Needed before the Bluesky domain handle (Phase 4). | Owner (word) |
| 0.6 | The claims maker verifies `rp-maker` and `rp-on-app-store`, with a second session agreeing. **S0 opens only when both are `verified`.** If AI0 is chosen, `rp-ai-drafted-profile` too. | Ai on the owner's yes |
| 0.7 | Agents read each platform's inactive-account terms (read-only) and note the log-in cadence for 2.6.3. X's page returned HTTP 403 to a logged-out fetch on 2026-11-07 [U]. | Ai on the owner's yes |
| 0.8 | The checker session builds the S0 review pack: every field's exact bytes, the sha256 of each image, and where each one goes. | Ai on the owner's yes |
| 0.9 | Approve the S0 pack. | Owner (word) |

---

## Phase 1. Mailbox, phone and secrets

| # | Step | Who |
|---|---|---|
| 1.1 | **Create a dedicated sign-up address**: a non-public alias or group on the rewardspro.io Google Workspace (MX is Google Workspace [O, `dig`, 2026-11-07]), named by the owner outside git. Not `contact@rewardspro.io`: it is public (listing, landing), which invites password-reset phishing. (Its delivery, unproven on 7 Nov, was shown by the owner's test on 10 Nov, #223.) Mail routing is the owner's. The chosen address is never written into git, agents' notes or this kit; any naming note stays in the git-ignored `marketing/private/`. | Owner (hand) |
| 1.2 | From an outside address, send one test message to the new address and one to `contact@rewardspro.io`, and check both arrive (STRATEGY §13 step 10). | Owner (hand) |
| 1.3 | Tell the agents only "contact@ delivered: yes/no, on <date>". | Owner (word) |
| 1.4 | The claims maker records that answer as the evidence on `rp-contact-delivers` (its source now reads "MISSING: a test message sent from an outside address"), and the one read checks it (since 10 Nov, in place of a second session's concurrence). Only once the row is `verified` do the contact variants A0c and YT0c unlock. No addresses beyond contact@, no message contents. | Ai on the owner's yes |
| 1.5 | If a platform needs a phone for 2FA or verification, use one the owner chooses. It is never written in any file. | Owner (hand) |
| 1.6 | **Keychain.** Store each account's password and its recovery or backup codes in the macOS Keychain (Passwords app or Keychain Access), with codes in the item's notes, under names the owner picks. The LinkedIn Page is run from a personal LinkedIn profile, as LinkedIn requires, and the Community account is personal too; their codes are kept the same way. **Never** in a file, note, chat, screenshot, ticket, terminal command or tool output. | Owner (hand) |

---

## Phase 2. Accounts (S0: no link, no post)

**Order:**
- X and YouTube first. Their handles are the likeliest to go to someone else, and their probes are only
  medium-high or good signals.
- Then Bluesky, which uses the cheapest and most reliable probe.
- Then LinkedIn, which probably has to wait for S2, because its form probably requires a website [I].

Everywhere: display name `RewardsPro`, no link and no posts. Banner files are in
`apps/rewardspro/marketing/social/assets/png/`; the names below are the dark set, and the navy and
neutral 950 sets swap `_dark_` for `_navy_` or `_neutral950_` (0.3). The avatar paths below are the kit's;
swap in the stripped social copies if 0.3 picks them.

### 2.1 X

| # | Step | Who |
|---|---|---|
| 2.1.1 | Sign up at x.com with the 1.1 address. Set the handle to `@rewardsproapp`; if refused, try `@rewardspro_io`, then `@getrewardspro`. X may suggest a random handle at first; change it in settings [I]. | Owner (hand) |
| 2.1.2 | Birth date: the operator's own (X requires that), with visibility set to "only you". It is personal data, so it is never recorded anywhere. | Owner (hand) |
| 2.1.3 | Name `RewardsPro`; photo `kit/social/avatar-400.png`; header `rewardspro_social_header_dark_1500x500_20261107_v01.png`; bio **R0**. Location optional ("London, UK"). Website empty. | Owner (hand) |
| 2.1.4 | 2FA with an authenticator app or a security key. Put the backup code in the Keychain (1.6). | Owner (hand) |
| 2.1.5 | Privacy: direct messages from nobody; photo tagging off; discoverability by email and phone off. Whether X may use the account's posts to train its AI is the owner's choice; off is proposed. | Owner (hand) |

### 2.2 YouTube

| # | Step | Who |
|---|---|---|
| 2.2.1 | In the Google account the owner chooses, create a new channel as a **Brand Account**, so managers can be added later without sharing a login [I: the UI path is the channel switcher's "Create a channel"]. If that Google account is a Workspace account, YouTube may be switched off by the admin settings [U]. | Owner (hand) |
| 2.2.2 | Name `RewardsPro`; handle `@rewardsproapp`, falling back to `@rewardspro_io`, then `@getrewardspro`. | Owner (hand) |
| 2.2.3 | Picture `kit/social/avatar-1024.png`; banner `rewardspro_social_youtube-banner_dark_2560x1440_20261107_v01.png`; description **YT0**. Leave contact info and links empty. | Owner (hand) |
| 2.2.4 | Advanced settings: country United Kingdom; audience "No, not made for kids". | Owner (hand) |
| 2.2.5 | 2-Step Verification on the Google account. Backup codes in the Keychain. | Owner (hand) |
| 2.2.6 | **No uploads** until S2. Not part of this checklist: whether video `IHgTl5oQZlg` stays on @CambridgeTCG after it comes off the listing at S1. | Owner (hand) |

### 2.3 Bluesky

| # | Step | Who |
|---|---|---|
| 2.3.1 | Sign up at bsky.app with the 1.1 address. Handle `rewardsproapp.bsky.social` (free at 12:28 UTC, 2026-11-07); fallbacks `getrewardspro.bsky.social`, `rewardspro-io.bsky.social`. | Owner (hand) |
| 2.3.2 | Display name `RewardsPro`; avatar `kit/social/avatar-1024.png`; banner `rewardspro_social_header_dark_1500x500_20261107_v01.png` (17,190 bytes, under the 1,000,000-byte cap); bio **R0**. | Owner (hand) |
| 2.3.3 | Turn on two-factor sign-in (email code) [I: the setting's place in the app]. Allow chats from nobody. **Create no app passwords**: an app password is a login, and agents never hold one. | Owner (hand) |
| 2.3.4 | The domain handle comes later, in Phase 4. | — |

### 2.4 LinkedIn Company Page

| # | Step | Who |
|---|---|---|
| 2.4.1 | On the personal LinkedIn profile the Page will be created from: check that two-step verification is on and its backup codes are kept, and that the profile has "enough connections to create a Page" (a553289 [V]; the number isn't stated [U]). | Owner (hand) |
| 2.4.2 | On desktop or iOS (Android can't create Pages [V a543852]): For Business → Create a Company Page → **Company**. The desktop form asks for "Page identity, Company or Institution details, and Profile details"; the iOS form lists the fields one by one, with only the tagline marked optional (a543852 [V]). | Owner (hand) |
| 2.4.3 | Company name `RewardsPro`. Public URL `rewardsproapp`, falling back to `rewardspro` (if offered and the owner prefers it), then `rewardspro-io`. | Owner (hand) |
| 2.4.4 | **Website: leave it empty.** It is probably required [I]. If the form won't accept an empty website, stop. Note it, and create the Page at S2 instead (STRATEGY §3). Don't enter the listing URL as a stopgap: it links a false privacy page. | Owner (hand) |
| 2.4.5 | Industry (PROPOSAL: Software Development); company size (the true one); company type (PROPOSAL: Privately held); logo `kit/social/avatar-400.png`; tagline **T0**. | Owner (hand) |
| 2.4.6 | Tick the box confirming the right to act on behalf of the company, if that's true for Cambridge TCG Limited. Create the Page. | Owner (hand) |
| 2.4.7 | Edit the Page: cover `rewardspro_social_linkedin-cover_dark_1512x256_20261107_v01.png`; About **A0**. **Location: leave it empty** unless the owner checks that LinkedIn doesn't show it as a headquarters or offer directions [I]; then "London, United Kingdom" only, no street address (London is a serviced registered office, claims.toml `rp-maker`). Leave messages to the Page off. Add no custom button. | Owner (hand) |
| 2.4.8 | Admins: the owner as super admin. A second super admin for continuity is optional (the owner's word). Agents never get a Page role. | Owner (hand) |
| 2.4.9 | Decide whether the owner's personal profile lists RewardsPro. Default: no change. | Owner (word) |
| 2.4.10 | Don't create a Showcase Page or a Product page. Don't request verification (5.5). | — |

### 2.5 Instagram, Threads and TikTok (only as 0.1 decides)

| # | Step | Who |
|---|---|---|
| 2.5.1 | **If `@rewardspro.io` is the owner's,** in this order: (a) archive the 2 old posts (reversible), or deactivate the account and stop here; (b) if a Threads profile exists, archive or delete any posts on it, and create no new Threads profile; (c) only then set name `RewardsPro`, bio **R0** (on Threads too) and picture `kit/social/avatar-1024.png`. R0 says "We don't post here.", which is false while posts show. Turn on 2FA, with codes in the Keychain. | Owner (hand) |
| 2.5.2 | **If it isn't the owner's:** do nothing. Agents record it as a lookalike for the monthly ME-1 check. | Ai on the owner's yes |
| 2.5.3 | `@rewardsproapp` on Instagram only if the owner wants the name held. It is one more login to keep. Default: no. | Owner (word) |
| 2.5.4 | **If TikTok `@rewardspro` is the owner's:** bio **TK0**; picture `kit/social/avatar-1024.png`; dormant; 2FA. If it isn't: nothing. | Owner (hand) |
| 2.5.5 | GitHub org `RewardsPro`: the owner only says whether it's theirs. It is never linked. | Owner (word) |

### 2.6 After the accounts

| # | Step | Who |
|---|---|---|
| 2.6.1 | Logged-out, read-only check of each new public profile: display name, handle, bio bytes and images against profiles.json. Report any differences to the owner. | Ai on the owner's yes |
| 2.6.2 | Record each account's platform, handle, public URL and creation date (all public facts) in profiles.json. Sign-up addresses, phones, birth dates and codes are never recorded. | Ai on the owner's yes |
| 2.6.3 | **Keep-alive.** Log in to each reserve account (X, Bluesky, and Instagram or TikTok if kept) and the YouTube channel on the cadence its platform's inactive-account terms state (0.7), so none is removed for inactivity. X has asked accounts to log in at least every 30 days [I, prior knowledge; its page wasn't readable today]. No posting, following or liking. | Owner (hand) |
| 2.6.4 | Add "account still present" (a logged-out look at each public profile) to the monthly ME-1 check (STRATEGY §10), and tell the owner at once if one is missing. | Ai on the owner's yes |

---

## Phase 3. Shopify Community (from S1, optional)

S1 holds once the listing has no false text or image (STRATEGY §2, §13 step 9).

| # | Step | Who |
|---|---|---|
| 3.1 | On the owner's own Community account, the bio is the owner's own words, or left as it is. Agents offer no bio text, only the facts in profiles.md §4.3 (the company name; contact@ once `rp-contact-delivers` is verified). A first-person maker line needs a person-scoped claim row and the owner's approval of that link. Use the owner's own picture, or none. Create no brand account. | Owner (hand) |
| 3.2 | Help on the open boards only in the owner's own words, naming no app. Disclosed Ask & Offer replies wait for S2. **Agents never draft replies.** | Owner (hand) |

---

## Phase 4. DNS: the Bluesky domain handle `@rewardspro.io`

Run this after 0.5. Sources: the atproto handle spec and Bluesky's domain-handle tutorial
(p1-platforms §3, read 2026-11-07). rewardspro.io's nameservers are Cloudflare [O], so the record goes in
Cloudflare, not at the registrar.

| # | Step | Who |
|---|---|---|
| 4.1 | In Cloudflare DNS for rewardspro.io: delete the two apex TXT records that start `kingdom=` and `aistar=`. Keep the SPF record. Of the two `_dmarc` records, keep one. | Owner (hand) |
| 4.2 | In the Bluesky app: Settings → Account → Handle → "I have my own domain" → enter `rewardspro.io`. Copy the DID it shows. The DID is public and not sensitive [V]. | Owner (hand) |
| 4.3 | In Cloudflare DNS: add a record of type TXT, name `_atproto`, content `did=did:plc:<the DID>`, TTL Auto. Only one `did=` record may exist [V]. | Owner (hand) |
| 4.4 | Wait a few minutes. In Bluesky, press "Verify DNS Record", then confirm the change to `rewardspro.io`. | Owner (hand) |
| 4.5 | Read-only check: `dig +short TXT _atproto.rewardspro.io` shows the record, and `resolveHandle?handle=rewardspro.io` returns the same DID. Also check the apex TXT no longer carries KINGDOM wording and only one DMARC record remains. Report to the owner. | Ai on the owner's yes |
| 4.6 | Add "`_atproto` TXT: never delete" to the owner's DNS notes. Removing it invalidates the handle, though posts and followers are kept [V]. After the switch, `rewardsproapp.bsky.social` is probably released [I]. | Owner (hand) |

The other method, serving `https://rewardspro.io/.well-known/atproto-did`, needs a landing deploy. It is
not proposed: the spec calls DNS TXT the preferred method [V].

---

## Phase 5. S2: posting opens

S2 holds only when all of STRATEGY §2's conditions (a)–(g) hold: G0 and B3 recorded; the listing fully
fixed; rewardspro.io rewritten and deployed; the first-real-merchant steps done or waived in writing;
contact@ shown to deliver; every claim used `verified` and unexpired.

| # | Step | Who |
|---|---|---|
| 5.0 | Decide before the pack: D4 (tagline T1, or T1F with "Free app"); D8, widened to whether L1's restating of Shopify's store-credit rules, fee and Shop Pay counts as notifying compatibility (PPA 5.3 vs Part C s.3); and the maker-disclosure decision, which entity-card.md §8 names D-maker (MK1, "Cambridge TCG Limited also sells trading cards.", claim id `rp-maker-also-sells`), at the latest before any outreach to card shops (profiles.md §2.2). | Owner (word) |
| 5.1 | Build the S2 review pack: set B texts (T1 or T1F, L1 or L1W, with or without MK1, R1, YT1) with each claim's status and expiry, including the requested rows `rp-post-cadence` and `rp-ai-drafted-video`; the UTM links and YouTube link title (profiles.md §3.4); the M1 pack and V1 (from the posts and video makers); and a gate report. | Ai on the owner's yes |
| 5.2 | Approve the pack. | Owner (word) |
| 5.3 | Swap the bios. Add the website and link fields with UTM tags (YouTube: title `rewardspro.io`; Bluesky only if the app offers a links field [U]). On LinkedIn, optionally add a "Visit website" custom button. Add contact@rewardspro.io as the YouTube contact email. | Owner (hand) |
| 5.4 | Post and pin M1 on LinkedIn. Upload V1 to YouTube and make it the featured video. At upload, the "AI use" setting under Attributes: **No**, because V1 is a real screen recording and AI drafted only its text (support.google.com/youtube/answer/14328491, read 2026-11-07: "select Yes if your content meets the disclosure requirements or No if not"). The exact label in Studio is [I] until seen. | Owner (hand) |
| 5.5 | LinkedIn Page verification is **unlikely to be offered** under this plan: eligibility "may be based on … posting regularly … as well as having an established commercial relationship with LinkedIn … Ads, Jobs, or a Premium Company Page subscription", and the website "must accurately represent the organization" (a7174627 [V], read 2026-11-07), while this plan posts 0–2 times a month, buys neither, and names the Page for the product. Request it only if Settings shows "Verification controls". | Owner (hand) |
| 5.6 | **Link the profiles from rewardspro.io**, as a landing PR against the rewritten site: footer links to the LinkedIn Page and the YouTube channel, and JSON-LD `sameAs` for LinkedIn, YouTube, X and Bluesky. No GitHub, no docs.rewardspro.io, no KINGDOM site. | Ai on the owner's yes |
| 5.7 | Read, merge and deploy that PR (Cloudflare Pages project `rewardspro-landing`). | Owner (hand) |
| 5.8 | **The listing:** if the Partner Dashboard offers a website or social field [U], add rewardspro.io. | Owner (hand) |
| 5.9 | Logged-out check of every profile, and a read-only fetch of rewardspro.io's og tags (the card must be the rebuilt one, not today's `og.jpg`; STRATEGY §7 A5). After that, ME-1 monthly (STRATEGY §10), with 2.6.4's presence check. | Ai on the owner's yes |
| 5.10 | Optional: look at the link preview in LinkedIn's post composer before posting M1, then discard the draft. | Owner (hand) |

---

## Phase 6. What not to enable

None of these is needed for this plan. Most cost money, hand access to a third party, or act on the
account's behalf.

- **Paid verification or badges:**
  - X: Premium, Premium Business, Verified Organizations.
  - Meta: Meta Verified, or a Meta One bundle (Meta One from US$14.99/mo, announced 2026-09-15; UK
    pricing not stated) [V-sum, phase-1 platforms note].
  - LinkedIn: Premium Company Page (£79.67/mo or £668.04/yr, recorded as estimates that may exclude
    VAT) [V-sum, premium.linkedin.com/small-business/company-page, phase-1 platforms note].
  - Any TikTok or YouTube paid tier.

  The Bluesky domain handle stays allowed: it costs nothing. LinkedIn Page verification is not counted on
  (5.5).
- **Ads and boosts:** LinkedIn "Boost" or ads, an X ads account, YouTube or Google Ads, App Store ads.
  If ads are ever considered (not before about 5–10 genuine reviews), "Shopify" never goes in copy or
  keywords, and "Shopify" is added as a phrase-match negative keyword (PPA, ppa.txt:454).
- **Automatic messaging:** auto-DMs, auto-replies, welcome messages, chatbots, LinkedIn's Page messaging,
  DMs open to everyone.
- **Third-party tools:** schedulers, link-in-bio services, cross-posters, "connected apps", API keys or
  developer projects, Bluesky app passwords. LinkedIn's own scheduler is enough for 0–2 posts a month.
- **Automatic cross-posting:** Instagram to Threads or Facebook, or one network mirroring another.
- **Contact sync**, "find people you know", and discoverability by phone or email.
- **Monetisation:** the YouTube Partner Programme, X Subscriptions, TikTok creator programmes.
- **Professional or creator account switches** on X or Instagram. They add ad and analytics features a
  reserve account doesn't need [I].
- **Hashtags in bios.** "Shopify", "shopi", "official", "app store" or "hq" in any name, handle, URL slug,
  UTM value or hashtag.
- **AI imagery**, and any "verified", "honest" or tick-style badge we make ourselves.
- **Agent access of any kind:** no agent login, Page role, Brand Account manager seat, app password or
  shared code.

---

## Phase 7. If access is lost

- Recovery codes are in the Keychain (1.6).
- The keep-alive logins (2.6.3) and the monthly presence check (2.6.4) are there so an account isn't lost
  to inactivity in the first place.
- For the LinkedIn Page, a second super admin is the only continuity that doesn't depend on one personal
  account (2.4.8, optional).
- YouTube Brand Account managers can be added the same way, if the owner wants.
- Account recovery is always the owner's hand. Agents don't contact platform support on the account's
  behalf.

---

## Phase 8. Owner actions that live in other files

This checklist covers the social accounts. The owner's other words and hands in this kit are listed where
the work is described; this index only points to them (completeness check, 2026-11-07).

| When | What | Where |
|---|---|---|
| Now (S0) | The strategy's open decisions D1–D12, plus D13 (one claim-light hello before S2, default no) | STRATEGY §15; content/launch-posts.md §1.2 |
| Now (S0) | The PPA question and whether to get a legal read (D8), and which form of G0 counts (D6) | STRATEGY §13 steps 3–4, §9 |
| Now (S0) | Where `marketing/` moves before B5 (D11), and whether operational files go to `marketing/private/` | STRATEGY §15; "Where this file lives" below |
| Now (S0) | A0 and A0c: cut "listed on the Shopify App Store" or get Shopify's written permission | profiles.md §2.1; claims-map.md |
| S1 | The listing clean-up in the Partner Dashboard (deletions, screenshot swaps, the old video, the protected-data request) | listing-delta.md §0 and §2; STRATEGY §13 step 9 |
| S1 | Set up the test store and capture the S1 frames (D-shots-1, D-shots-2, D-shots-3) | shot-list.md §2 and §5 |
| S1 | Optional Community help in the owner's own words; the disclosure line and whether to name the owner's relationship to the company | content/community-rules.md §2 and §3 |
| To S2 | The admin name in `shopify.app.toml:10` (agent PR, then `shopify app deploy`); record G0; capture the G0 set and V1 (D-shots-4, D-shots-5, D-video-1 to D-video-4, including phone-verifying the YouTube channel) | STRATEGY §13 step 13; shot-list.md §6–§8, §11; video-walkthrough.md §2, §10, §11 |
| To S2 | Read, merge and deploy the #130 rewrite (landing, privacy, terms, subprocessors, `/changes`); the brand.json and share-card change for #83 with a new approval line; whether `kernel.toml [entity]` is filled now | listing-delta.md §3–§8; entity-card.md §6–§8 |
| To S2 | The first-real-merchant steps or their written waiver, including the two frozen paid charges that keep `rp-free` from verifying | STRATEGY §13 step 17; claims-map.md |
| To S2 | D-maker, the meta-description price, the short fee pointer, rule 6 and the other entity-card open points | entity-card.md §8 |
| To S2 | The story template (keep or delete), A15 (the carousel) and the private test uploads (LinkedIn alt-text cap, cover PNG or JPEG, avatar on dark mode) | assets/README.md, "Doubts and choices"; content/launch-posts.md §2.2 |
| From S2 | Approve each post pack and post it by hand or with LinkedIn's scheduler | content/calendar.md; content/launch-posts.md |

---

## Where this file lives

This file sits in `apps/rewardspro/marketing/social/`, which switch step B5 deletes. The owner picks the
new home of `marketing/` before B5 (STRATEGY decision D11). The repository is public, so whether
operational files like this one move to the git-ignored `marketing/private/` is part of that choice.
