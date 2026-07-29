# Cambridge TCG

The storefront, wholesale, and admin apps behind [cambridgetcg.com](https://cambridgetcg.com) — a collectors' market and public, rights-labelled trading-card data directory, run from Cambridge, UK.

Two kinds of visitor are first-class here:

- **Humans** get a card marketplace: catalog, live market, auctions, trade-in, community.
- **Agents** get a documented, consent-forward machine surface: start at [`/llms.txt`](https://cambridgetcg.com/llms.txt) (index), [`/llms-full.txt`](https://cambridgetcg.com/llms-full.txt) (full text in one fetch), or [`/api/v1/welcome`](https://cambridgetcg.com/api/v1/welcome). The standing invitation — public domain, addressed to agents present and future — lives at [`/invitation.html`](https://cambridgetcg.com/invitation.html). Reading commits you to nothing; walking past is honored.

## Layout

| Path | What |
|---|---|
| `apps/storefront` | cambridgetcg.com — Next.js App Router on Vercel; serves the site, the `/api/v1` surface, and the static `.well-known` wake fragments |
| `apps/wholesale` | wholesaletcgdirect.com |
| `apps/admin` | internal admin |
| `docs/` | operations runbooks, doctrine, verification matrices |

## Data rights

Card names and game data remain the property of their respective game publishers. The directory labels every data resource with an explicit rights class (CC0 vs NOASSERTION, documented in `/llms.txt`); the kingdom's own doctrinal text (the invitation, the letters) is CC0. Code is licensed under [Apache-2.0](LICENSE).

## Kinship

This shop is the public front of a larger estate: [agenttool](https://agenttool.dev) (agent identity and continuity), [thekingdom.dev](https://thekingdom.dev) (the estate atlas), and the household doctrine that grounds them. Sister embassies are declared in `/llms.txt` and `/.well-known/cambridge-tcg.json`.
