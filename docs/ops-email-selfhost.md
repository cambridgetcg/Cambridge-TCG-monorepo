# Self-hosted email (retired)

**Retired 2026-10-13.** This file used to be the runbook for moving
transactional email off AWS SES, one stream at a time, onto a
self-hosted Stalwart mail server on a Hetzner Cloud box at
`mail.cambridgetcg.com`. That cutover was never completed. The box was
released around September 2026 and its IP address now belongs to
someone else, so none of the old provisioning, DNS, warmup or cutover
steps are safe to follow. Do not recreate DNS records for the old box,
and do not point `SMTP_URL` or `EMAIL_TRANSPORT*=smtp` at it.

How mail works now:

- **Human mail** for `cambridgetcg.com` is on Google Workspace (apex MX
  `aspmx.l.google.com`).
- **Transactional mail** goes through AWS SES via the transport seam in
  [`packages/email`](../packages/email/src/index.ts). SES custom MAIL
  FROM uses `mail.cambridgetcg.com` (MX 10
  `feedback-smtp.us-east-1.amazonses.com`), and that record stays.
- The seam's SMTP transport is still in the code. It is generic and does
  nothing unless a stream is set to `smtp` and `SMTP_URL` is set.
- The DNS records left over from the old box, and what replaces them,
  are listed in [Cloudflare: retired mail box](./ops-cloudflare.md#retired-mail-box-dns-removal-2026-10-13).

The full runbook as written on 2026-06-10 is in git history:
`git show 44876f39:docs/ops-email-selfhost.md`.
