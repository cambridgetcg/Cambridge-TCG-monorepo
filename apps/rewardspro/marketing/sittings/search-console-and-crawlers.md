# Search Console and AI crawlers: the owner's sitting sheet (RP-04)

**An agents' proposal, written 2026-11-09 for package RP-04 (issue #164). Nothing in it is decided.** The owner does
every step by hand, signed in to the company's own accounts. Agents changed no setting, created no account and signed in to
nothing while writing it. It is the webmaster half of ROADMAP §4 action 5. The other half is RP-03's sheet,
[cloudflare.md](cloudflare.md), which covers mail, the rest of the DNS records, `www` → apex and the docs host's 410.
Run RP-03's mail steps first, then this sheet, in the same sitting.

Every step names what to click or type, the choice with one line of why, the time, an outside check, and the
vendor page it rests on, read on 2026-11-09. Menu names are quoted from those pages. Where a page didn't give a
menu name, the step says so and doesn't guess.

Labels: **[V]** checked on 2026-11-09 against a vendor page, public DNS or a request to rewardspro.io; **[I]**
inferred; **[U]** unknown. Times are estimates [I]. `…` is the research folder that WORK.md names. Not legal advice.

---

## 0. Before you start

**The choices this sheet needs (ROADMAP §5 Now-3).** The defaults are proposals.

| Choice | Proposed default | Why, in one line | Step |
|---|---|---|---|
| Training policy in Cloudflare | **Allow (do not block)** | AGENTS.md principle 6: our pages "are free to read and reuse, by people, crawlers and AI training alike". And Block also stops mixed-purpose crawlers that feed search answers (§2, B1) | B1 |
| The Search Console account | The company Workspace account on rewardspro.io | The property then belongs to the company, not to one person's mailbox (GROWTH G14) | A1 |
| The second owner | A second Google account the owner controls, added as a **delegated** owner | If one account is lost, the property isn't, and no second DNS record is needed | A4 |
| Bing Webmaster Tools | **Not now** (Now-3's default) | It is a sign-up, and it gives Bing ongoing access to the Search Console account | D1 |

**Have open:** the Cloudflare dashboard on the rewardspro.io zone; Search Console, signed in with the company
Workspace account; a terminal for the outside checks. An agent can run the `dig` and `curl` checks for you, since
they only read public DNS and public pages.

**Time:** about 25–35 minutes hands-on in the sitting [I]. Later: about 5 minutes for the sitemap once RP-08 is
live (A7), and about 5 minutes a month from S2 (§3).

---

## 1. Where things stand (2026-11-09, about 21:40 UTC)

| What | Today | Label |
|---|---|---|
| DNS host | Cloudflare (`ed.ns.cloudflare.com`, `zoe.ns.cloudflare.com`) | [V, `dig`] |
| A Search Console Domain property | None verified by DNS: the apex has no `google-site-verification` TXT record. Whether someone holds a URL-prefix property under another account is unknown | [V, `dig`]; [U] |
| Mail for rewardspro.io | MX points to Google, so a Google Workspace mailbox on the domain exists | [V, `dig`]; [I] |
| `https://rewardspro.io/robots.txt` | 67 bytes: `User-agent: *`, `Allow: /`, a blank line, `Sitemap: https://rewardspro.io/sitemap.xml`. Byte for byte the file in git (sha256 `08a15f98…`), and the same bytes the 7 Nov plans recorded. No Cloudflare-managed block | [V] |
| The home page | 35,563 bytes, byte for byte `index.html` on main at 2fe85336 (sha256 `aa9318e5…`): the stopgap page from PR #191, not RP-08's state A page | [V] |
| `sitemap.xml` | Two URLs, `/` and `/privacy-policy/`, `lastmod` 2026-07-23 | [V] |
| `www.rewardspro.io` | 200 with the same page; no 301 yet (RP-03's step) | [V] |
| `docs.rewardspro.io` | A 307 to GitBook's app (unpublished on 2026-11-07); not a 404 or 410 | [V] |
| Cloudflare's AI crawler policies, Bot Preference Sync, Crawler Hints, AI Crawl Control | Not visible from outside. The unchanged robots.txt means either Bot Preference Sync is off or no policy is set to Block, Block on pages with ads or Disallow (Cloudflare's managed robots.txt page, quoted in B1) | [U]; [I] |

**Observation, reported by the session that wrote this package's brief (not re-run for this sheet).** On
2026-11-09, requests from a home connection to `https://rewardspro.io/` and `/robots.txt`, sent with the
user-agent strings of GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Googlebot,
bingbot, CCBot and Bytespider, each returned 200 with the full page (35,563 bytes) and the 67-byte robots.txt.
That shows there is no user-agent block rule at the edge. It does not show how Cloudflare treats verified bot
traffic, so the dashboard look in B1 still stands. The live robots.txt is `User-agent: *`, `Allow: /` and the
Sitemap line.

---

## 2. The steps, in order

The order saves waiting: add the DNS record first (A1–A2), do the Cloudflare settings while it propagates (B1–B3),
then come back to verify (A3–A6). C1 follows RP-03's 410 step. A7 waits for RP-08. D1 is optional.

| Step | What | Time [I] | Gate |
|---|---|---|---|
| A1 | Add the Domain property | ~3 min | Now-3: which account |
| A2 | Add the verification TXT record in Cloudflare, comment "keep" | ~3 min | — |
| B1 | AI Crawler and Agent access policies: look, then Search = Allow, Agent = Allow, Training = the owner's choice | ~5 min | Now-3: Training |
| B2 | AI Crawl Control: look; leave every crawler on Allow | ~3 min | — |
| B3 | Crawler Hints on | ~1 min | — |
| A3 | Verify the property | ~1 min (or a day later) | A2's record visible |
| A4 | Add the second owner | ~2 min | Now-3: which account |
| A5 | Search generative AI: confirm "Include" | ~1 min | — |
| A6 | URL Inspection of the home page | ~3 min | — |
| C1 | Removals request for the docs host | ~3 min | Best after RP-03's 410 is live |
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
  - **Comment:** `keep: Google Search Console Domain property verification (RP-04)` (63 characters)
  - Leave the TTL as it is. TXT records are always DNS-only, so there's no proxy setting.
  - **Save.**
- **Why "keep":** Google: "To stay verified, don't remove the DNS record from your provider, even after
  verification succeeds." Search Console "periodically checks if your verification token is still present and
  valid", and "If all verified owners lose access to a property, all users will lose access". So every later DNS
  clean-up, RP-03's included, leaves this record alone. A Cloudflare record comment is visible only to members of the
  account; the Free plan allows one comment of up to 100 characters per record (tags need a paid plan).
- **Leave alone:** every other TXT record. SPF, DMARC and the other apex TXT records are RP-03's.
- **Outside check:**
  - `dig +short TXT rewardspro.io @ed.ns.cloudflare.com` lists the `google-site-verification=` line (the
    authoritative answer, usually within a minute).
  - `dig +short TXT rewardspro.io @1.1.1.1` lists it too once caches catch up.
- **Sources:** Google, https://support.google.com/webmasters/answer/9008080 (read 2026-11-09). Cloudflare,
  https://developers.cloudflare.com/dns/manage-dns-records/how-to/set-up-google-workspace/ (last updated
  2026-09-16; read 2026-11-09) for Type, Name `@` and TXT being DNS-only, and
  https://developers.cloudflare.com/dns/manage-dns-records/reference/record-attributes/ (last updated 2026-08-14;
  read 2026-11-09) for comments.

### B1. AI Crawler and Agent access policies (~5 min)

- **Do:** **Security** > **Settings**, filter by **Bot traffic**, then select **AI Crawler and Agent access
  policies**.
  1. **First, write down what it shows now:** the action for Search, Agent and Training, and whether **Enable Bot
     Preference Sync** is on. Agents don't know the current state, and the 2026-11-07 plans recorded it as [U].
  2. **Search:** *Allow (do not block)*.
  3. **Agent:** *Allow (do not block)*. Leave the Personal Agents inheriting it ("Personal Agents inherit the
     **Agents** policy by default … Cloudflare recommends **Allow (do not block)** for Personal Agents").
  4. **Training:** the owner's choice, from the table below.
  5. **Save.**
- **What each behaviour is, in Cloudflare's words:** "**Search**: crawlers that collect or index your content to
  answer questions about it later." "**Agent**: automated activity acting in real time on a person's behalf, such
  as chat fetch bots and browser-use agents." "**Training**: crawlers taking your content to train or fine-tune a
  model, including mixed-purpose crawlers that are used both for Training and for Search." "Each policy applies to
  Verified bots with that behavior and matching unverified bots."
- **Why Search and Agent stay Allow:** they are how AI answers find and quote rewardspro.io, which is the point of
  the work (being recommended accurately). The crawler operators say the same about their own bots:
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
| **Block** | "Block matching requests across the zone." | Blocks training crawlers **and** mixed-purpose crawlers, so some crawlers that feed search answers stop too. Which crawlers Cloudflare counts as mixed-purpose isn't listed on the pages read today [U] |
| **Block on pages with ads** | "Block matching requests on pages where Cloudflare detects ads." | rewardspro.io carries no ads, so in practice the same as Allow [I] |
| **Disallow** | "For Training only, tell crawlers not to access your content through `robots.txt`." "When Bot Preference Sync is enabled, **Disallow** also blocks AI training crawlers at Cloudflare's edge. Mixed-purpose crawlers used for both Search and Training are excluded from this edge block." | With Bot Preference Sync on, Cloudflare prepends its managed directives and its Content Signals Policy to our robots.txt, and blocks training-only crawlers at the edge. Mixed-purpose crawlers still get through, but robots.txt asks them not to crawl; what each one then does is [U]. With Bot Preference Sync off, Cloudflare prepends nothing, so we could see no effect [I] |

- **Outside check, straight after Save:** `curl -s https://rewardspro.io/robots.txt`.
  - With Search, Agent and Training all on Allow, it is still the 67-byte file above.
  - With Training on Disallow and Bot Preference Sync on, a block starting `# BEGIN Cloudflare Managed content` and
    a `Content-signal` line now come before our own lines. Cloudflare: "the managed content appears within a few
    seconds. Reload your `robots.txt` to verify — no cache purge is required."
  - Anything else means the dashboard and the file disagree. Note what you set and tell an agent; don't change
    anything else in this sitting.
- **Note while you're on this page:** whether **Bot fight mode** is on. Don't change it in this sitting. The
  Cloudflare pages read today don't say whether it lets verified search and AI crawlers through [U]; B2's status
  codes and the monthly read will show if it challenges them.
- **Not used:** a read-only API call to read these settings (`ai-rec.md` §6 step 3). It would put a Cloudflare token
  in an agent's hands, and the dashboard look takes two minutes.
- **Sources (all read 2026-11-09):**
  - https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/ (last updated 2026-11-02)
  - https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ (last updated
    2026-11-02)
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
- **Why:** it is the passive feed that costs nothing: "Available on all plans". It shows which AI crawlers fetch
  rewardspro.io, how often, and with what status codes. Referral numbers need a paid plan. On the Free plan,
  "AI Crawl Control identifies AI crawlers based on their user agent strings", so its counts are by user agent.
- **Check:** **Metrics** > "Status code distribution". A 403 for a search or agent crawler means something blocks
  it; note the crawler and tell an agent. Early on there may be little or no data.
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
- **Check:** none from outside [U]. The toggle shows as on. Cloudflare decides that content has changed by
  cache-status `MISS`, and doesn't report responses with a status code "greater than 4xx". Whether that fires for a
  Pages-hosted site's deploys is [U].
- **Sources:** https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/ (last updated
  2026-08-14; read 2026-11-09);
  https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
  (2026-02-10; read 2026-11-09).

### A3. Verify the property (~1 min, or a day later)

- **Do:** back in Search Console, select **Verify**.
- **If it fails:** Google: "it can take up to two or three days for your provider to start serving the record. …
  wait a day or two and try again." A2's `dig` check shows whether Cloudflare serves it.
- **Check:** Search Console opens the property, and **Settings** > **Ownership verification** lists the method
  used (the DNS TXT record).
- **Note:** "Data is collected for a property as soon as anyone adds it in Search Console, even before verification
  occurs. However, it takes a few days for data to start to accrue".
- **Source:** https://support.google.com/webmasters/answer/9008080 (read 2026-11-09).

### A4. Add the second owner (~2 min)

- **Do:** **Settings** > **Users and permissions** > **Add user**. Enter the second Google account, choose the
  permission **Owner**, and save. Google: "Users must have a valid Google Account." and "An email group cannot be
  added as a user."
- **Choice:** a **delegated owner** (recommended) or a second **verified owner**.
  - Delegated: "Someone granted ownership status by a verified owner without the use of a verification token", added
    and removed on this page. No second DNS record.
  - Verified: the second account starts its own verification flow, and you add its own TXT token as a second "keep"
    record.
  - *Why delegated:* the owner holds the Cloudflare login, so any account can verify again by DNS if the company
    account is ever lost, and there is one record fewer to keep. The risk it leaves: "If all verified owners are
    removed, then all remaining users and delegated owners will lose access to the property after a grace period."
- **Check:** the list shows the company account as Owner with the word "Verified", and the second account as Owner
  without it. Google: "If a user is listed as Owner without the word Verified, it means that they are a delegated
  owner."
- **Record it:** roles and the date only ("the company Workspace account, verified; one delegated owner"). The repo
  is public, so the addresses stay in the owner's private notes.
- **Source:** https://support.google.com/webmasters/answer/7687615 (read 2026-11-09).

### A5. Search generative AI: confirm "Include" (~1 min)

- **Do:** **Settings** > **Search generative AI**. Check that it says "Include my site's links and content in Search
  generative AI features". Google: "This is the default control for all properties." Change nothing.
- **Why:** it covers AI Overviews, AI Mode and generative AI features in Google Discover. Excluding means "links to
  your site and your site's content won't appear in Search generative AI features", which works against being
  recommended accurately. It isn't the training switch: "This control doesn't affect AI training; to limit
  training of the models used to generate responses in Search generative AI features, use Google-Extended."
- **Check:** the page shows Include. "As of August 31, 2026, we've rolled out this control to all websites
  worldwide."
- **Source:** https://support.google.com/webmasters/answer/16908024 (read 2026-11-09).

### A6. URL Inspection of the home page (~3 min)

- **Do:** type `https://rewardspro.io/` into the inspection search bar at the top of any Search Console screen.
  1. Note whether it says "URL is on Google", and the last crawl date.
  2. Select **Test live URL**. Page fetch should be "Successful". This is Googlebot itself reaching the page
     through Cloudflare, which the user-agent observation in §1 can't show.
  3. **Request indexing** only if the last crawl is older than the day the stopgap page from PR #191 went live, so
     Google swaps an older copy for today's. Otherwise wait for A7.
- **Why:** it is the baseline before the state A page, and the one outside check of Googlebot's access.
- **Check:** the live test's result. "There is a daily limit of inspection requests for each property".
- **Source:** https://support.google.com/webmasters/answer/9012289 (read 2026-11-09).

### C1. Removals request for the docs host (~3 min; best after RP-03's 410)

- **Do:** **Removals** > the **Temporary Removals** tab > **New Request** > **Temporarily remove URL** >
  **Remove all URLs with this prefix**, and enter `https://docs.rewardspro.io/`. Select **Next**.
- **Why:** it takes the old docs host's pages out of Google Search quickly. It needs the Domain property (A1), which
  covers the subdomain.
- **Why it lasts about six months, and what makes it permanent:** Google: "A successful request lasts only about
  six months." To make it permanent, "make sure that your web server returns either a 404 (Not Found) or 410
  (Gone) HTTP status code", or block access, or use `noindex`; "Do not use robots.txt as a blocking mechanism."
  Today the host answers a 307 to GitBook's app, which is none of those. RP-03's sheet sets the 410.
- **Order:** Google also says: "If your URL is unreachable by Google (404, 502/3) when you use this tool, it will
  assume that the page is gone, and your block request will expire." So a request filed after the 410 may show as
  expired, which means Google treats the pages as gone. Whether it still hides them sooner than the 410 alone is
  [U]. If you file it before the 410 is live, then once the 410 is live do what Google says: "If you blocked the
  page before removing your content permanently (step 1), unblock and then reblock the page." That means **Cancel
  request** in the history table, then a new request.
- **Caution:** never enter `https://rewardspro.io/` as a prefix. That would hide the whole site.
- **Check:** the request's status in the history table ("The request usually takes up to a day to process, and is
  not guaranteed to be accepted."). Outside: `curl -sI https://docs.rewardspro.io/` answers `410` once RP-03's step
  is done. If you want to see what Google still holds, search `site:docs.rewardspro.io` yourself, logged out; agents
  don't load Google result pages.
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
  account.
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
| 1 | Search Console, **Performance** (Search results), last 28 days, search type Web | Clicks, impressions; on the Queries tab, any question a `/help/` section answers | A query with impressions that a `/help/` section answers is the signal to split that section into its own page (GROWTH §6.3). AI Overviews and AI Mode traffic is counted here, "within the 'Web' search type" |
| 2 | Search Console, **Generative AI performance report** (the help page's "Open the Generative AI performance report" link; its menu label wasn't on the pages read [U]) | Impressions in AI Overviews and AI Mode, and the pages shown | "Not seeing the report? This usually happens when your site hasn't received enough impressions in generative AI features" is normal at this size |
| 3 | Search Console, **URL Inspection** of `/` and `/help/` | "URL is on Google", last crawl date | For a site under about 500 pages, Google points to `site:` searches (the owner's, by hand) and URL Inspection rather than the Page indexing report |
| 4 | Search Console, **Sitemaps** | Status | "Success" is the only good status |
| 5 | Cloudflare, **AI Crawl Control**, Overview and Metrics | Which crawlers fetched the site; any 4xx in "Status code distribution" for a search or agent crawler | A 403 means something blocks a crawler we want; tell an agent the crawler, the code and the date |
| 6 | Bing Webmaster Tools, **AI Performance** (only if D1 was done) | Total citations, cited pages | Copilot and Bing AI answers citing rewardspro.io |

Rules carried over from GROWTH §6.2: fix the source, never the answer. A low number never triggers ads, GEO vendors
or forum posts.

**Sources for this section (read 2026-11-09):** https://support.google.com/webmasters/answer/7576553,
https://support.google.com/webmasters/answer/16984139, https://support.google.com/webmasters/answer/7440203,
https://developers.google.com/search/docs/appearance/ai-features (last updated 2025-12-10), and the Cloudflare and
Bing pages cited in B2 and D1.

---

## 4. Where today's docs differ from the 2026-11-07 plans

The plans are `…/wf6/GROWTH.md` §4.2 act 3 and §6.2–§6.3, `…/wf6/seo.md` §3.4, `…/wf6/ai-rec.md` §3, §5.7 and §6
step 3, and `…/wf10/status.md` §1.B7–B8, C1–C3 and D3. This sheet follows today's docs.

| Topic | The plans said | Today's docs say | This sheet |
|---|---|---|---|
| Training's side effect | "Training actions also apply to mixed-purpose crawlers used for both Search and Training" | The same sentence, on the page updated 2026-11-02 | Quoted as is (B1) |
| Policy actions | Allow, Block, Disallow | A fourth action, "Block on pages with ads", and per-agent settings for the top Personal Agents | Both in B1 |
| Defaults | Not covered | A changelog of 2026-07-01 said new domains onboarded from 15 September 2026 would block Training and Agent on pages with ads. The policy page of 2026-11-02 says "For new domains, **Search**, **Agents**, and **Training** use **Allow (do not block)** by default." rewardspro.io isn't a new domain either way | Follows the 2026-11-02 page; B1 starts by writing down what the dashboard shows |
| AI Crawl Control | A passive feed, "Available on all plans" | The same, plus a per-crawler Allow or Block, Free-plan detection by user agent only, and referrals on paid plans only | B2 checks the per-crawler actions too |
| Crawler Hints | A dashboard toggle that sends IndexNow [I] | Confirmed: the caching Configuration page, every plan, triggered by cache `MISS` | B3; whether it fires for Pages deploys is [U] |
| "Search generative AI" and its report | Settings > Search generative AI on "Include"; a Generative AI performance report [V] | Both exist; rolled out worldwide on 2026-08-31; the report covers AI Overviews and AI Mode | A5 and §3 row 2 |
| Removals | About six months; permanent needs a 404 or 410, blocked access or `noindex`; 410 first, then the request | The same, plus: a request on an unreachable URL "will expire", and a URL blocked before the permanent fix should be unblocked and reblocked | C1 keeps the order and adds Google's two sentences |
| OpenAI's quote | "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers" | The sentence continues ", though can still appear as navigational links." The page moved to developers.openai.com | Full sentence in B1 |
| Anthropic | Claude-SearchBot and Claude-User for search; ClaudeBot for training | The same three bots, plus: from 2026-10-30 Anthropic honours a machine-readable "no AI training" signal based on the IETF aipref draft. Whether Cloudflare's `Content-signal` line is that signal isn't stated [U] | Matters only if Training is set to Disallow |
| Bing | Import needs "a Microsoft account and an OAuth grant" | Bing's post: sign in or create a Webmaster Tools account, then sign in to Search Console and click Allow. The account types aren't stated [U]. AI Performance gained Intents, Topics, Citation Share and Compare on 2026-06-16 | D1, marked unconfirmed |
| Search Console second owner | "A second owner", type not set | Owners are verified or delegated, with the same permissions | A4 proposes delegated |

---

## 5. Not confirmed

- Whether the Search Console wizard lists Cloudflare as a provider (A1).
- The current AI crawler policies, Bot Preference Sync, Bot Fight Mode, Crawler Hints and per-crawler actions on the
  zone (B1–B3). Only the dashboard shows them.
- Which crawlers Cloudflare counts as mixed-purpose (B1).
- Whether Bot Fight Mode lets verified search and AI crawlers through (B1).
- Whether Crawler Hints fires for Pages deploys (B3).
- Whether a Removals request filed after the 410 hides the URLs sooner than the 410 alone (C1).
- The sidebar label of the Generative AI performance report (§3).
- Which account types Bing Webmaster Tools accepts, and the text of Bing's add-a-site help page (D1).
- The zone's Cloudflare plan. It affects the comment length (A2) and AI Crawl Control's detection and referrals
  (B2).

---

## 6. How this sheet was checked (2026-11-09)

- **Vendor pages:** each page cited above, read with `curl` and a generic browser user agent, one page at a time,
  with no account and no personal detail in any request; robots.txt checked first on each host. Cloudflare pages
  were located through Cloudflare's own docs search. Bing's add-a-site help page needs a script to render: neither
  `curl` nor a fetch tool got its article text. Every quotation in this sheet was checked by script against the
  saved copy of its page.
- **Public DNS:** `dig` against 1.1.1.1 for NS, A, AAAA, TXT, MX and `_dmarc` on rewardspro.io, and for `www` and
  `docs`.
- **rewardspro.io:** a handful of GETs of `/`, `/robots.txt`, `/sitemap.xml`, `www.` and `docs.`, with a generic
  browser user agent; the hashes of `/` and `/robots.txt` compared with the files on main at 2fe85336.
- **Not done:** no sign-in to Search Console, Cloudflare, Bing or Google; no setting changed; no Google or Bing result
  page loaded; no apps.shopify.com or help.shopify.com page opened. The bot user-agent requests in §1 were made by
  another session and are reported, not repeated.
