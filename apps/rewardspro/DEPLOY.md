# RewardsPro Deployment Guide

## Marketing site (`rewardspro.io`)

The public marketing site is a separate Cloudflare Pages project named
`rewardspro-landing`. Its source now lives at `landing/public`; it is not built
from the Remix/Vercel application.

Preview locally from `apps/rewardspro/landing`:

```bash
wrangler pages dev public
```

Deploy only after an explicit production release decision:

```bash
wrangler pages deploy public \
  --project-name rewardspro-landing \
  --branch main \
  --skip-caching
```

`--skip-caching` is deliberate. A cached direct upload produced an empty
deployment on 23 July 2026; forcing the three public assets plus `_headers`
produced a byte-identical, healthy deployment.

Verify the immutable `*.pages.dev` URL before checking the custom domain. Then
verify `https://rewardspro.io`, `/privacy-policy`, `robots.txt`, `sitemap.xml`,
external links, responsive layout, and the visible integration status labels.
Cloudflare Pages retains earlier deployments for rollback.

After a deploy that changes the look, also check the font and both schemes:

```sh
curl -sI https://rewardspro.io/assets/fonts/inter-latin-var.woff2 | grep -i -E '^(content-type|cache-control)'
```

It should show `content-type: font/woff2` and `cache-control: public, max-age=31536000, immutable`. Then look at
the home page and `/help/` with the system set to light and to dark.

### After a deploy that changes a page

The site has an IndexNow key. The file
`landing/public/24ab8c1a3858c2261d26321fedb5d88a.txt` holds only the key, with
no newline, and is served at
`https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt`. IndexNow passes
a notice to the search engines that take part in it. Google is not one of the
engines its FAQ lists.

The chief of staff's session sends the notice after the deploy, once, and
never before the owner's word to merge. First check that the key file answers
200 and prints only the key:

```bash
curl -sS -w '\n%{http_code} %{content_type}\n' https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt
```

It should print the key, then `200 text/plain; charset=utf-8`.

Then send one POST. `urlList` holds the sitemap's pages that the deploy
changed; drop any page it didn't change. With all four:

```bash
curl -sS -i -X POST https://api.indexnow.org/indexnow \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{
    "host": "rewardspro.io",
    "key": "24ab8c1a3858c2261d26321fedb5d88a",
    "keyLocation": "https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt",
    "urlList": [
      "https://rewardspro.io/",
      "https://rewardspro.io/help/",
      "https://rewardspro.io/privacy-policy/",
      "https://rewardspro.io/subprocessors/"
    ]
  }'
```

The status codes IndexNow lists:

| Code | Meaning |
|---|---|
| 200 | OK: "URL submitted successfully" |
| 202 | Accepted: "URL received. IndexNow key validation pending." |
| 400 | Bad request: "Invalid format" |
| 403 | Forbidden: the key is not valid, for example the file is missing, doesn't hold the key, or a firewall or bot rule blocks it |
| 422 | Unprocessable Entity: a URL doesn't belong to the host, or the key doesn't match the protocol's form |
| 429 | Too Many Requests: "Too Many Requests (potential Spam)" |

The FAQ says the key file must be reachable "without login, firewall, or IP
restrictions".

A 200 means only that the notice arrived, not that a page was crawled. Don't
send the same URL again without a real change to its page: IndexNow's FAQ
says "Avoid submitting the same URL many times a day unless there are
meaningful content changes." A deploy that changes no page, such as one that
touches only `_headers`, sends nothing. Sources: https://www.indexnow.org/documentation
and https://www.indexnow.org/faq, read on 13 November 2026.

If Crawler Hints is on (`marketing/sittings/search-console-and-crawlers.md`,
B3), Cloudflare may also send pages to IndexNow. Cloudflare's page says it
"uses cache-status `MISS` to determine when content has likely been updated
and sends it to IndexNow's crawler". The pages answered
`cf-cache-status: DYNAMIC` on 13 November 2026, so B3 expects it to send none
while that holds. Source:
https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/
(last updated 14 August 2026), read on 13 November 2026.

## The Shopify app

The app is `apps/rewards` and deploys on its own:
[apps/rewards/DEPLOY.md](../rewards/DEPLOY.md).
