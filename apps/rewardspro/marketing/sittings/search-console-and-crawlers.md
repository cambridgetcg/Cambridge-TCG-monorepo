# Mail, Cloudflare and Search Console: the owner's sitting sheet (RP-03, RP-04)

**An agents' proposal.** Written on 2026-11-09 for RP-04 (#164). On 2026-11-10 the second read's fixes went in and
RP-03 (#163: mail, `www`, the docs host) was folded in, so there is one sheet and one sitting. Nothing in it happens
until the owner says go to this sheet.

**Start here (about 15–20 minutes, the owner's):** M1, send one email to contact@ from a personal address (~3 min);
then M2, turn on DKIM in Google Admin (~10–15 min). They are the first two steps in §2.
**Done on 10 Nov (#164, #223):** M1 (the owner's test reached contact@), M2 and M3 (SPF corrected, DKIM on) and R1 (`www`);
§1 below is the state before them. M4, the SPF, DKIM and DMARC read, is still open.

**Who does what.** Each step is marked **Owner** or **Agent**. The owner does every step signed in to Google Admin,
Search Console or Bing, the Cloudflare settings in B1–B3, and every choice. An agent adds the DNS records (M3, A2,
A4 step 2) in Cloudflare. That rests on the owner's standing yes of 10 November 2026 ("yes for 1-4", typed in a
live session), whose item 3 lets an agent add DNS records once he says go to a sheet. His go to this sheet is also
his word for the two agent steps that aren't new records: the SPF edit (M3) and the `www` redirect rule (R1). He can
leave either out when he says go, and it is then his by hand. Agents run the `dig` and `curl` checks at any point; they read only public DNS and public
pages.

Every step names what to click or type, the choice with one line of why, the time, an outside check (or says that
none exists), how to undo it, and the vendor page it rests on. Menu names are quoted from those pages. Where a page
didn't give a menu name, the step says so and doesn't guess. Pages cited for RP-04 were read on 2026-11-09, and a
second session re-read them on 2026-11-10 and found every quotation word for word. Pages for mail and RP-03 were read
on 2026-11-10.

Labels: **[V]** checked against a vendor page, public DNS, git or a request to rewardspro.io; **[I]** inferred;
**[U]** unknown. Times are estimates [I]. `…` is the research folder that WORK.md names. Not legal advice.

---

## 0. Before you start

**The choices this sheet needs (ROADMAP §5 Now-3).** The defaults are proposals.

| Choice | Proposed default | Why, in one line | Step |
|---|---|---|---|
| DMARC | Leave `v=DMARC1; p=none` as it is | Google: "When you start using DMARC, we recommend setting the policy option (p) to none", and SPF and DKIM "should be authenticating messages for at least 48 hours before turning on DMARC" | M3 |
| Training policy in Cloudflare | **Allow (do not block)** | AGENTS.md principle 6: our pages "are free to read and reuse, by people, crawlers and AI training alike". And Block also stops mixed-purpose crawlers that feed search answers (B1) | B1 |
| The Search Console account | The company Workspace account on rewardspro.io | The property then belongs to the company, not to one person's mailbox (GROWTH G14) | A1 |
| The second owner | A second Google account the owner controls, as a second **verified** owner, with its own TXT record marked "keep" | Only a verified owner keeps the property if the company account is lost. A delegated owner needs no record now, but "If all verified owners are removed, then all remaining users and delegated owners will lose access to the property after a grace period", and the second account must then verify with its own record anyway | A4 |
| Bot Fight Mode, if it is on | **Off** | The site is static pages with no form or sign-in to protect, and Bot Fight Mode can challenge the crawlers this work wants, with no exemption: Cloudflare's own remedy is "you can turn off Bot Fight Mode or upgrade to Super Bot Fight Mode". It is probably off already (§1) | B1 |
| `www` | A 301 to `https://rewardspro.io/` | The page's canonical link already names the apex; the redirect makes `www` agree | R1 |
| Bing Webmaster Tools | **Not now** (Now-3's default) | It is a sign-up, and it gives Bing ongoing access to the Search Console account's list of verified sites and sitemaps | D1 |

**Have open:** the Google Admin console, signed in as a super administrator; a personal mailbox on another domain,
for M1 and M4 (its address stays out of every repo and every message to an agent); the Cloudflare dashboard on the
rewardspro.io zone; Search Console, signed in with the company Workspace account; for a verified second owner, a
second browser profile signed in with the second account; and an agent in a session, to add the records.

**Time [I]:** mail about 15–20 minutes in the sitting, then about 5 minutes within 48 hours (M4). Search Console and
crawlers about 30–40 minutes; `www` about 3 minutes. In all, about 50–65 minutes. Later: about 5 minutes for the
sitemap once RP-08 is live (A7), and about 5 minutes a month from S2 (§3).

---

## 1. Where things stand (2026-11-10, DNS and the live site re-read at 11:25–11:34 UTC)

| What | Today | Label |
|---|---|---|
| DNS host | Cloudflare (`ed.ns.cloudflare.com`, `zoe.ns.cloudflare.com`) | [V, `dig`] |
| MX (mail in) | Google's five hosts, `aspmx.l.google.com` at 1 to `alt4.aspmx.l.google.com` at 10: the five that Cloudflare's Google Workspace page lists | [V, `dig` at 1.1.1.1, 8.8.8.8 and `ed.ns.cloudflare.com`] |
| SPF (the apex TXT record) | One record: `v=spf1 include:dc-aa8e722993._spfm.rewardspro.io ~all`. Its include target doesn't exist (NXDOMAIN at `ed.ns.cloudflare.com`), so every SPF check of our mail ends in an error, and the record doesn't name Google's servers at all | [V, `dig`]; the effect [I] |
| DKIM | No record at `google._domainkey.rewardspro.io` | [V, `dig`] |
| DMARC | One record at `_dmarc`: `v=DMARC1; p=none` | [V, `dig`] |
| What that means for mail | Mail **from** contact@ can pass neither SPF nor DKIM for rewardspro.io, so it fails DMARC and may be marked as spam. Google, for mail to personal Gmail accounts: "All senders must Set up SPF or Set up DKIM." Mail **to** contact@ needs MX (which is right) and a contact@ user, alias or group in the Workspace, which DNS can't show; M1 tests it | [I]; [U] |
| contact@rewardspro.io | The address the app shows merchants on its Settings page (`CONTACT_EMAIL` in `apps/rewards/app/routes/app.settings._index.tsx`) | [V, git on main] |
| Other senders as @rewardspro.io | The rebuilt app (`apps/rewards`) has no mail-sending code on main. The old app (`apps/rewardspro`, on main until B5 retires it) sends through SendGrid as `rewards@rewardspro.io` (`app/services/sendgrid.server.ts`), and public DNS has SendGrid's DKIM records, CNAMEs at `s1._domainkey` and `s2._domainkey`. Its SendGrid key is listed for deletion in `apps/rewards/docs/switch.md`; whether it still sends is unknown. No other sender found | [V, `git grep`, `dig`]; [U]; none elsewhere [I] |
| A Search Console property | None verified by a DNS TXT record: the apex has no `google-site-verification` TXT record. Whether a property exists by another method or under another account is unknown. Google's other routes include a CNAME record at a name its wizard gives (`dig` can't look it up without that name) and automatic verification for a Workspace account (A1) | [V, `dig`]; [U] |
| Other apex TXT records | None. The 7 Nov plans recorded two other apex TXT records and two DMARC records (ROADMAP §1; `…/wf10/status.md` §1.C11); they were deleted on 2026-11-09 | [V, `dig`] |
| `https://rewardspro.io/robots.txt` | 67 bytes: `User-agent: *`, `Allow: /`, a blank line, `Sitemap: https://rewardspro.io/sitemap.xml`. Byte for byte the file in git (sha256 `08a15f98…`). No Cloudflare-managed block | [V] |
| The home page | Byte for byte `index.html` on main (sha256 `aa9318e5…`): the stopgap page from PR #191, not RP-08's state A page. PR #191 merged at 01:04 UTC on 2026-11-09 and the site is deployed by hand, so it went live later that day [I]. Its canonical link is `https://rewardspro.io/` | [V, git and a request] |
| `sitemap.xml` | Two URLs, `/` and `/privacy-policy/`, `lastmod` 2026-07-23 | [V] |
| Cache status | `/` and `/sitemap.xml` answer `cf-cache-status: DYNAMIC` (B3) | [V, `curl -sI`] |
| `www.rewardspro.io` | 200 with the same page; no redirect to the apex yet (R1). `http://www.` answers 301 to `https://www.` | [V] |
| `docs.rewardspro.io` | A 307 to GitBook's app (unpublished on 2026-11-07); not a 404 or 410 (R2) | [V] |
| Cloudflare's AI crawler policies, Bot Preference Sync, Crawler Hints, AI Crawl Control | Not visible from outside. The unchanged robots.txt means either Bot Preference Sync is off or no policy is set to Block, Block on pages with ads or Disallow (B1's robots.txt table). Last known: on 2026-10-18 the old setting `ai_bots_protection` was turned off with the owner's go (`…/wf6/ai-rec.md` §3; `…/wf10/status.md` §1.C1). How that maps onto today's three policies is [U] | [U]; [I] |
| Bot Fight Mode | Probably off. Requests for `/` (two by the second read with a cookie jar, one more today) came back byte for byte as git, with no `/cdn-cgi/challenge-platform/` script. For Bot Fight Mode customers, JavaScript Detections "is automatically enabled and cannot be disabled", and it is the feature that will "insert a script tag in all HTML pages". Whether it injects for a client that isn't a browser isn't stated | [I] |
| GitHub repos | `rewardspro-marketing` is private and `rewardspro-docs` is archived: RP-03's first two items are done | [V, `gh repo view`] |

**Observation, reported by the session that wrote this package's brief.** On 2026-11-09, requests from a home
connection to `https://rewardspro.io/` and `/robots.txt`, sent with the user-agent strings of GPTBot, OAI-SearchBot,
ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Googlebot, bingbot, CCBot and Bytespider, each returned 200 with
the full page and the 67-byte robots.txt. That shows there is no user-agent block rule at the edge. It doesn't show
how Cloudflare treats verified bot traffic, so the dashboard look in B1 still stands. They aren't worth repeating:
they prove little, and they may show up under the bots' names in AI Crawl Control for that day (B2).

---

## 2. The steps, in order

Mail comes first, because DKIM can take up to 48 hours to start working. Collect the values while you're signed in
(M2's DKIM key, A1's verification value, and A4 step 1's for a verified second owner) and give them to the agent in
one message with your go. Do the Cloudflare settings (B1–B3) while the agent adds the records. Then start DKIM (M2
step 6), verify Search Console (A3) and carry on. A4–A6 and C1 need A3 to have verified; B1–B3 and R1 don't.

| Step | Who | What | Time [I] | Gate |
|---|---|---|---|---|
| M1 | Owner | Send one email to contact@ from a personal address | ~3 min | None |
| M2 | Owner | Google Admin: generate the DKIM key, then (after M3) Start authentication | ~10–15 min | Super administrator sign-in |
| A1 | Owner | Search Console: add the Domain property and copy its TXT value | ~3 min | Now-3: which account |
| M3, A2 | Agent | Cloudflare DNS: edit SPF; add the DKIM and verification records | ~5 min | The owner's go; M2's and A1's values |
| B1 | Owner | AI Crawler and Agent access policies; Bot Preference Sync; Bot Fight Mode | ~6 min | Now-3: Training, Bot Fight Mode |
| B2 | Owner | AI Crawl Control: look; every crawler on Allow | ~3 min | — |
| B3 | Owner | Crawler Hints on | ~1 min | — |
| A3 | Owner | Verify the property | ~1 min (or a day later) | A2's record visible |
| A4 | Owner (record: agent) | Add the second owner | ~5 min verified, ~2 min delegated | A3; Now-3: which account and which type |
| A5 | Owner | Search generative AI: confirm "Include" | ~1 min | A3 |
| A6 | Owner | URL Inspection of the home page | ~3 min | A3 |
| C1 | Owner | Removals request for the docs host, only if Google lists its pages | ~3 min, or skipped | A3; before any 410 (R2) |
| R1 | Agent (or the owner) | `www` to the apex, a 301 | ~3 min | The owner's go |
| M4 | Owner | Within 48 hours: send from contact@ to a Gmail address and read the result | ~5 min | M2 started |
| A7 | Owner | Submit the sitemap; inspect and request indexing | ~5 min, later | RP-08 merged and deployed |
| D1 | Owner | Bing Webmaster Tools import and AI Performance | ~10 min | Optional; the owner's word |
| R2, R3 | — | Later, not this sitting: the docs host's 410; Bluesky's `_atproto` | — | Their own PR or word |

### M1. Send one email to contact@ (~3 min, Owner)

- **Do:** from a personal mailbox on another domain, send a short message to `contact@rewardspro.io` with a subject
  you'll recognise. Then open the Workspace inbox that receives contact@ mail and look for it, in spam too.
- **If it arrives:** mail in works.
- **If it bounces, or hasn't arrived after about 10 minutes:** contact@ is probably not a user, alias or group in the
  Workspace [I]. Adding it (an alternate address on a user, or a group, in the Admin console) is the owner's; the
  clicks weren't read for this sheet [U]. Send again after.
- **Why first:** it is the address RewardsPro's Settings page gives merchants (§1). Mail in depends on MX, which
  points to Google, and on contact@ existing; it doesn't depend on our SPF or DKIM [I]. So this separates *contact@
  doesn't receive* from *our mail out isn't authenticated*, which M2–M4 fix.
- **Tell an agent:** "arrived" or "didn't", and the date. Never the personal address or the message.
- **Outside check:** `dig +short MX rewardspro.io` lists the five Google hosts (it does today). Nothing outside
  shows whether a mailbox exists.
- **Undo:** nothing to undo.

### M2. Turn on DKIM in Google Admin (~10–15 min, Owner)

Google: "You must be signed in as a super administrator for this task."

1. Go to the Google Admin console (`admin.google.com`): **Menu** > **Apps** > **Google Workspace** > **Gmail**.
2. Click **Authenticate email**.
3. In the **Selected domain** menu, choose `rewardspro.io`. If it isn't in the menu, stop and tell an agent. If the
   status already reads "Authenticating email with DKIM", stop: DKIM is on (unlikely, as DNS has no key today [I]).
4. Click **Generate New Record**. In the box, choose the DKIM key bit length **2048**, and leave the prefix selector
   as `google` ("The default prefix selector is google. If you are using Google Workspace, this is the recommended
   option."). Click **Generate**.
5. Copy the **DNS Host name (TXT record name)**, which should be `google._domainkey`, and the **TXT record value**,
   which starts `v=DKIM1; k=rsa; p=`. Give both to the agent for M3. Google: "Important: Do not click Start
   Authentication yet."
6. When the agent says M3's check shows the key, go back to **Authenticate email**, choose `rewardspro.io` and click
   **Start authentication**. Done when "the status at the top of the page changes to: Authenticating email with
   DKIM".

- **Why:** DKIM signs each message with a key published under rewardspro.io, so receivers can tell our mail from
  forgeries; with SPF fixed too, it is what lets DMARC pass [I]. 2048 bits, because "Longer keys are more secure than
  shorter keys"; M3 covers a DNS host that limits each string to 255 characters.
- **The value isn't secret:** it is the public half of the key, "A public key that is stored in your domain's DNS TXT
  record for DKIM", and anyone can read it in DNS once it's added. The private half stays with Google.
- **Expect:** the page "might continue to display this message for up to 48 hours: You must update the DNS records for
  this domain. If you've correctly added your DKIM key at your domain provider, you can ignore this message." And
  "After adding a DKIM key, it can take up to 48 hours for DKIM authentication to start working." If Start
  authentication refuses straight after M3, try again later in the sitting or the next day [I].
- **If Generate gives an error:** Google says that after Gmail is turned on "you must wait 24–72 hours before you can
  get your DKIM key". Gmail on this domain is older than that [I], so note the message and tell an agent.
- **Outside check:** M3's second `dig` line.
- **Undo:** turn DKIM off on the same **Authenticate email** page (Google's "Turn off DKIM" help page; its steps
  weren't read [U]), then an agent deletes the record.
- **Sources:** https://knowledge.workspace.google.com/admin/security/set-up-dkim (support.google.com/a/answer/174124
  redirects there; last updated 2026-10-26; read 2026-11-10).

### A1. Add the Domain property (~3 min, Owner)

- **First, check the account:** before **+ Add property**, look at the account shown at the top right of Search
  Console. The TXT value Google gives is a "personal token" for that account, so it must be the company Workspace
  account (§0).
- **Do:** open the property selector, choose **+ Add property**, then the website property type **Domain**, and type
  `rewardspro.io`: no `https://`, no `www`, no path. Continue to the verification step, which uses the **Domain name
  provider** method.
- **Choice:** if the wizard lists Cloudflare with **Start verification**, don't use it. Choose **Any DNS provider**
  and the **TXT** record type, and copy the value it gives. *Why:* it's one record the agent adds and labels, and the
  provider route needs a sign-in to Cloudflare from inside Google's wizard ("You will be required to log in to your
  domain name provider"), which the manual record avoids. Google documents **Any DNS provider** for "a domain name
  provider that isn't yours"; choosing it while Cloudflare is listed is a workaround [I]. Whether Cloudflare is in the
  list is [U]. TXT rather than CNAME follows Google's own rule, "If no CNAME record is found, then follow the TXT
  record instructions": public DNS has no CNAME record at the apex [V, `dig`].
- **While the agent does A2 and you do B1–B3:** leave the dialog open, or select **Verify later** ("click Verify
  later to save your current state"). To come back, select the saved, unverified property in the property selector
  and select **Verify** (A3).
- **If it says verified straight away:** Google says that for "a Google Workspace account" verification "will happen
  automatically, if you are signed in with the same account"; whether that applies to rewardspro.io is [U]. Then
  note the method shown under **Settings** > **Ownership verification**, and add the DNS method on that page to get
  a TXT value ("To add an additional verification method, visit the Settings page for the property and click
  Ownership verification"). Carry on with A2, so the property doesn't rest on one method, and tell an agent which
  method was used.
- **If the company account can't open Search Console:** a Workspace administrator can turn Search Console off as one
  of the "additional Google services" (support.google.com/a/answer/181865 lists it); look there first [I].
- **Check:** the value starts `google-site-verification=`. It isn't secret (it's public once it's in DNS); give it to
  the agent for A2.
- **Outside check:** none yet; nothing changes in public DNS until A2.
- **Undo:** none needed. Google: "If you don't get it done all in one sitting, or have setup problems, it won't hurt
  your website."
- **Why a Domain property:** it is a "domain-level property that Includes all subdomains (m, www, and so on) and
  multiple protocols", so one property covers the apex, `www` and `docs.rewardspro.io` (C1 needs that), and it can
  be verified only by DNS ("DNS record verification only").
- **Sources:** https://support.google.com/webmasters/answer/34592,
  https://support.google.com/webmasters/answer/9008080 and https://support.google.com/webmasters/answer/7687615
  (read 2026-11-09; no page date shown).

### M3 and A2. The DNS records (~5 min, Agent, on the owner's go)

The agent works in Cloudflare, the rewardspro.io zone, **DNS** > **Records**, with the values the owner gives from
M2, A1 and (for a verified second owner) A4 step 1. "MX and TXT records in Cloudflare are always DNS-only", so there
is no proxy setting. TTLs stay as they are.

| Record | Today | After | Comment (Free plan: up to 100 characters) | Why |
|---|---|---|---|---|
| TXT `@`, the SPF record (M3) | `v=spf1 include:dc-aa8e722993._spfm.rewardspro.io ~all` | `v=spf1 include:_spf.google.com ~all`, by **editing** this record | `keep: SPF, Google Workspace only (RP-03)` | The include target doesn't exist, so SPF fails for every message (§1). Google: "If you use only Google Workspace to send email, copy this line of text: v=spf1 include:_spf.google.com ~all". Edit, don't add; Cloudflare: "Your domain must have exactly one SPF record. Multiple TXT records beginning with `v=spf1` cause SPF failures." `~all`, because "Google recommends you use ~all in your SPF record." |
| TXT `google._domainkey` (M3) | None | M2's value, `v=DKIM1; k=rsa; p=…` | `keep: Google Workspace DKIM, 2048-bit (RP-03)` | There is no DKIM key today. Name and value as Google gives them in M2 step 5 |
| TXT `@`, Search Console (A2) | None | A1's `google-site-verification=…` value, as a new record | `keep: Google Search Console Domain property verification (RP-04)` (64 characters) | See A2 below |
| TXT `@`, second owner (A4 step 2, if verified) | None | The second account's value, as another new record | `keep: Google Search Console verification, second owner (RP-04)` (62 characters) | See A4 |
| TXT `_dmarc` | `v=DMARC1; p=none` | Unchanged | — | One valid record; it tightens later, after M4 passes (below) |
| MX | Google's five hosts | Unchanged | — | Already right (§1) |
| CNAME `s1._domainkey`, `s2._domainkey` | SendGrid's DKIM (§1) | Unchanged | — | They sign the old app's SendGrid mail, if it still sends; they go with the old app (B5), not in this sitting |

- **SPF names Google only.** The one other sender found, SendGrid for the old app (§1), signs with its own DKIM
  records, and SendGrid's domain authentication sends from a return-path address of its own, so the apex SPF record
  doesn't carry it [I]. If another service ever sends as @rewardspro.io, its `include:` goes into this same record
  (Google's step 1, "Identify all your email senders").
- **The DKIM value is long.** "Some domain providers limit TXT record length." If Cloudflare refuses it as one string,
  split it into quoted strings of up to 255 characters, one after the other, as Google's troubleshooting page shows.
- **Outside check, run by the agent and reported to the owner:**
  - `dig +short TXT rewardspro.io @ed.ns.cloudflare.com` shows exactly one line starting `"v=spf1`, which reads
    `"v=spf1 include:_spf.google.com ~all"`, plus one `google-site-verification=` line (two with a verified second
    owner).
  - `dig +short TXT google._domainkey.rewardspro.io @ed.ns.cloudflare.com` shows the `v=DKIM1; k=rsa; p=` value.
    Joined up, the key matches the Admin console's character for character (Google: "If all key characters are
    included and in the correct order, the DKIM key can be in 2 parts.").
  - `dig +short TXT _dmarc.rewardspro.io @ed.ns.cloudflare.com` still shows `"v=DMARC1; p=none"`.
  - The same three at `@1.1.1.1` once caches catch up. Google: "It can take up to 48 hours for SPF authentication to
    start working."
- **Undo:** SPF: set the content back to the old value in the table (it is broken, so there's little reason to).
  DKIM: after DKIM is turned off in M2's page, delete the record. The Search Console records: see A2.
- **DMARC later, not in this sitting:** once M4 passes, and the old app's SendGrid mail is retired or seen passing,
  DMARC can move from `p=none` towards `p=quarantine`, with a
  reports address (`rua=`) if the owner wants daily reports. Google: "Over time, change the receiver policy to
  quarantine (or reject)." That is the owner's choice, for a later line in this sheet.
- **Sources (read 2026-11-10):** https://knowledge.workspace.google.com/admin/security/set-up-spf,
  https://knowledge.workspace.google.com/admin/security/set-up-dmarc and
  https://knowledge.workspace.google.com/admin/security/troubleshoot-dkim-issues (each last updated 2026-10-26);
  https://developers.cloudflare.com/dns/manage-dns-records/how-to/set-up-google-workspace/ (last updated
  2026-09-16); https://developers.cloudflare.com/dns/manage-dns-records/reference/record-attributes/ (last updated
  2026-08-14) for comments.

**A2, the Search Console record, in detail.**

- **Why "keep":** Google: "To stay verified, don't remove the DNS record from your provider, even after verification
  succeeds." Search Console "periodically checks if your verification token is still present and valid", and "If all
  verified owners lose access to a property, all users will lose access". So every later DNS clean-up leaves this
  record alone. A Cloudflare record comment is visible only to members of the account; the Free plan allows one
  comment of up to 100 characters per record (tags need a paid plan).
- **Leave alone:** the DMARC record. The SPF record changes only as M3 says. A2 adds a TXT record that doesn't start
  `v=spf1`, so it can't become a second SPF record.
- **Outside check:** the first `dig` line above lists the `google-site-verification=` line (the authoritative
  answer, usually within a minute).
- **Undo:** if the value is wrong, edit the record. Deleting it ends this owner's verification.
- **Sources:** Google, https://support.google.com/webmasters/answer/9008080 (read 2026-11-09).

### B1. AI Crawler and Agent access policies, Bot Preference Sync and Bot Fight Mode (~6 min, Owner)

- **Do:** **Security** > **Settings**, filter by **Bot traffic**, then select **AI Crawler and Agent access
  policies**.
  1. **First, write down what it shows now:** the action for Search, Agent and Training, and whether **Enable Bot
     Preference Sync** is on. Agents don't know the current state (§1). It also settles whether the defaults
     Cloudflare announced for new domains from 15 September 2026 (Training and Agent blocked on pages with ads)
     reached this zone [U] (§5). The note is also the undo.
  2. **Search:** *Allow (do not block)*.
  3. **Agent:** *Allow (do not block)*. Leave the Personal Agents inheriting it ("Cloudflare recommends **Allow (do
     not block)** for Personal Agents").
  4. **Training:** the owner's choice, from the table below. If you lean towards Block, first open AI Crawl Control
     (B2): for Googlebot, bingbot and the search crawlers, use **View on Cloudflare Radar** ("Learn more about each
     verified crawler on Cloudflare Radar") and check whether Training is among their behaviours. If it is, Block
     would stop them. Whether Radar's pages show behaviours couldn't be checked from outside [U].
  5. **Enable Bot Preference Sync:** leave it as you found it if Training is Allow; with every policy on Allow it adds
     nothing. Turn it on if you choose Disallow: Cloudflare's own steps are "For **Training**, select *Disallow*.",
     then "Turn on **Enable Bot Preference Sync**." With Block or Block on pages with ads, leave it as found; it only
     decides whether Cloudflare also writes lines into robots.txt [I].
  6. **Save.**
- **Undo:** set each policy and Bot Preference Sync back to what step 1 wrote down. robots.txt should go back to the
  67-byte file within seconds, as it changes within seconds the other way [I].
- **Search isn't only AI search:** under Cloudflare's 1 July 2026 taxonomy "there is no longer a meaningful
  distinction" between AI search and traditional search, and "A single bot can have one or more of the following
  behaviors". So Training = Block may reach crawlers that also index for search; whether ordinary search engines'
  crawlers are among them is [U] (step 4's Radar look is the way to find out).
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
| **Block** | "Block matching requests across the zone." | Blocks training crawlers **and** mixed-purpose crawlers, so some crawlers that feed search answers stop too. Which crawlers Cloudflare counts as mixed-purpose isn't listed on the pages read [U]; step 4 says where to look. With Bot Preference Sync on, robots.txt also gets Cloudflare's managed lines |
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
note what you set and tell an agent; change nothing else in this sitting. If Search Console later reports `Syntax not
understood` for those lines, that is expected and not a reason to undo B1: "Google Search Console may occasionally
report `Syntax not understood` for Content Signals and newer directives in the `robots.txt` standard. However, we have
observed no impact on crawling rates or SEO as a result of these reports."

- **Bot Fight Mode, on the same Settings page (Bot traffic):** note whether **Bot fight mode** is on. §1's outside
  evidence says it is probably off [I]; the page settles it. If it is on:
  - **Proposed default, the owner's call: turn it off.** rewardspro.io is static pages with no form or sign-in [V,
    git: `landing/public/` has no `<form>`], so there is little for it to protect, and it can challenge the crawlers
    this work wants. Perplexity: "If Bot Fight Mode is enabled, it can still challenge Perplexity bots that match this
    rule." Anthropic says its bots "will not attempt to bypass CAPTCHAs for the sites we crawl." No exemption fits:
    "You cannot bypass or skip Bot Fight Mode using WAF custom rules or Page Rules". Cloudflare's remedy: "If Bot
    Fight Mode challenges a request you want to allow, you can turn off Bot Fight Mode or upgrade to Super Bot Fight
    Mode for more granular control." (An IP Access rule also lets a request past it, since "it will not trigger if an
    IP Access rule matches the request first", but crawlers' addresses change [I].)
  - **If the owner would rather keep it on:** it costs nothing and challenges likely bots across the zone [I]. Then
    look at its effect: **Analytics**, the **Events** tab (Cloudflare's page of 2 October 2026; older pages say
    **Security** > **Analytics**; use whichever the dashboard shows). Set the duration to the longest it offers ("The
    default value is `Last 24 hours`"; on the Free plan the data goes back "Up to the last 31 days" with a "Max query
    window" of 30 days). "Any requests challenged by this product will be labeled **Bot Fight Mode** in the
    **Service** field." Look for search or agent crawlers among those events, for example Googlebot, bingbot,
    OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User or PerplexityBot. The Free plan shows "Sampled logs
    only", so an empty list at this site's traffic proves little; if any crawler we want appears, turn it off.
  - **Undo:** switch it back.
- **Why the owner, not an agent:** B1–B3 are dashboard settings, not DNS records, and the look takes two minutes.
- **Sources (read 2026-11-09, and 2026-11-10 for the last three Cloudflare pages):**
  - https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/ (last updated 2026-11-02)
  - https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ (last updated
    2026-11-02)
  - https://developers.cloudflare.com/bots/concepts/bot/verified-bots/ (last updated 2026-11-02)
  - https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ (last updated 2026-08-03)
  - https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/ (last updated 2026-08-25)
  - https://developers.cloudflare.com/waf/analytics/security-events/ (last updated 2026-10-02)
  - https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/ (last updated
    2026-09-29)
  - https://developers.openai.com/api/docs/bots (platform.openai.com/docs/bots redirects there; no page date
    found)
  - https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
    (shown as "Updated this week")
  - https://docs.perplexity.ai/docs/resources/perplexity-crawlers (docs.perplexity.ai/guides/bots redirects
    there; no page date found)

### B2. AI Crawl Control: look, and leave every crawler on Allow (~3 min, Owner)

- **Do:** open **AI Crawl Control** for the zone.
  - On the **Overview** tab, note the "Managed robots.txt status" and which operators appear.
  - On the tab that lists crawlers, check the **Action** column. One Cloudflare page calls this the **Crawlers** tab
    and another says "Go to the **Security** tab"; use whichever the dashboard shows. If a search or agent crawler
    shows **Block**, note it and set it to **Allow**, the B1 default. For a training-only crawler, the Training
    choice in B1 decides. A Block here is a real rule: "When you block a crawler in AI Crawl Control, the system
    creates or updates a WAF custom rule on your zone to enforce that block."
  - Note each crawler's **Category** if Training = Block is under consideration (B1 step 4). The column uses
    Cloudflare's older categories (its filter examples are "AI crawler, AI assistant, or archiver"), so it may not
    say which crawlers are mixed-purpose [I]; the Radar look in B1 step 4 is the better check.
- **Leave out 9 November 2026** when you read the counts and status codes. The §1 user-agent test sent ten bot
  user-agent strings from one home connection that day, and on the Free plan "AI Crawl Control identifies AI
  crawlers based on their user agent strings", so those requests may be counted as GPTBot, ClaudeBot and the rest
  [I]. The Overview filters include a date range.
- **Why:** it is the passive feed that costs nothing: "Available on all plans". It shows which AI crawlers fetch
  rewardspro.io, how often, and with what status codes. Referral numbers need a paid plan.
- **Check:** **Metrics** > "Status code distribution". A 403 for a search or agent crawler means something blocks
  it; note the crawler and tell an agent. Early on there may be little or no data.
- **Outside check:** none exists; the dashboard is the only view.
- **Undo:** set any changed action back to what you noted.
- **Sources (all read 2026-11-09):** https://developers.cloudflare.com/ai-crawl-control/ (last updated 2026-08-14);
  https://developers.cloudflare.com/ai-crawl-control/features/analyze-ai-traffic/ (last updated 2026-04-23);
  https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/ (last updated 2026-07-28).

### B3. Crawler Hints on (~1 min, Owner)

- **Do:** go to the zone's **Configuration** page for caching (the doc's dashboard link opens
  `…/caching/configuration`) and enable **Crawler Hints**.
- **Why:** "Crawler Hints supports IndexNow, which allows websites to notify search engines whenever content on
  their website content is created, updated, or deleted." Bing's AI Performance post says "IndexNow helps keep
  information fresh across search and AI experiences". Available on every plan. No separate IndexNow key file step
  appears in the pages read [I].
- **What to expect:** little, for now. "Crawler Hints uses cache-status `MISS` to determine when content has likely
  been updated", and `/` and `/sitemap.xml` answer `cf-cache-status: DYNAMIC` today (§1). A page served as DYNAMIC
  never shows a MISS, so Crawler Hints probably sends nothing when the home page changes [I]. Keep the step, since
  it is harmless and takes a minute, but rely on A6 and A7's **Request indexing** for page changes.
- **Check:** the toggle shows as on.
- **Outside check:** none exists [U].
- **Undo:** turn the toggle off.
- **Sources:** https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/ (last updated
  2026-08-14; read 2026-11-09);
  https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
  (2026-02-10; read 2026-11-09).

### A3. Verify the property (~1 min, or a day later, Owner)

- **Do:** back in Search Console (the open dialog, or the saved property in the property selector), select
  **Verify**.
- **If it fails:** Google: "it can take up to two or three days for your provider to start serving the record. …
  wait a day or two and try again." M3's first `dig` line shows whether Cloudflare serves it. Until it verifies, stop
  the Search Console steps: A4–A6 and C1 need a verified property. Come back to them when it verifies; B1–B3 and R1
  don't depend on it.
- **Check:** Search Console opens the property; **Settings** > **Ownership verification** lists the method used (the
  DNS TXT record); and **Settings** > **Users and permissions** lists the company account as Owner and Verified.
- **Outside check:** M3's first `dig` line is the only outside view.
- **Undo:** none needed; verifying changes nothing on the site.
- **Note:** "Data is collected for a property as soon as anyone adds it in Search Console, even before verification
  occurs. However, it takes a few days for data to start to accrue".
- **Source:** https://support.google.com/webmasters/answer/9008080 (read 2026-11-09).

### A4. Add the second owner (~5 min verified, ~2 min delegated, Owner; the record is the agent's)

- **Choice:** a second **verified** owner (proposed) or a **delegated** owner. Both have the same permissions.
  - Verified: "Someone who verified ownership of the property using a token". The second account runs its own
    verification and the agent adds its token as a second "keep" record. It keeps the property if the company
    account is lost.
  - Delegated: "Someone granted ownership status by a verified owner without the use of a verification token". No
    second record now. But "If all verified owners are removed, then all remaining users and delegated owners will
    lose access to the property after a grace period": to keep the property, the second account would then have to
    verify with its own TXT record.
- **Do, verified (proposed):**
  1. In the second browser profile, first check the account shown at the top right: it must be the second account,
     since the token belongs to whoever is signed in. Then open Search Console, add the same **Domain** property
     `rewardspro.io` (A1's clicks), and copy the `google-site-verification=…` value it gives. Google calls it a
     "personal token", so it differs from the company account's [I]. This can be done during A1, so that both
     records go in together.
  2. Agent: add it as a second TXT record at `@` (M3's table). Add, don't edit: "If you use the same verification
     method, just be sure that you don't overwrite the verification tokens of any other owners."
  3. Once the outside check below shows it, select **Verify** in the second profile.
- **Do, delegated:** in the company account, **Settings** > **Users and permissions** > **Add user**. Enter the
  second Google account, choose the permission **Owner**, and save. Google: "Users must have a valid Google
  Account." and "An email group cannot be added as a user."
- **Check:** **Settings** > **Users and permissions**. Google: "If the user is listed as both Owner and Verified, it
  means that they are a verified owner. If a user is listed as Owner without the word Verified, it means that they
  are a delegated owner." Verified: both accounts show Owner and Verified. Delegated: the second shows Owner only.
- **Outside check:** verified: `dig +short TXT rewardspro.io @ed.ns.cloudflare.com` lists two
  `google-site-verification=` lines. Delegated: none exists; the Users and permissions page is the only view.
- **Undo:** delegated: remove the user on the same page. Verified: an agent deletes the second record, which ends
  that account's verification, and the user is removed on the same page.
- **Record it:** after the sitting, an agent adds one dated line to §1 of this sheet with the roles only, for
  example *the company Workspace account and one second account, both verified owners*. GROWTH act 3 asks for both
  owners to be recorded in the kit; the addresses stay in the owner's private notes, because the repo is public.
- **Sources:** https://support.google.com/webmasters/answer/7687615 and
  https://support.google.com/webmasters/answer/9008080 (read 2026-11-09).

### A5. Search generative AI: confirm "Include" (~1 min, Owner)

- **Do:** **Settings** > **Search generative AI**. Check that it says "Include my site's links and content in Search
  generative AI features". Google: "This is the default control for all properties." Change nothing.
- **Why:** it covers AI Overviews, AI Mode and generative AI features in Google Discover. Excluding means "links to
  your site and your site's content won't appear in Search generative AI features", which works against being
  recommended accurately. It isn't the training switch: "This control doesn't affect AI training; to limit
  training of the models used to generate responses in Search generative AI features, use Google-Extended."
- **Check:** the page shows Include. "As of August 31, 2026, we've rolled out this control to all websites
  worldwide."
- **Outside check:** none exists; the settings page is the only view.
- **Undo:** nothing changes, so nothing to undo.
- **Source:** https://support.google.com/webmasters/answer/16908024 (read 2026-11-09).

### A6. URL Inspection of the home page (~3 min, Owner)

- **Do:** type `https://rewardspro.io/` into the inspection search bar at the top of any Search Console screen.
  1. The indexed result comes first. Note whether it says "URL is on Google", and the **Last crawl** date and
     **Page fetch**: they describe Google's last real crawl ("The last time this page was crawled by Google"). The
     page toggles between the two views "by clicking Google Index or Live Test".
  2. Select **Test live URL**. Page fetch should be "Successful". This is Google's inspection crawler reaching the
     page through Cloudflare today, not Googlebot: "The live URL test only confirms if Google-InspectionTool can
     access your page for indexing." The user-agent observation in §1 can't show this.
  3. If the Last crawl date is before 10 November 2026, select **Request indexing**: Google's copy may predate the
     stopgap page, which went live during 9 November (§1), so the request swaps the old page for today's. If in
     doubt, request it; it uses one of the daily requests. If it is 10 November or later, leave it; A7 requests
     indexing after RP-08.
- **Why:** it is the baseline before the state A page, and the one outside check that a Google crawler gets through
  Cloudflare.
- **Check:** the live test's result. "There is a daily limit of inspection requests for each property".
- **Outside check:** `curl -sI https://rewardspro.io/` answers 200. That shows the page is served, not that Google's
  crawler gets through; only the live test shows that.
- **Undo:** a request for indexing can't be taken back, and needs no undo.
- **Source:** https://support.google.com/webmasters/answer/9012289 (read 2026-11-09).

### C1. Removals request for the docs host (~3 min, or skipped, Owner)

- **Gate:** A3 verified; the request needs the Domain property, which covers the subdomain. The docs host's 410
  (R2) isn't in this sitting, so C1 comes first either way.
- **First, by hand:** search Google for `site:docs.rewardspro.io` yourself (Google's robots.txt closes its result
  pages to bots),
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
- **Caution:** never enter `https://rewardspro.io/` or `https://www.rewardspro.io/` as a prefix. Google: "To block an
  entire site, use a URL like this: https://example.com/", and "Blocking https://www.domain also blocks
  https://domain, since all www, non-www, http, and https versions will be blocked."
- **Why it lasts about six months, and what makes it permanent:** "A successful request lasts only about six
  months." To make it permanent, "make sure that your web server returns either a 404 (Not Found) or 410 (Gone) HTTP
  status code", or block access, or use `noindex`; "Do not use robots.txt as a blocking mechanism." Today's 307 to
  GitBook's app is none of those, and it isn't one of the codes Google calls unreachable [I]. R2 is to set the 410.
- **After R2's 410 is live:** Google: "If you blocked the page before removing your content permanently (step 1),
  unblock and then reblock the page. This clears the page from the index, if it was recrawled after blocking." That
  means **Cancel request** in the history table, then a new request with the same prefix. Do it once the first
  request shows as processed ("The request usually takes up to a day to process, and is not guaranteed to be
  accepted."); Google gives no other wait [I]. The new request may later show as expired, since the URL then answers
  410 [I].
- **Check:** the request's status in the history table. Outside: `curl -sI https://docs.rewardspro.io/` answers
  `307` today, and `410` once R2 is done.
- **Undo:** **Cancel request** in the history table.
- **Source:** https://support.google.com/webmasters/answer/9689846 (read 2026-11-09).

### R1. `www` to the apex, a 301 (~3 min, Agent on the owner's go, or the owner)

- **Do:** Cloudflare, the rewardspro.io zone: the Rules **Overview** page > **Create rule** > **Redirect Rule**. Name
  it `www to apex (RP-03)`. Then, as in Cloudflare's example "Redirect from WWW to root":
  - **When incoming requests match:** **Wildcard pattern**, **Request URL** `https://www.*`
  - **Target URL:** `https://${1}`
  - **Status code:** 301
  - **Preserve query string:** on
  - **Deploy.**
- **Why:** the home page's canonical link already names `https://rewardspro.io/`, and the 301 makes `www` agree, so
  search engines and AI answers meet one address [I]. The rule keeps the path and the query string.
- **Before it works:** "Single Redirects require that the incoming traffic for the hostname referenced in visitors'
  requests is proxied by Cloudflare." `www` resolves to Cloudflare's addresses today, so it is proxied [V, `dig`; I].
- **Outside check:** `curl -sI https://www.rewardspro.io/` answers `301` with `location: https://rewardspro.io/`, and
  `curl -sI https://rewardspro.io/` still answers 200. The rule matches only HTTPS ("only HTTPS requests from `www.`
  subdomains are redirected"); `http://www.` already answers 301 to `https://www.`, so it reaches the rule in a second
  hop [V, `curl`; I].
- **If `www` still answers 200:** Pages may be serving `www` before the rule applies [I]. Cloudflare's Pages page for
  this case uses a Bulk Redirect and a proxied `A` record for `www` instead. Leave it for a later sitting rather than
  improvising, and tell an agent.
- **Undo:** delete the rule (or switch it off) on the Rules **Overview** page.
- **Sources (read 2026-11-10):**
  https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/ and
  https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/ (both last updated
  2026-05-05); https://developers.cloudflare.com/pages/how-to/www-redirect/ (last updated 2026-04-21).

### M4. Within 48 hours: test mail out (~5 min, Owner)

- **Gate:** M2 step 6 done. "After adding a DKIM key, it can take up to 48 hours for DKIM authentication to start
  working." If DKIM fails on the first try, try again the next day.
- **Do:** from contact@ (or the mailbox that sends as it), send a message to a Gmail address of yours, not to contact@
  itself: "(You can't verify DKIM is on by sending yourself a test message.)" In Gmail, open it and, "next to Reply,
  click More Show original". In the header, "look for Authentication-Results": SPF, DKIM and DMARC should each say
  pass, with DKIM for `rewardspro.io`. Google: "the DKIM results should say something like DKIM=pass or DKIM=OK."
  Check that the message didn't land in spam.
- **If SPF fails:** an agent re-runs M3's first check. **If DKIM fails or is missing:** an agent compares the key in
  DNS with the Admin console's (M3's second check), then Google's "Troubleshoot DKIM issues" page.
- **Tell an agent:** pass or fail for SPF, DKIM and DMARC, and the date. Not the headers: they carry your personal
  address.
- **Outside check:** M3's `dig` lines.
- **Undo:** nothing changes, so nothing to undo.
- **Sources:** https://knowledge.workspace.google.com/admin/security/set-up-dkim and
  https://knowledge.workspace.google.com/admin/security/troubleshoot-dkim-issues (read 2026-11-10).

### A7. After RP-08 is live: the sitemap, then indexing (~5 min, Owner)

- **Gate:** RP-08's state A page, with its rewritten `sitemap.xml`, merged and deployed.
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
- **Undo:** in the sitemap's details page, the more options button, then "Click Remove sitemap." That only clears the
  report: "Google won't forget the sitemap or any URLs listed in it."
- **At S2:** when `/help/` ships (RP-09), inspect it, request indexing, and resubmit the sitemap ("If you make big
  changes to a sitemap, you might want to resubmit").
- **Sources:** https://support.google.com/webmasters/answer/7451001 and
  https://support.google.com/webmasters/answer/9012289 (both read 2026-11-09).

### D1. Optional: Bing Webmaster Tools (~10 min, Owner; the owner's word, default not now)

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
- **Undo:** remove the site in Bing Webmaster Tools, and revoke Bing's access in the Google account's settings for
  third-party access [I: neither menu name was read].
- **Not confirmed:** which account types Bing's sign-in accepts. The 2026-11-07 plan said it needs a Microsoft
  account; the pages read don't say. Bing's help page for adding a site
  (https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b) returned no article text to a plain read
  [U].
- **Sources (read 2026-11-09):**
  - https://blogs.bing.com/webmaster/2019/9/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools/ (2019-09-13,
    "Updated June, 2025")
  - https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
    (2026-02-10)
  - https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/
    (2026-06-16)

### Later, not in this sitting

- **R2. The docs host's 410.** `docs.rewardspro.io` still answers 307 to GitBook's app. On the Free plan, none of
  Cloudflare's no-code features returns a 410: Custom Errors show "No" for Free, and a custom response for a WAF
  block "is only available on Pro plans and above". A small Worker on a `docs.rewardspro.io/*` route can return 410
  within the Workers Free plan's 100,000 requests a day [I: not built or tested]. A Worker is a deploy, so it comes
  as its own PR, for the owner's word. If the zone turns out to be on Pro, a WAF custom rule with a 410 response
  needs no code [I]. Once `/help/` is live (RP-09), the 410 becomes the planned 301. C1's follow-up waits for it.
  Sources (read 2026-11-10): https://developers.cloudflare.com/rules/custom-errors/ (last updated 2026-11-03),
  https://developers.cloudflare.com/waf/custom-rules/create-dashboard/ (last updated 2026-10-08),
  https://developers.cloudflare.com/workers/platform/limits/ (last updated 2026-10-29).
- **R3. Bluesky's `_atproto` record:** only if the owner reserves names (`social/SETUP.md` Phase 4). An agent then
  adds the TXT record under the same standing yes. The records that had to go first were deleted on 2026-11-09.
- **Done already:** `rewardspro-marketing` is private and `rewardspro-docs` is archived (§1). RP-03's README text
  for `rewardspro-docs` is dropped: an archived repo is read-only, and its archived state says enough [I].

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
| 6 | Cloudflare, **Analytics**, the **Events** tab (older pages: **Security** > **Analytics**), duration at its longest, Service "Bot Fight Mode" (only if it was kept on in B1) | Any search or agent crawler among the challenged requests. The Free plan shows sampled logs only | If one appears, turn Bot Fight Mode off (B1's default, the owner's call) |
| 7 | Bing Webmaster Tools, **AI Performance** (only if D1 was done) | Total citations, cited pages | Copilot and Bing AI answers citing rewardspro.io |

If an AI answer gets RewardsPro wrong, the fix is on our own pages, since those are what crawlers read (GROWTH §6.2).

**Sources for this section (read 2026-11-09):** https://support.google.com/webmasters/answer/7576553,
https://support.google.com/webmasters/answer/16984139, https://support.google.com/webmasters/answer/7440203,
https://developers.google.com/search/docs/appearance/ai-features (last updated 2025-12-10), and the Cloudflare and
Bing pages cited in B1, B2 and D1.

---

## 4. Not confirmed

- Whether contact@ is a user, alias or group in the Workspace, and the Admin console clicks to add it (M1).
- Whether the old app still sends through SendGrid as `rewards@rewardspro.io`, and which return path it uses (§1,
  M3). No other sender is known.
- The steps on Google's "Turn off DKIM" page (M2's undo).
- Whether the Search Console wizard lists Cloudflare as a provider, and whether the company Workspace account is
  verified automatically (A1).
- The current AI crawler policies, Bot Preference Sync, Crawler Hints and per-crawler actions on the zone, and
  whether the 15 September defaults reached it (B1–B3, §5). Only the dashboard shows them.
- Bot Fight Mode: probably off, from the missing challenge script (§1) [I]; the dashboard settles it.
- Which crawlers Cloudflare counts as mixed-purpose, whether ordinary search engines' crawlers are among them, and
  whether Cloudflare Radar's crawler pages show it (B1 step 4).
- Which crawlers Cloudflare's managed robots.txt lines name for each Training choice (B1).
- Whether Crawler Hints ever fires for this site while its pages are served DYNAMIC (B3) [I: probably not].
- Whether a zone Redirect Rule applies to `www` before Pages serves it (R1).
- The sidebar label of the Generative AI performance report (§3).
- Which account types Bing Webmaster Tools accepts, the text of Bing's add-a-site help page, and the menu names for
  D1's undo.
- The zone's Cloudflare plan. It affects the comment length (M3, A2), AI Crawl Control's detection and referrals
  (B2), and R2's route.

---

## 5. For reviewers: where today's docs differ from the 2026-11-07 plans, and how this was checked

The owner doesn't need this section in the sitting. The plans are `…/wf6/GROWTH.md` §4.2 act 3 and §6.2–§6.3,
`…/wf6/seo.md` §3.4, `…/wf6/ai-rec.md` §3, §5.7 and §6 step 3, and `…/wf10/status.md` §1.B6–B8, C1–C5, C11 and D3,
as quoted in #163 and #164. Where they differ from today's docs, this sheet follows the docs.

| Topic | The plans | Today's docs (read 2026-11-09 or 2026-11-10) | Here |
|---|---|---|---|
| Mail | "one SPF record, a 2048-bit Google DKIM key, one DMARC record. DKIM can take up to 48 h to start working." | Google and Cloudflare agree: `v=spf1 include:_spf.google.com ~all` for Workspace only; DKIM 2048-bit with the selector `google`; DMARC starts at `p=none`. DMARC is already one record, and Google now asks for 48 hours of SPF and DKIM before DMARC tightens | M2, M3 |
| Policy actions | Allow, Block, Disallow | Adds "Block on pages with ads", and per-agent settings for the top Personal Agents | B1 |
| Search behaviour | AI search | Covers traditional search too, and one bot can have several behaviours (verified-bots page) | B1 |
| Defaults | Not covered | A changelog post of 2026-07-01 (https://developers.cloudflare.com/changelog/post/2026-07-01-ai-traffic-options/) says new domains onboarding from 15 September 2026 get Training and Agent blocked on pages with ads, and "All customers can opt out of the new defaults at any time before September 15." The policy page of 2026-11-02 says new domains default to Allow. Whether the September defaults reached existing zones such as rewardspro.io is [U] | B1 step 1 settles it |
| Bot Preference Sync | Named with Disallow | Cloudflare's Disallow steps turn it on; with it on, Block or Block on pages with ads also prepends managed content | B1 step 5 and the robots.txt table |
| Bot Fight Mode | Not covered | Can't be bypassed by WAF custom rules; can still challenge Perplexity's bots; Cloudflare's remedy is to turn it off or upgrade | B1's default (off); §3 row 6 |
| Security Events | Not covered | **Analytics** > **Events** since the 2026-10-02 page (older pages: **Security** > **Analytics**); the Free plan shows sampled logs, 24 hours by default | B1; §3 row 6 |
| AI Crawl Control | A passive feed, "Available on all plans" | The same, plus a per-crawler Allow or Block (backed by a WAF custom rule), a Category column, Free-plan detection by user agent only, and referrals on paid plans only | B2 |
| Crawler Hints | A dashboard toggle that sends IndexNow [I] | Confirmed: the caching Configuration page, every plan, triggered by cache `MISS`, which this site's DYNAMIC pages don't produce | B3 |
| "Search generative AI" and its report | Settings > Search generative AI on "Include"; a Generative AI performance report | Both exist; rolled out worldwide on 2026-08-31 | A5; §3 row 2 |
| Performance search type | "Web" | Split into "Web: text-based" and "Web: multimodal" | §3 row 1 |
| Removals order | The plans disagree: GROWTH act 3 lists the request after the 410 but calls it "the quick first step"; status.md §1.C3 says "a Search Console Removal first" | "the first step"; a request on an unreachable URL "will expire"; old 404 pages need no request; a URL blocked before the permanent fix is unblocked and reblocked | C1: request before the 410, only if Google lists pages; skipped if the 410 is already live |
| Docs host's 410 | "a proxied `AAAA 100::` plus a free Cloudflare rule or Worker that returns **410 Gone**" [I: which free feature fits is unchecked] | On Free, neither Custom Errors nor a WAF custom response; a Worker can (a deploy) | R2, later |
| `www` → apex | A Single Redirect | Cloudflare's Redirect Rule example fits; its Pages page uses a Bulk Redirect for Pages domains | R1 |
| Second owner | "A second owner", type not set | Verified or delegated, same permissions; delegated owners lose access after a grace period if no verified owner remains | A4 proposes verified |
| Workspace accounts | Not covered | Verification can be automatic for "a Google Workspace account" | A1 branch |
| OpenAI's quote | "…will not be shown in ChatGPT search answers" | The sentence continues ", though can still appear as navigational links."; the page moved to developers.openai.com | B1 |
| Anthropic | Claude-SearchBot and Claude-User for search; ClaudeBot for training | The same, plus: from 2026-10-30 Anthropic honours a "no AI training" signal based on the IETF aipref draft. Whether Cloudflare's `Content-signal` line is that signal isn't stated [U] | Matters only if Training is Disallow |
| Bing | Import needs "a Microsoft account and an OAuth grant" | Sign in or create a Webmaster Tools account, then sign in to Search Console and click Allow; account types not stated [U]. AI Performance gained Intents, Topics, Citation Share and Compare on 2026-06-16 | D1 |
| Public DNS | Two other apex TXT records and two DMARC records | SPF only at the apex; one DMARC record | §1; M3 |

**How it was checked.** Each vendor page cited here was read with `curl` and a generic browser user agent, one page
at a time, robots.txt first on each host (except one Workspace help page, fetched just before that host's
robots.txt, which allows it), with no account and no personal detail in any request, and saved. The
RP-04 pages were read on 2026-11-09 and re-read by a second session on 2026-11-10; the mail, redirect and 410 pages
were read on 2026-11-10 (Google Workspace's help for admins has moved to knowledge.workspace.google.com). Every
quotation was checked by script against the saved copy of its page. Public DNS was read with `dig` at 1.1.1.1,
8.8.8.8 and `ed.ns.cloudflare.com`; rewardspro.io with a handful of GETs and HEADs and a generic user agent, its `/`
and `/robots.txt` hashed against main. The app's contact address and the absence of mail-sending code were read from
git on main. Bing's add-a-site help page needs a script to render, and neither `curl` nor a fetch tool got its text.
Nothing was signed in to or changed; no Google or Bing result page was loaded; no apps.shopify.com or
help.shopify.com page was opened. The bot user-agent requests in §1 were made by another session and are reported,
not repeated.
