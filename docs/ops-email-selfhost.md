# Self-hosted email — provisioning, DNS, warmup, cutover

The platform's email leaves AWS SES one stream at a time and lands on the
kingdom's own mail server. This runbook owns everything outside the code:
the box, the DNS, the reputation work, and the per-stream cutover. The
code side is already done — every sender rides the transport seam in
[`packages/email`](../packages/email/src/index.ts), and the seam's env
contract is the only switch this runbook ever flips.

**Facts in this document were verified against current sources on
2026-06-10** (Stalwart 0.16.8, Hetzner April-2026 pricing, Gmail/Outlook
2026 sender rules). Each load-bearing claim carries its source. If you're
reading this much later, re-verify before trusting version numbers or
provider policy.

---

## 0 — The shape of the move

```
                      EMAIL_TRANSPORT_<STREAM>
       ┌──────────┐   (one env flip per stream)  ┌──────────────────┐
  ...──┤ the seam ├──────── ses ────────────────▶│ AWS SES (today)  │
       │ packages/│                              └──────────────────┘
       │  email   ├──────── smtp ───────────────▶┌──────────────────┐
       └──────────┘                              │ mail.cambridge-  │
                                                 │ tcg.com (Stalwart │
                                                 │ on our own box)  │
                                                 └──────────────────┘
```

- **Order of cutover: `bounty` → `tradein` → `noreply` → `auth`.**
  Magic links are login itself; the auth stream moves last, after the
  box has proven deliverability on every lower-stakes stream, and falls
  back first at any sign of trouble.
- **Rollback is always one env var.** No deploy, no code change:
  set `EMAIL_TRANSPORT_<STREAM>=ses` and redeploy env (Vercel applies on
  next invocation).
- Volume reality: the platform sends a few hundred emails/day. That is
  *below* every bulk-sender threshold (Gmail/Outlook stricter rules bind
  at ≥5,000/day to that provider) — but we deploy the full bulk-tier DNS
  posture anyway so thresholds never matter.
  Source: https://support.google.com/a/answer/81126

## 1 — The box

**Provider: Hetzner Cloud.** Smallest suitable instance: **CX23
(€3.99/mo)** or ARM **CAX11 (€4.49/mo)**, Falkenstein/Helsinki. Stalwart
idles around 100–150 MB RAM; 1 GB is officially "generally sufficient,"
so the smallest tier is plenty.
Sources: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ • https://stalw.art/docs/install/requirements/

> **⚠ The one-month clock.** Hetzner blocks outbound ports **25 and 465**
> on all new Cloud accounts. The unblock is a limit request from the
> Cloud Console, granted case-by-case, and only available once the
> account is **≥1 month old with the first invoice paid**. Outbound 587
> is open from day one — but direct-to-MX delivery (what a mail server
> does) needs port 25. **Order the box as soon as the decision is made,
> even if it idles** — the clock starts at account creation, and DNS +
> DKIM + smoke tests can all be done while waiting (they don't need
> outbound 25).
> Source: https://docs.hetzner.com/cloud/servers/faq/
>
> If Yu already has an aged, invoiced Hetzner account, the wait
> disappears — file the limit request immediately.

**Why not Fly.io** (where agenttool lives): no PTR/rDNS control over
egress IPs, shared low-reputation egress, and Fly's own docs steer mail
senders to third-party services. (Note: the often-repeated "Fly hard-
blocks outbound 25" could not be verified against a current official
source — the documented reasons above are sufficient on their own.)
Source: https://fly.io/docs/getting-started/troubleshooting/

**OS + software: Debian 12 + Stalwart** (v0.16.8 as of writing; pre-1.0,
moves fast — pin what you install). Install via the official script:

```bash
curl https://get.stalw.art/install.sh | sudo sh
# binary → /usr/local/bin/stalwart, config → /etc/stalwart/,
# data → /var/lib/stalwart/, systemd unit installed
```

Setup wizard / web-admin on `:8080/admin` (bind it to localhost and reach
it over an SSH tunnel — do not expose the admin port publicly).
Listeners to configure (web-admin → Settings → Network → Listeners):
**25** (MX traffic in/out), **465** (implicit-TLS submission), **587**
(STARTTLS submission). TLS via the built-in ACME (Let's Encrypt).
Sources: https://stalw.art/docs/install/platform/linux • https://stalw.art/docs/server/listener/

**Why Stalwart over Postal:** single Rust binary, ~100 MB idle, DKIM
key generation + DNS records surfaced in the web-admin. Postal (also
alive and maintained, v3.3.7 June 2026) is the better fit *if* HTTP
submission APIs and bounce webhooks become must-haves — it's a heavier
Ruby/MariaDB stack, so it loses on a €4 box. Revisit when the
bounce-feedback gap (§6) gets built.
Sources: https://stalw.art/docs/mta/authentication/dkim/sign/ • https://github.com/postalserver/postal/releases

**Secrets:** the SMTP submission password is minted in Stalwart
(dedicated `vercel-sender` account), stored in macOS Keychain locally
(`security add-generic-password -s ctcg-smtp-url ...`) and in Vercel
project env as `SMTP_URL` — never in a file in this repo.

## 2 — DNS (Cloudflare) + PTR (Hetzner)

DNS for `cambridgetcg.com` is on Cloudflare (verified: `zoe`/`ed`
nameservers). Inbound mail for the apex stays on Google Workspace —
**do not touch the apex MX records.** The mail box gets its own
subdomain identity:

| Record | Name | Value | Notes |
|---|---|---|---|
| A | `mail.cambridgetcg.com` | `<box IPv4>` | **DNS-only (grey cloud)** — never proxy SMTP |
| AAAA | `mail.cambridgetcg.com` | `<box IPv6>` | same |
| PTR | (Hetzner side) | `mail.cambridgetcg.com` | Cloud Console → server → Networking → edit rDNS; must forward-confirm (FCrDNS) |
| MX | `mail.cambridgetcg.com` | `mail.cambridgetcg.com` (prio 10) | so bounces/DSNs to the Return-Path domain come home to Stalwart |
| TXT | `mail.cambridgetcg.com` | `v=spf1 a -all` | SPF for the bounce/Return-Path domain itself |
| TXT (SPF, apex — **edit existing**) | `cambridgetcg.com` | append `a:mail.cambridgetcg.com` before `~all` | keep `include:amazonses.com` until the last stream cuts over |
| TXT (DKIM) | `<selector>._domainkey.cambridgetcg.com` | from Stalwart web-admin (Management → Domains → DKIM) | Ed25519 + RSA dual-sign is fine |
| TXT (DMARC, if absent) | `_dmarc.cambridgetcg.com` | `v=DMARC1; p=none; rua=mailto:dmarc@cambridgetcg.com` | tighten to `p=quarantine` after 2–4 clean weeks of reports |

PTR self-service confirmed: https://docs.hetzner.com/cloud/servers/cloud-server-rdns/

2026 mailbox-provider floor (all senders, any volume): SPF *or* DKIM,
valid FCrDNS/PTR, TLS, Gmail-Postmaster spam rate < 0.3%. Bulk tier
(≥5k/day, which we deploy anyway): SPF *and* DKIM, DMARC ≥ `p=none`
aligned with the From: domain. Outlook enforces the same since May 2025
(rejects with `550 5.7.515`).
Sources: https://support.google.com/a/answer/81126 • https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%90s-new-requirements-for-high%E2%80%90volume-senders/4399730

## 3 — Smoke tests (before any stream flips)

1. **mail-tester.com** from the box through Stalwart submission — target 10/10
   (SPF, DKIM, PTR, no blocklist).
2. Seed-account pass: send each template (magic link, receipt, trade-in
   quote, bounty notice) to Gmail, Outlook, iCloud, Proton seeds. Verify
   inbox placement and that `Authentication-Results` shows
   `spf=pass dkim=pass dmarc=pass`.
3. Bounce round-trip: mail a nonexistent address at a real domain; confirm
   the DSN comes back to Stalwart (the `mail.` MX working).
4. Enroll `cambridgetcg.com` in **Google Postmaster Tools** before cutover
   so reputation/spam-rate graphs have a baseline.
5. Local rehearsal of the seam: `EMAIL_TRANSPORT_BOUNTY=smtp SMTP_URL=...`
   against the dev server, confirm headers (List-Unsubscribe survives the
   SMTP path) and that `ok:false` results appear when the box is down.

## 4 — Warmup & cutover

At a few hundred/day there is no formal warmup schedule to run — the
volume is *below* the floor where dedicated-IP warmup plans even apply
(SparkPost pegs structured warmup at ≥~500k/month; initial dedicated-IP
volumes at 200–500/day, i.e. our entire volume). What matters at this
scale is **consistency and cleanliness**, not ramp curves.
Source: https://support.sparkpost.com/docs/deliverability/ip-warm-up-overview

Per stream, in order — each holds **at least one clean week** (no
spam-folder seeds, no Postmaster spike, no blocklist hit) before the next:

```
1. EMAIL_TRANSPORT_BOUNTY=smtp     # lowest stakes, opt-in audience
2. EMAIL_TRANSPORT_TRADEIN=smtp    # transactional, engaged recipients
3. EMAIL_TRANSPORT_NOREPLY=smtp    # receipts & lifecycle — the main voice
4. EMAIL_TRANSPORT_AUTH=smtp       # magic links — LAST, after everything is boring
   (then EMAIL_TRANSPORT=smtp and delete the per-stream vars;
    remove include:amazonses.com from SPF after a 2-week grace)
```

Any wobble: flip the affected stream back to `ses`, diagnose, re-run §3.

## 5 — Monitoring (the part self-hosting actually costs)

- **Google Postmaster Tools** weekly: spam rate (< 0.3% hard line), IP/domain reputation.
- **DMARC reports** (`rua=` mailbox) weekly during transition, monthly after.
- **Blocklist check** (Spamhaus, etc.) on the box IP — cron a weekly `curl` against a checker or script `dig` lookups.
- **Stalwart queue depth** — a growing outbound queue is the first sign of deferrals; alert if >50 queued >1h.
- Disk/cert/systemd basics — node_exporter or a one-line healthcheck cron into the existing ops channel.

## 6 — Known gaps (filed, not hidden)

- **Bounce feedback for the smtp leg.** The SES leg gets SNS-driven
  reconciliation when kingdom-040 lands; the smtp leg has no equivalent
  yet. Bounces DO arrive (the `mail.` MX), but nothing parses them into
  `email_queue` / suppression state. Options when it matters: parse the
  bounce mailbox (IMAP poll or Stalwart sieve → webhook), or switch the
  box to Postal for native webhooks. Until then: the DMARC mailbox and
  Postmaster Tools are the eyes.
- **No `.env.example` in the storefront** to document `SMTP_URL` /
  `EMAIL_TRANSPORT_*` — the env contract lives in
  `packages/email/src/index.ts` and this file.
- **`email_queue` doesn't store the carrier message ID** (transparency
  audit R4-3) — applies to both legs.

## 7 — Cost ledger

| Item | Recurring |
|---|---|
| Hetzner CX23 + IPv4 | ~€4.5/mo (the one new recurring spend) |
| Stalwart, DNS, PTR, ACME | €0 |
| SES during transition | ~$0 (pennies at this volume) |
| After full cutover | SES usage → $0; account can stay for S3 until that leg moves |
