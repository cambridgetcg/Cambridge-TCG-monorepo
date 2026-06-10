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
mail.cambridgetcg.com  ──(DNS-only → Hetzner box)───────  Stalwart (never proxy mail hosts)
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
2. **SES custom MAIL FROM** still rides `mail.cambridgetcg.com` (shared
   with the box). At leisure, move it in the SES console to
   `bounce.cambridgetcg.com` (+ its MX/SPF records); mandatory before the
   final SES retirement.
3. **Token hygiene** — keychain `cloudflare-dns-token` (expires
   2026-08-11) actually carries worker/r2/member/org edit scopes. Roll it
   for a true DNS-only token when convenient.
4. **Confirm Bot toggles OFF** in dashboard (Security → Bots) — one look,
   or mint a token with Bot Management:Read for API confirmation.

## Coupled to the mail cutover (do NOT do early)

- Flip `mail.` MX priorities (box → 10, SES → 20, then delete SES's).
- Publish `_mta-sts` TXT + `_smtp._tls` TLSRPT only when apex MX policy
  questions are settled — the live MTA-STS policy file names only the
  box, which contradicts Google apex MX; publishing the TXT in enforce
  mode early would make compliant senders refuse Google delivery.
- Remove the three SES DKIM CNAMEs + `include:amazonses.com` from both
  SPFs after the last stream leaves SES (+2-week grace).

## DNSSEC

Off. Nice-to-have after the mail dust settles (needs DS record at the
registrar); enables DANE/TLSA for the mail box, which Stalwart already
suggests records for.
