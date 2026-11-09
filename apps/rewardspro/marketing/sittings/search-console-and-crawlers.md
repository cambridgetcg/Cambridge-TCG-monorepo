# Search Console and AI crawlers: the owner's sitting sheet (RP-04)

**An agents' proposal, written 2026-11-09 for package RP-04 (issue #164) and revised the same day after review.
Nothing in it is decided.** The owner does every step by hand, signed in to the company's own accounts. Agents changed
no setting, created no account and signed in to nothing while writing it. It is the webmaster half of ROADMAP §4
action 5. The other half is RP-03's sheet, `cloudflare.md` in this folder (RP-03, #163; not written yet on
2026-11-09), which is to cover mail, the rest of the DNS records, `www` → apex and the docs host's 410. Once it
exists, run its mail steps first and then this sheet, in the same sitting. Until then this sheet runs on its own:
only C1's follow-up, after the 410, waits for RP-03.

Every step names what to click or type, the choice with one line of why, the time, an outside check (or says that
none exists), and the vendor page it rests on, read on 2026-11-09. Menu names are quoted from those pages. Where a
page didn't give a menu name, the step says so and doesn't guess.

Labels: **[V]** checked on 2026-11-09 against a vendor page, public DNS, git or a request to rewardspro.io; **[I]**
inferred; **[U]** unknown. Times are estimates [I]. `…` is the research folder that WORK.md names. Not legal advice.

---

## 0. Before you start

**The choices this sheet needs (ROADMAP §5 Now-3).** The defaults are proposals.

| Choice | Proposed default | Why, in one line | Step |
|---|---|---|---|
| Training policy in Cloudflare | **Allow (do not block)** | AGENTS.md principle 6: our pages "are free to read and reuse, by people, crawlers and AI training alike". And Block also stops mixed-purpose crawlers that feed search answers (B1) | B1 |
| The Search Console account | The company Workspace account on rewardspro.io | The property then belongs to the company, not to one person's mailbox (GROWTH G14) | A1 |
| The second owner | A second Google account the owner controls, as a second **verified** owner, with its own TXT record marked "keep" | Only a verified owner keeps the property if the company account is lost. A delegated owner needs no record now, but "If all verified owners are removed, then all remaining users and delegated owners will lose access to the property after a grace period", and the second account must then verify with its own record anyway | A4 |
| Bot Fight Mode, if it is on | Leave it on, unless Security Events show it challenging search or agent crawlers; then turn it off | Cloudflare: "You cannot bypass or skip Bot Fight Mode using WAF custom rules or Page Rules", so turning it off is the way to let a challenged crawler through [I] | B1 |
| Bing Webmaster Tools | **Not now** (Now-3's default) | It is a sign-up, and it gives Bing ongoing access to the Search Console account's list of verified sites and sitemaps | D1 |

**Have open:** the Cloudflare dashboard on the rewardspro.io zone; Search Console, signed in with the company
Workspace account; for a verified second owner, a second browser profile signed in with the second account; a
terminal for the outside checks. If you say yes (question 6 in the PR), an agent can run the `dig` and `curl` checks
for you: they only read public DNS and public pages.

**Time:** about 30–40 minutes hands-on in the sitting [I]. Later: about 5 minutes for the sitemap once RP-08 is
live (A7), and about 5 minutes a month from S2 (§3).

---

## 1. Where things stand (2026-11-09: pages at about 21:40 UTC, DNS re-read at 22:18 UTC)

| What | Today | Label |
|---|---|---|
| DNS host | Cloudflare (`ed.ns.cloudflare.com`, `zoe.ns.cloudflare.com`) | [V, `dig`] |
| A Search Console Domain property | None verified by DNS: the apex has no `google-site-verification` TXT record. Whether someone holds a URL-prefix property under another account is unknown | [V, `dig`]; [U] |
| Apex TXT and DMARC | The apex has one TXT record, the SPF record (`v=spf1 … ~all`), and `_dmarc` has one record, `v=DMARC1; p=none`. This changed after the 7 Nov plans, which recorded two other apex TXT records and two DMARC records (ROADMAP §1; `…/wf10/status.md` §1.C11). Both records are RP-03's | [V, `dig` at 1.1.1.1, 8.8.8.8 and `ed.ns.cloudflare.com`] |
| Mail for rewardspro.io | MX points to Google, so a Google Workspace mailbox on the domain exists | [V, `dig`]; [I] |
| `https://rewardspro.io/robots.txt` | 67 bytes: `User-agent: *`, `Allow: /`, a blank line, `Sitemap: https://rewardspro.io/sitemap.xml`. Byte for byte the file in git (sha256 `08a15f98…`), and the same bytes the 7 Nov plans recorded. No Cloudflare-managed block | [V] |
| The home page | 35,563 bytes, byte for byte `index.html` on main at 2fe85336 (sha256 `aa9318e5…`): the stopgap page from PR #191, not RP-08's state A page. Its commits are from 00:40 UTC on 2026-11-09, so it went live that day [I] | [V, git and a request] |
| `sitemap.xml` | Two URLs, `/` and `/privacy-policy/`, `lastmod` 2026-07-23 | [V] |
| `www.rewardspro.io` | 200 with the same page; no 301 yet (RP-03's step) | [V] |
| `docs.rewardspro.io` | A 307 to GitBook's app (unpublished on 2026-11-07); not a 404 or 410 | [V] |
| Cloudflare's AI crawler policies, Bot Preference Sync, Bot Fight Mode, Crawler Hints, AI Crawl Control | Not visible from outside. The unchanged robots.txt means either Bot Preference Sync is off or no policy is set to Block, Block on pages with ads or Disallow (B1's robots.txt table). Last known: on 2026-10-18 the old setting `ai_bots_protection` was turned off with the owner's go (`…/wf6/ai-rec.md` §3; `…/wf10/status.md` §1.C1). How that maps onto today's three policies is [U] | [U]; [I] |

**Observation, reported by the session that wrote this package's brief (not re-run for this sheet).** On
2026-11-09, requests from a home connection to `https://rewardspro.io/` and `/robots.txt`, sent with the
user-agent strings of GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Googlebot,
bingbot, CCBot and Bytespider, each returned 200 with the full page (35,563 bytes) and the 67-byte robots.txt.
That shows there is no user-agent block rule at the edge. It does not show how Cloudflare treats verified bot
traffic, so the dashboard look in B1 still stands. The live robots.txt is `User-agent: *`, `Allow: /` and the
Sitemap line. Those requests came from one home connection, not from crawlers, but they may appear under the bots'
names in AI Crawl Control for that day (B2).

---

## 2. The steps, in order

The order saves waiting: get the TXT values first (A1, and A4 step 1 for a verified second owner), add the records
(A2), do the Cloudflare settings while they propagate (B1–B3), then verify and carry on (A3–A6, C1). A7 waits for
RP-08. D1 is optional. A4–A6 and C1 need A3 to have verified; B1–B3 don't.

| Step | What | Time [I] | Gate |
|---|---|---|---|
| A1 | Add the Domain property | ~3 min | Now-3: which account |
| A2 | Add the verification TXT record in Cloudflare, comment "keep" | ~3 min | — |
| B1 | AI Crawler and Agent access policies: look, then Search = Allow, Agent = Allow, Training = the owner's choice; Bot Preference Sync; Bot Fight Mode | ~6 min | Now-3: Training |
| B2 | AI Crawl Control: look; leave every crawler on Allow | ~3 min | — |
| B3 | Crawler Hints on | ~1 min | — |
| A3 | Verify the property | ~1 min (or a day later) | A2's record visible |
| A4 | Add the second owner | ~5 min verified, ~2 min delegated | A3; Now-3: which account and which type |
| A5 | Search generative AI: confirm "Include" | ~1 min | A3 |
| A6 | URL Inspection of the home page | ~3 min | A3 |
| C1 | Removals request for the docs host, only if Google lists its pages | ~3 min, or skipped | A3; before RP-03's 410 |
| A7 | Submit the sitemap; inspect and request indexing | ~5 min, later | RP-08 merged and deployed |
| D1 | Bing Webmaster Tools import and AI Performance | ~10 min | Optional; the owner's word |

### A1. Add the Domain property (~3 min)

- **Do:** open Search Console signed in with the company Workspace account. Open the property selector, choose
  **+ Add property**, then the website property type **Domain**, and type `rewardspro.io`: no `https://`, no `www`,
  no path. Continue to the verification step, which uses the **Domain name provider** method.
- **Choice:** if the wizard lists Cloudflare with **Start verification**, don't use it. Choose **Any DNS provider**
  and the **TXT** record type, and copy the value it gives. *Why:* it's one record you add and label yourself, and the
  provider route needs a sign-in to Cloudflare from inside Google's wizard ("You will be required to log in to your
  domain name provider"), which the manual record avoids. Whether Cloudflare is in the list is [U].
- **While you do A2 and B1–B3:** leave the dialog open, or select **Verify later** ("click Verify later to save your
  current state"). To come back, select the saved, unverified property in the property selector and select
  **Verify** (A3).
- **If it says verified straight away:** Google says that for "a Google Workspace account" verification "will happen
  automatically, if you are signed in with the same account"; whether that applies to rewardspro.io is [U]. Then
  note the method shown under **Settings** > **Ownership verification**, and add the DNS method on that page to get
  a TXT value ("To add an additional verification method, visit the Settings page for the property and click
  Ownership verification"). Carry on with A2, so the property doesn't rest on one method, and tell an agent which
  method was used.
- **Check:** the value starts `google-site-verification=`. It isn't secret (it's public once it's in DNS), but it
  doesn't need to go anywhere except A2.
- **Why a Domain property:** it is a "domain-level property that Includes all subdomains (m, www, and so on) and
  multiple protocols", so one property covers the apex, `www` and `docs.rewardspro.io` (C1 needs that), and it can
  be verified only by DNS ("DNS record verification only").
- **Sources:** https://support.google.com/webmasters/answer/34592 and
  https://support.google.com/webmasters/answer/9008080 (both read 2026-11-09; no page date shown).

### A2. Add the verification TXT record in Cloudflare, marked "keep" (~3 min)

- **Do:** Cloudflare, the rewardspro.io zone, **DNS** > **Records** > **Add record**:
  - **Type:** `TXT`
  - **Name:** `@` (the root of the domain)
  - **Content:** the `google-site-verification=…` value from A1
  - **Comment:** `keep: Google Search Console Domain property verification (RP-04)` (64 characters; the Free plan
    allows 100)
  - Leave the TTL as it is. TXT records are always DNS-only, so there's no proxy setting.
  - **Save.**
  - If you chose a verified second owner and already have its value (A4 step 1), add its record now too (A4 step 2).
- **Why "keep":** Google: "To stay verified, don't remove the DNS record from your provider, even after
  verification succeeds." Search Console "periodically checks if your verification token is still present and
  valid", and "If all verified owners lose access to a property, all users will lose access". So every later DNS
  clean-up, RP-03's included, leaves this record alone. A Cloudflare record comment is visible only to members of the
  account; the Free plan allows one comment of up to 100 characters per record (tags need a paid plan).
- **Leave alone:** the SPF record and the DMARC record (RP-03's). Public DNS shows no other apex TXT record today
  (§1).
- **Outside check:**
  - `dig +short TXT rewardspro.io @ed.ns.cloudflare.com` lists the `google-site-verification=` line (the
    authoritative answer, usually within a minute).
  - `dig +short TXT rewardspro.io @1.1.1.1` lists it too once caches catch up.
- **Sources:** Google, https://support.google.com/webmasters/answer/9008080 (read 2026-11-09). Cloudflare,
  https://developers.cloudflare.com/dns/manage-dns-records/how-to/set-up-google-workspace/ (last updated
  2026-09-16; read 2026-11-09) for Type, Name `@` and TXT being DNS-only, and
  https://developers.cloudflare.com/dns/manage-dns-records/reference/record-attributes/ (last updated 2026-08-14;
  read 2026-11-09) for comments.

### B1. AI Crawler and Agent access policies, Bot Preference Sync and Bot Fight Mode (~6 min)

- **Do:** **Security** > **Settings**, filter by **Bot traffic**, then select **AI Crawler and Agent access
  policies**.
  1. **First, write down what it shows now:** the action for Search, Agent and Training, and whether **Enable Bot
     Preference Sync** is on. Agents don't know the current state (§1). It also settles whether the defaults
     Cloudflare announced for new domains from 15 September 2026 (Training and Agent blocked on pages with ads)
     reached this zone [U] (§5).
  2. **Search:** *Allow (do not block)*.
  3. **Agent:** *Allow (do not block)*. Leave the Personal Agents inheriting it ("Cloudflare recommends **Allow (do
     not block)** for Personal Agents").
  4. **Training:** the owner's choice, from the table below. If you lean towards Block, first look at AI Crawl
     Control's crawler list (B2) and note each crawler's **Category**.
  5. **Enable Bot Preference Sync:** leave it as you found it if Training is Allow; with every policy on Allow it adds
     nothing. Turn it on if you choose Disallow: Cloudflare's own steps are "For **Training**, select *Disallow*.",
     then "Turn on **Enable Bot Preference Sync**." With Block or Block on pages with ads, leave it as found; it only
     decides whether Cloudflare also writes lines into robots.txt [I].
  6. **Save.**
- **Search isn't only AI search:** under Cloudflare's 1 July 2026 taxonomy "there is no longer a meaningful
  distinction" between AI search and traditional search, and "A single bot can have one or more of the following
  behaviors". So Training = Block may reach crawlers that also index for search; whether ordinary search engines'
  crawlers are among them is [U].
- **Why Search and Agent stay Allow:** they are how search engines and AI answers find and quote rewardspro.io, which
  is the point of the work (being recommended accurately). The operators say the same of their own bots:
  - OpenAI: "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers, though can
    still appear as navigational links."
  - Anthropic: "Disabling Claude-SearchBot on your site prevents our system from indexing your content for search
    optimization, which may reduce your site's visibility and accuracy in user search results."
  - Perplexity: PerplexityBot "is designed to surface and link websites in search results on Perplexity. It is not
    used to crawl content for AI foundation models."

**Training: the choice and its side effect, quoted from Cloudflare.** The page lists four actions; Disallow is "For
Training only". And: **"Training actions also apply to mixed-purpose crawlers used for both Search and Training."**

| Training set to | Cloudflare's words | What it means for rewardspro.io |
|---|---|---|
| **Allow (do not block)**, the agents' proposal | "Do not block matching requests." | Every crawler keeps reaching the site, and robots.txt is unchanged ("With every policy set to allow, there is nothing to prepend and your `robots.txt` is served unchanged."). It fits AGENTS.md principle 6, and it lets training data catch up with the corrected pages, which Block, and Disallow with Bot Preference Sync on, would stop [I] |
| **Block** | "Block matching requests across the zone." | Blocks training crawlers **and** mixed-purpose crawlers, so some crawlers that feed search answers stop too. Which crawlers Cloudflare counts as mixed-purpose isn't listed on the pages read today [U]. With Bot Preference Sync on, robots.txt also gets Cloudflare's managed lines |
| **Block on pages with ads** | "Block matching requests on pages where Cloudflare detects ads." | rewardspro.io carries no ads, so no request should be blocked [I]. It is not the same as Allow in robots.txt: with Bot Preference Sync on, Cloudflare still prepends its managed content, which it does whenever a policy is on Block on pages with ads. Which lines it writes then is [U] |
| **Disallow** | "For Training only, tell crawlers not to access your content through `robots.txt`." "When Bot Preference Sync is enabled, **Disallow** also blocks AI training crawlers at Cloudflare's edge. Mixed-purpose crawlers used for both Search and Training are excluded from this edge block." | With Bot Preference Sync on, Cloudflare prepends its managed directives and its Content Signals Policy to our robots.txt, and blocks training-only crawlers at the edge. Mixed-purpose crawlers still get through, but robots.txt asks them not to crawl; what each one then does is [U]. With Bot Preference Sync off, Cloudflare prepends nothing and the edge block doesn't apply, so Disallow does nothing visible [I] |

- **Outside check, straight after Save:** `curl -s https://rewardspro.io/robots.txt`. Cloudflare prepends its
  managed content "only when **Enable Bot Preference Sync** is turned on and at least one of your Search, Agent, or
  Training policies is set to **Block**, **Block on pages with ads**, or, for Training, **Disallow**", and "the
  managed content appears within a few seconds. Reload your `robots.txt` to verify — no cache purge is required."
  With Search and Agent on Allow, expect:

| Training | Bot Preference Sync off | Bot Preference Sync on |
|---|---|---|
| Allow | The 67-byte file, unchanged | The 67-byte file, unchanged |
| Block on pages with ads | Unchanged | Managed content first, then our three lines |
| Block | Unchanged | Managed content first, then our three lines |
| Disallow | Unchanged (and no effect, above) | Managed content first, then our three lines |

"Managed content" starts with Cloudflare's Content Signals Policy, a comment block beginning "# As a condition of
accessing this website, you agree to abide by the" following content signals. Then comes
`# BEGIN Cloudflare Managed content`, Cloudflare's own lines (its example has a `Content-signal:` line and a
`Disallow: /` for each named training crawler), and `# END Cloudflare Managed Content`. Which crawlers it names for
each choice isn't stated [U]. A result that doesn't match the row you set means the dashboard and the file disagree:
note what you set and tell an agent; change nothing else in this sitting.

- **Bot Fight Mode, on the same Settings page (Bot traffic):** note whether **Bot fight mode** is on. Cloudflare:
  "You cannot bypass or skip Bot Fight Mode using WAF custom rules or Page Rules". Perplexity: "If Bot Fight Mode is
  enabled, it can still challenge Perplexity bots that match this rule." Whether it also challenges verified Google
  and Bing crawlers isn't on the pages read [U]. If it is on:
  - **Look:** **Security** > **Analytics**, the **Events** tab. Cloudflare: "Any requests challenged by this product
    will be labeled **Bot Fight Mode** in the **Service** field." Look for search or agent crawlers among those
    events, for example Googlebot, bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User or
    PerplexityBot. The §1 test requests got 200, so they weren't challenged.
  - **Proposed default (the owner's call):** if any of them are challenged, turn it off on the same page (**Bot
    Fight Mode** off). If none are, leave it on and look again in the monthly read (§3 row 6).
- **Not used:** a read-only API call to read these settings (`ai-rec.md` §6 step 3). It would put a Cloudflare token
  in an agent's hands, and the dashboard look takes two minutes.
- **Sources (all read 2026-11-09):**
  - https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/ (last updated 2026-11-02)
  - https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ (last updated
    2026-11-02)
  - https://developers.cloudflare.com/bots/concepts/bot/verified-bots/ (last updated 2026-11-02)
  - https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ (last updated 2026-08-03)
  - https://developers.openai.com/api/docs/bots (platform.openai.com/docs/bots redirects there; no page date
    found)
  - https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
    (shown as "Updated this week")
  - https://docs.perplexity.ai/docs/resources/perplexity-crawlers (docs.perplexity.ai/guides/bots redirects
    there; no page date found)

### B2. AI Crawl Control: look, and leave every crawler on Allow (~3 min)

- **Do:** open **AI Crawl Control** for the zone.
  - On the **Overview** tab, note the "Managed robots.txt status" and which operators appear.
  - On the tab that lists crawlers, check the **Action** column: every crawler on **Allow**, unless the owner
    chooses otherwise. One Cloudflare page calls this the **Crawlers** tab and another says "Go to the **Security**
    tab"; use whichever the dashboard shows. A per-crawler **Block** here would stop that crawler even with B1 on
    Allow [I].
  - Note each crawler's **Category** if Training = Block is under consideration (B1 step 4). The column uses
    Cloudflare's older categories (its filter examples are "AI crawler, AI assistant, or archiver"), so it may not
    say which crawlers are mixed-purpose [I].
- **Leave out 9 November 2026** when you read the counts and status codes. The §1 user-agent test sent ten bot
  user-agent strings from one home connection that day, and on the Free plan "AI Crawl Control identifies AI
  crawlers based on their user agent strings", so those requests may be counted as GPTBot, ClaudeBot and the rest
  [I]. The Overview filters include a date range.
- **Why:** it is the passive feed that costs nothing: "Available on all plans". It shows which AI crawlers fetch
  rewardspro.io, how often, and with what status codes. Referral numbers need a paid plan.
- **Check:** **Metrics** > "Status code distribution". A 403 for a search or agent crawler means something blocks
  it; note the crawler and tell an agent. Early on there may be little or no data.
- **Outside check:** none exists; the dashboard is the only view.
- **Sources (all read 2026-11-09):** https://developers.cloudflare.com/ai-crawl-control/ (last updated 2026-08-14);
  https://developers.cloudflare.com/ai-crawl-control/features/analyze-ai-traffic/ (last updated 2026-04-23);
  https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/ (last updated 2026-07-28).

### B3. Crawler Hints on (~1 min)

- **Do:** go to the zone's **Configuration** page for caching (the doc's dashboard link opens
  `…/caching/configuration`) and enable **Crawler Hints**.
- **Why:** "Crawler Hints supports IndexNow, which allows websites to notify search engines whenever content on
  their website content is created, updated, or deleted." Bing's AI Performance post says "IndexNow helps keep
  information fresh across search and AI experiences". Available on every plan. No separate IndexNow key file step
  appears in the pages read [I].
- **Check:** the toggle shows as on. Cloudflare decides that content has changed by cache-status `MISS`, and doesn't
  report responses with a status code "greater than 4xx". Whether that fires for a Pages-hosted site's deploys is
  [U].
- **Outside check:** none exists [U].
- **Sources:** https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/ (last updated
  2026-08-14; read 2026-11-09);
  https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
  (2026-02-10; read 2026-11-09).

### A3. Verify the property (~1 min, or a day later)

- **Do:** back in Search Console (the open dialog, or the saved property in the property selector), select
  **Verify**.
- **If it fails:** Google: "it can take up to two or three days for your provider to start serving the record. …
  wait a day or two and try again." A2's `dig` check shows whether Cloudflare serves it. Until it verifies, stop the
  Search Console steps: A4–A6 and C1 need a verified property. Come back to A3–A6 and C1 when it verifies; B1–B3
  don't depend on it.
- **Check:** Search Console opens the property, and **Settings** > **Ownership verification** lists the method
  used (the DNS TXT record).
- **Outside check:** A2's `dig` line is the only outside view.
- **Note:** "Data is collected for a property as soon as anyone adds it in Search Console, even before verification
  occurs. However, it takes a few days for data to start to accrue".
- **Source:** https://support.google.com/webmasters/answer/9008080 (read 2026-11-09).

### A4. Add the second owner (~5 min verified, ~2 min delegated)

- **Choice:** a second **verified** owner (proposed) or a **delegated** owner. Both have the same permissions.
  - Verified: "Someone who verified ownership of the property using a token". The second account runs its own
    verification and you add its token as a second "keep" record. It keeps the property if the company account is
    lost.
  - Delegated: "Someone granted ownership status by a verified owner without the use of a verification token". No
    second record now. But "If all verified owners are removed, then all remaining users and delegated owners will
    lose access to the property after a grace period": to keep the property, the second account would then have to
    verify with its own TXT record.
- **Do, verified (proposed):**
  1. In the second browser profile, signed in with the second Google account, open Search Console, add the same
     **Domain** property `rewardspro.io` (A1's clicks), and copy the `google-site-verification=…` value it gives.
     Google calls it a "personal token", so it differs from the company account's [I]. This can be done during A1,
     so that both records go in at A2.
  2. Cloudflare, **DNS** > **Records** > **Add record**: Type `TXT`, Name `@`, Content the second value, Comment
     `keep: Google Search Console verification, second owner (RP-04)` (62 characters). **Save.**
  3. Once the outside check below shows it, select **Verify** in the second profile.
- **Do, delegated:** in the company account, **Settings** > **Users and permissions** > **Add user**. Enter the
  second Google account, choose the permission **Owner**, and save. Google: "Users must have a valid Google
  Account." and "An email group cannot be added as a user."
- **Check:** **Settings** > **Users and permissions**. Google: "If the user is listed as both Owner and Verified, it
  means that they are a verified owner. If a user is listed as Owner without the word Verified, it means that they
  are a delegated owner." Verified: both accounts show Owner and Verified. Delegated: the second shows Owner only.
- **Outside check:** verified: `dig +short TXT rewardspro.io @ed.ns.cloudflare.com` lists two
  `google-site-verification=` lines. Delegated: none exists; the Users and permissions page is the only view.
- **Record it:** after the sitting, an agent adds one dated line to §1 of this sheet with the roles only, for
  example *the company Workspace account and one second account, both verified owners*. GROWTH act 3 asks for both
  owners to be recorded in the kit; the addresses stay in the owner's private notes, because the repo is public.
- **Sources:** https://support.google.com/webmasters/answer/7687615 (read 2026-11-09).

### A5. Search generative AI: confirm "Include" (~1 min)

- **Do:** **Settings** > **Search generative AI**. Check that it says "Include my site's links and content in Search
  generative AI features". Google: "This is the default control for all properties." Change nothing.
- **Why:** it covers AI Overviews, AI Mode and generative AI features in Google Discover. Excluding means "links to
  your site and your site's content won't appear in Search generative AI features", which works against being
  recommended accurately. It isn't the training switch: "This control doesn't affect AI training; to limit
  training of the models used to generate responses in Search generative AI features, use Google-Extended."
- **Check:** the page shows Include. "As of August 31, 2026, we've rolled out this control to all websites
  worldwide."
- **Outside check:** none exists; the settings page is the only view.
- **Source:** https://support.google.com/webmasters/answer/16908024 (read 2026-11-09).

### A6. URL Inspection of the home page (~3 min)

- **Do:** type `https://rewardspro.io/` into the inspection search bar at the top of any Search Console screen.
  1. The indexed result comes first. Note whether it says "URL is on Google", and the **Last crawl** date and
     **Page fetch**: they describe Google's last real crawl ("The last time this page was crawled by Google"). The
     page toggles between the two views "by clicking Google Index or Live Test".
  2. Select **Test live URL**. Page fetch should be "Successful". This is Google's inspection crawler reaching the
     page through Cloudflare today, not Googlebot: "The live URL test only confirms if Google-InspectionTool can
     access your page for indexing." The user-agent observation in §1 can't show this.
  3. If the Last crawl date is before 9 November 2026, select **Request indexing**: Google's copy then predates the
     stopgap page, which went live that day (§1), so the request swaps the old page for today's. If it is 9 November
     or later, leave it; A7 requests indexing after RP-08.
- **Why:** it is the baseline before the state A page, and the one outside check that a Google crawler gets through
  Cloudflare.
- **Check:** the live test's result. "There is a daily limit of inspection requests for each property".
- **Source:** https://support.google.com/webmasters/answer/9012289 (read 2026-11-09).

### C1. Removals request for the docs host (~3 min, or skipped)

- **Gate:** A3 verified; the request needs the Domain property, which covers the subdomain. Where RP-03's sheet will
  put the 410 isn't known yet. If the 410 comes in the same sitting, do C1 before it.
- **First, by hand:** search Google for `site:docs.rewardspro.io` yourself (agents don't load Google result pages),
  and run `curl -sI https://docs.rewardspro.io/`.
  - **Nothing listed:** skip C1; there is nothing to remove.
  - **Pages listed, and the host still answers `307`:** file the request now, in this sitting. Google: "Use this
    feature as the first step in permanently blocking a page from Google Search results."
  - **Pages listed, but the host already answers `410` or `404`:** skip C1. Google: "If your URL is unreachable by
    Google (404, 502/3) when you use this tool, it will assume that the page is gone, and your block request will
    expire." And among the cases when not to use the tool: "To clean up cruft, like old pages return 404. … There's
    no need to request an urgent update." A 410 isn't in Google's list, but it says the same, "Gone" [I].
- **Do:** **Removals** > the **Temporary Removals** tab > **New Request** > **Temporarily remove URL** >
  **Remove all URLs with this prefix**, and enter `https://docs.rewardspro.io/`. Select **Next**. A subdomain prefix
  stays on that subdomain: "Blocking https://staging.domain will not block www.domain or https://domain.com."
- **Caution:** never enter `https://rewardspro.io/` as a prefix. Google: "To block an entire site, use a URL like
  this: https://example.com/".
- **Why it lasts about six months, and what makes it permanent:** "A successful request lasts only about six
  months." To make it permanent, "make sure that your web server returns either a 404 (Not Found) or 410 (Gone) HTTP
  status code", or block access, or use `noindex`; "Do not use robots.txt as a blocking mechanism." Today's 307 to
  GitBook's app is none of those, and it isn't one of the codes Google calls unreachable [I]. RP-03's sheet is to
  set the 410.
- **After RP-03's 410 is live:** Google: "If you blocked the page before removing your content permanently (step 1),
  unblock and then reblock the page. This clears the page from the index, if it was recrawled after blocking." That
  means **Cancel request** in the history table, then a new request with the same prefix. Do it once the first
  request shows as processed ("The request usually takes up to a day to process, and is not guaranteed to be
  accepted."); Google gives no other wait [I]. The new request may later show as expired, since the URL then answers
  410 [I].
- **Check:** the request's status in the history table. Outside: `curl -sI https://docs.rewardspro.io/` answers
  `307` today, and `410` once RP-03's step is done.
- **Source:** https://support.google.com/webmasters/answer/9689846 (read 2026-11-09).

### A7. After RP-08 is live: the sitemap, then indexing (~5 min)

- **Gate:** RP-08's state A page, with its rewritten `sitemap.xml`, merged and deployed by the owner.
- **Do:**
  1. Inspect `https://rewardspro.io/sitemap.xml` and run **Test live URL**. Google: "You can test if the sitemap is
     accessible to Googlebot by running a live URL inspection and checking that Page fetch is 'Successful'."
  2. Open the **Sitemaps** report, paste `https://rewardspro.io/sitemap.xml` into **Add a new sitemap**, and select
     **Submit**.
  3. Inspect `https://rewardspro.io/` and select **Request indexing**. Do the same for `/privacy-policy/` once
     RP-07's page is live.
- **Why wait for RP-08:** today's sitemap lists the page being rewritten, with a July `lastmod`. Submitting once,
  when it lists true pages with true dates, keeps the report clean. Google already finds the sitemap through
  robots.txt's Sitemap line, so waiting costs little [I]. Google also says a small site that links every page from
  the home page "probably" doesn't need one; the submission is mainly for the report's status.
- **Check:** the Sitemaps report shows "Success". Outside: `curl -sI https://rewardspro.io/sitemap.xml` answers 200.
- **At S2:** when `/help/` ships (RP-09), inspect it, request indexing, and resubmit the sitemap ("If you make big
  changes to a sitemap, you might want to resubmit").
- **Sources:** https://support.google.com/webmasters/answer/7451001 and
  https://support.google.com/webmasters/answer/9012289 (both read 2026-11-09).

### D1. Optional: Bing Webmaster Tools (~10 min; the owner's word, default not now)

- **Gate:** A3 done, and the owner's yes. It is a sign-up, and Bing keeps a connection to the Search Console
  account's list of verified sites and sitemaps.
- **Do:** the four steps Bing gives:
  1. "Sign-in to your Bing Webmaster Tools account or create a new one".
  2. "Navigate to My Sites page on Bing Webmaster Tools and click Import."
  3. "Sign-in with your Google Search Console account and click Allow to give Bing Webmaster Tools access to your
     list of verified sites and sitemaps."
  4. Select rewardspro.io and click **Import**.
- **What it gives:** **AI Performance**, which "shows how publisher content appears across Microsoft Copilot,
  AI-generated summaries in Bing, and select partner integrations": total citations, cited pages, grounding queries
  and page-level citations (public preview from 2026-02-10). Intents, Topics, Citation Share and Compare were added
  in preview on 2026-06-16.
- **What it keeps:** "Bing Webmaster Tools will periodically validate your site ownership status by syncing with your
  Google Search Console account. Therefore, if access to your Google Search Console account is revoked, you will need
  to reconnect or verify your sites using an alternative verification method". So A2's record also carries Bing's
  verification [I].
- **Check:** My Sites lists rewardspro.io as verified. Bing: "it might take up to 48 hours to get traffic data".
- **Outside check:** none exists; Bing's dashboard is the only view.
- **Not confirmed:** which account types Bing's sign-in accepts. The 2026-11-07 plan said it needs a Microsoft
  account; the pages read today don't say. Bing's help page for adding a site
  (https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b) returned no article text to a plain read
  [U].
- **Sources (read 2026-11-09):**
  - https://blogs.bing.com/webmaster/2019/9/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools/ (2019-09-13,
    "Updated June, 2025")
  - https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
    (2026-02-10)
  - https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/
    (2026-06-16)

---

## 3. The monthly read, from S2 (about 5 minutes)

From S2 on, once a month [proposal]. In a week that overruns, it drops to quarterly (ROADMAP §7's order). Note the
date and the numbers in the same private monthly log as the AI-answer panel (`…/wf6/ai-rec.md` §5.4), never in git.
Agents read only what the owner pastes to them.

| # | Where | Note | What it tells us |
|---|---|---|---|
| 1 | Search Console, **Performance** (Search results), last 28 days, search type **Web: text-based** (add **Web: multimodal** if wanted) | Clicks, impressions; on the Queries tab, any question a `/help/` section answers | A query with impressions that a `/help/` section answers is the signal to split that section into its own page (GROWTH §6.3). AI Overviews and AI Mode traffic is counted here, "within the 'Web' search type" |
| 2 | Search Console, **Generative AI performance report** (the help page's "Open the Generative AI performance report" link; its menu label wasn't on the pages read [U]) | Impressions in AI Overviews and AI Mode, and the pages shown | "Not seeing the report? This usually happens when your site hasn't received enough impressions in generative AI features" is normal at this size |
| 3 | Search Console, **URL Inspection** of `/` and `/help/` | "URL is on Google", Last crawl date | For a site under about 500 pages, Google points to `site:` searches (the owner's, by hand) and URL Inspection rather than the Page indexing report |
| 4 | Search Console, **Sitemaps** | Status | "Success" is the only good status |
| 5 | Cloudflare, **AI Crawl Control**, Overview and Metrics | Which crawlers fetched the site; any 4xx in "Status code distribution" for a search or agent crawler. Leave 9 November 2026 out of the counts and codes (§1, B2) | A 403 means something blocks a crawler we want; tell an agent the crawler, the code and the date |
| 6 | Cloudflare, **Security** > **Analytics**, **Events**, Service "Bot Fight Mode" (only if it was left on in B1) | Any search or agent crawler among the challenged requests | If one appears, the B1 default applies: turn Bot Fight Mode off (the owner's call) |
| 7 | Bing Webmaster Tools, **AI Performance** (only if D1 was done) | Total citations, cited pages | Copilot and Bing AI answers citing rewardspro.io |

Rules carried over from GROWTH §6.2: fix the source, never the answer. A low number never triggers ads, GEO vendors
or forum posts.

**Sources for this section (read 2026-11-09):** https://support.google.com/webmasters/answer/7576553,
https://support.google.com/webmasters/answer/16984139, https://support.google.com/webmasters/answer/7440203,
https://developers.google.com/search/docs/appearance/ai-features (last updated 2025-12-10), and the Cloudflare and
Bing pages cited in B1, B2 and D1.

---

## 4. Not confirmed

- Whether the Search Console wizard lists Cloudflare as a provider, and whether the company Workspace account is
  verified automatically (A1).
- The current AI crawler policies, Bot Preference Sync, Bot Fight Mode, Crawler Hints and per-crawler actions on the
  zone, and whether the 15 September defaults reached it (B1–B3, §5). Only the dashboard shows them.
- Which crawlers Cloudflare counts as mixed-purpose, and whether ordinary search engines' crawlers are among them
  (B1).
- Which crawlers Cloudflare's managed robots.txt lines name for each Training choice (B1).
- Whether Bot Fight Mode challenges verified Google and Bing crawlers. Perplexity says it can challenge Perplexity's
  bots; B1's Events look shows the effect on the day.
- Whether Crawler Hints fires for Pages deploys (B3).
- The sidebar label of the Generative AI performance report (§3).
- Which account types Bing Webmaster Tools accepts, and the text of Bing's add-a-site help page (D1).
- The zone's Cloudflare plan. It affects the comment length (A2) and AI Crawl Control's detection and referrals
  (B2).

---

## 5. For reviewers: where today's docs differ from the 2026-11-07 plans, and how this was checked

The owner doesn't need this section in the sitting. The plans are `…/wf6/GROWTH.md` §4.2 act 3 and §6.2–§6.3,
`…/wf6/seo.md` §3.4, `…/wf6/ai-rec.md` §3, §5.7 and §6 step 3, and `…/wf10/status.md` §1.B7–B8, C1–C3 and D3. Where
they differ from today's docs, this sheet follows the docs.

| Topic | The plans | Today's docs (read 2026-11-09) | Here |
|---|---|---|---|
| Policy actions | Allow, Block, Disallow | Adds "Block on pages with ads", and per-agent settings for the top Personal Agents | B1 |
| Search behaviour | AI search | Covers traditional search too, and one bot can have several behaviours (verified-bots page) | B1 |
| Defaults | Not covered | A changelog post of 2026-07-01 (https://developers.cloudflare.com/changelog/post/2026-07-01-ai-traffic-options/) says new domains onboarding from 15 September 2026 get Training and Agent blocked on pages with ads, and "All customers can opt out of the new defaults at any time before September 15." The policy page of 2026-11-02 says new domains default to Allow. Whether the September defaults reached existing zones such as rewardspro.io is [U] | B1 step 1 settles it |
| Bot Preference Sync | Named with Disallow | Cloudflare's Disallow steps turn it on; with it on, Block or Block on pages with ads also prepends managed content | B1 step 5 and the robots.txt table |
| Bot Fight Mode | Not covered | Can't be bypassed by WAF custom rules (Cloudflare); can still challenge Perplexity's bots (Perplexity) | B1 look and default; §3 row 6 |
| AI Crawl Control | A passive feed, "Available on all plans" | The same, plus a per-crawler Allow or Block, a Category column, Free-plan detection by user agent only, and referrals on paid plans only | B2 |
| Crawler Hints | A dashboard toggle that sends IndexNow [I] | Confirmed: the caching Configuration page, every plan, triggered by cache `MISS` | B3 |
| "Search generative AI" and its report | Settings > Search generative AI on "Include"; a Generative AI performance report | Both exist; rolled out worldwide on 2026-08-31 | A5; §3 row 2 |
| Performance search type | "Web" | Split into "Web: text-based" and "Web: multimodal" | §3 row 1 |
| Removals order | The plans disagree: GROWTH act 3 lists the request after the 410 but calls it "the quick first step"; status.md §1.C3 says "a Search Console Removal first" | "the first step"; a request on an unreachable URL "will expire"; old 404 pages need no request; a URL blocked before the permanent fix is unblocked and reblocked | C1: request before the 410, only if Google lists pages; skipped if the 410 is already live |
| Second owner | "A second owner", type not set | Verified or delegated, same permissions; delegated owners lose access after a grace period if no verified owner remains | A4 proposes verified |
| Workspace accounts | Not covered | Verification can be automatic for "a Google Workspace account" | A1 branch |
| OpenAI's quote | "…will not be shown in ChatGPT search answers" | The sentence continues ", though can still appear as navigational links."; the page moved to developers.openai.com | B1 |
| Anthropic | Claude-SearchBot and Claude-User for search; ClaudeBot for training | The same, plus: from 2026-10-30 Anthropic honours a "no AI training" signal based on the IETF aipref draft. Whether Cloudflare's `Content-signal` line is that signal isn't stated [U] | Matters only if Training is Disallow |
| Bing | Import needs "a Microsoft account and an OAuth grant" | Sign in or create a Webmaster Tools account, then sign in to Search Console and click Allow; account types not stated [U]. AI Performance gained Intents, Topics, Citation Share and Compare on 2026-06-16 | D1 |
| Public DNS | Two other apex TXT records and two DMARC records | SPF only at the apex; one DMARC record | §1; A2 |

**How it was checked.** Each vendor page cited here was read once on 2026-11-09 with `curl` and a generic browser
user agent, one page at a time, robots.txt first on each host, with no account and no personal detail in any
request, and saved. Every quotation was checked by script against the saved copy of its page. Public DNS was read
with `dig`; rewardspro.io with a handful of GETs and a generic user agent, its `/` and `/robots.txt` hashed against
main at 2fe85336. Bing's add-a-site help page needs a script to render, and neither `curl` nor a fetch tool got its
text. Nothing was signed in to or changed; no Google or Bing result page was loaded; no apps.shopify.com or
help.shopify.com page was opened. The bot user-agent requests in §1 were made by another session and are reported,
not repeated.
