# Cloudflare — the zone, plainly

The posture of `cambridgetcg.com` on Cloudflare, what every record is for,
and the standing rule: **agents are welcome; nothing in this zone may
silently block them.** Audited empirically 2026-06-10 (70+ probe requests
across five user-agents incl. GPTBot/ClaudeBot — zero blocks, zero
challenges); re-verify after any security-feature change.

## The shape

```
cambridgetcg.com, www  ──(proxied: Cloudflare → Vercel)──  storefront
admin.cambridgetcg.com ──(DNS-only → Vercel)────────────  admin realm
prices.cambridgetcg.com──(proxied → Cloudflare Pages)───  price explorer
mail.cambridgetcg.com  ──(MX 10 → SES feedback-smtp)────  SES custom MAIL FROM (no A/AAAA; old mail box retired 2026-10-13)
apex MX                ──(Google Workspace)─────────────  human inboxes (until/if ever moved)
```

Cloudflare IS in the web serving path (apex + www are orange-cloud), so
zone settings genuinely apply to storefront traffic. `admin.` bypasses
Cloudflare — a deliberate-or-not inconsistency; revisit if WAF coverage
of admin ever matters.

## Agent openness — the standing contract

- Verified empirically: `/`, `robots.txt`, `llms.txt`, `/api/v1/*`,
  `/api/mcp`, `sitemap.xml` all return 200 to curl, browsers, GPTBot,
  Claude-User, ClaudeBot. No cf-mitigated, no challenges.
- Zone uses `security_level: medium`, free managed WAF ruleset only, no
  custom block rules.
- **The one toggle that could break this overnight is Security → Bots
  ("Bot Fight Mode" / "Block AI bots")** — unreadable with the current
  token (403) but empirically OFF. Never enable it. If a bot problem
  ever appears, prefer a targeted WAF rule that *skips* verified bots.
- robots.txt named AI-crawler groups are the welcome mat and repeat the
  `*` boundaries (RFC 9309: most-specific group wins — without repeats,
  named bots would bypass the account/auth disallows). Source:
  `apps/storefront/src/app/robots.txt/route.ts` (the shadowed
  `public/robots.txt`, which contradicted it, was deleted 2026-06-10).
- Cold-tail fix (agents with short timeouts saw 5–11s): `sitemap.ts`
  regenerates hourly (`revalidate = 3600`), `/api/v1/status` every 30s
  (`revalidate = 30`, exactly its own declared FRESHNESS budget).

## Fixed 2026-06-10 (live changes, via API)

> 2026-10-13: the self-hosted mail box these rows mention is gone; see [Retired mail box](#retired-mail-box-dns-removal-2026-10-13) for what replaces them.

| What | Was | Now |
|---|---|---|
| apex SPF | PERMERROR (dead Shopify `_spfm` include) + Google never authorized | `v=spf1 include:_spf.google.com include:amazonses.com a:mail.cambridgetcg.com ~all` |
| `mail.` SPF | two `v=spf1` records = PERMERROR (SES MAIL FROM vs new box) | merged: `v=spf1 a include:amazonses.com ~all` |
| `mail.` MX | two prio-10 MX (SES feedback-smtp + the box) → coin-flip bounce routing | SES kept at 10, box demoted to 20 — **flip at cutover** |
| `tradein.` | dangling CNAME → deleted Pages project (public error 1014) | removed |
| `tradein-api.` | dead `100::` placeholder, public 522 | removed |
| `account.` | orphaned Shopify CNAME (406; dangling-takeover risk) | removed |
| min TLS | 1.0 | 1.2 |
| always_use_https | off | on |

## Owner actions still open

1. **Google Workspace DKIM** — `google._domainkey` is NXDOMAIN. With apex
   SPF now fixed, Workspace mail passes SPF again, but DKIM should exist
   too (Admin console → Gmail → Authenticate email → generate; then the
   TXT goes in via API).
2. **SES custom MAIL FROM** rides `mail.cambridgetcg.com` (MX 10
   `feedback-smtp.us-east-1.amazonses.com`). Since the self-hosted mail
   box was retired, the name is no longer shared, so it can stay where it
   is; keep that MX and the `mail.` SPF while SES uses them.
3. **Token hygiene** — keychain `cloudflare-dns-token` (expires
   2026-08-11) actually carries worker/r2/member/org edit scopes. Roll it
   for a true DNS-only token when convenient.
4. **Confirm Bot toggles OFF** in dashboard (Security → Bots) — one look,
   or mint a token with Bot Management:Read for API confirmation.

## Retired mail box: DNS removal (2026-10-13)

The self-hosted Stalwart mail box on Hetzner that `mail.cambridgetcg.com`
pointed at was released around September 2026, and its IP address now
belongs to someone else. The mail cutover this section used to stage
will not happen: human mail stays on Google Workspace and transactional
mail stays on AWS SES. Yu is applying these changes in the Cloudflare
dashboard:

| Record | Change |
|---|---|
| A + AAAA for `mail`, `autoconfig`, `autodiscover`, `mta-sts`, `ua-auto-config` | delete |
| `mail.` MX 20 `mail.cambridgetcg.com` (the box) | delete; keep MX 10 `feedback-smtp.us-east-1.amazonses.com` (SES MAIL FROM) |
| `mail.` SPF TXT | `v=spf1 include:amazonses.com ~all` |
| apex SPF TXT | `v=spf1 include:_spf.google.com include:amazonses.com ~all` |
| DKIM TXT `v1-ed25519-20260610._domainkey`, `v1-rsa-20260610._domainkey` (Stalwart keys) | delete |

The earlier steps here (flip the `mail.` MX to the box, publish MTA-STS
for a policy that named only the box) pointed at the released box; do
not follow them from git history. Keep the three SES DKIM CNAMEs and
`include:amazonses.com` in both SPFs while SES carries transactional
mail.

## DNSSEC

Off. Nice-to-have once the mail-box records above are gone (needs a DS
record at the registrar).
