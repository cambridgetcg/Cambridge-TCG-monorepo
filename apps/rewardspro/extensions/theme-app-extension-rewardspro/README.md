# RewardsPro Theme App Extension

Storefront surface for the RewardsPro loyalty app. Injects six widgets into
Shopify themes via app blocks and app embeds. **No build step** — assets
under `assets/` are hand-written vanilla JavaScript and CSS, loaded directly
by Shopify when a merchant enables a block.

## Layout

```
extensions/theme-app-extension-rewardspro/
├── assets/
│   ├── rp-utils.js                 # SHARED — window.RPUtils (see below)
│   ├── membership-widget.{js,css}  # Floating tier + store-credit badge
│   ├── raffles.{js,css}            # Raffle grid (section block)
│   ├── mystery-boxes-widget.{js,css}
│   ├── missions-widget.{js,css}
│   └── gift-cards.{js,css}
├── blocks/                         # Liquid templates (one per widget)
├── snippets/
│   ├── rp_utils_loader.liquid      # Loads rp-utils.js before any widget
│   └── stars.liquid                # Star rating helper
├── locales/                        # Translatable strings (| t in Liquid)
└── shopify.extension.toml          # Extension manifest
```

## Shared module — `assets/rp-utils.js` (`window.RPUtils`)

The file exports an IIFE that attaches a versioned `window.RPUtils` bag with
the primitives every widget needs. **Consume from here instead of copying
helpers into each widget.** Current surface (v1.0.0):

| Namespace | Purpose |
|---|---|
| `RP.VERSION` | Semver of the shared module. Bumped on breaking changes. |
| `RP.logger(scope)` | `{ debug, info, warn, error }` gated by `localStorage['rp-debug']`. |
| `RP.sanitize.color(v, fb)` | Accepts hex/rgb/rgba/hsl/hsla + named; blocks CSS injection. |
| `RP.sanitize.number(v, fb, min?, max?)` | Parses + clamps to range or returns fallback. |
| `RP.sanitize.fontFamily(v, fb?)` | Blocks `:{};` and non-ASCII-safe input. |
| `RP.escapeHtml(text)` | DOM-safe `textContent → innerHTML` round-trip. |
| `RP.fetchWithRetry(url, opts?, cfg?)` | Timeout + exponential-backoff retries. Skips retry on `AbortError`. |
| `RP.idempotencyKey()` | UUID for `Idempotency-Key` headers (see security section). |
| `RP.cache.{key, read, write, bust}` | Versioned `localStorage` envelope. Keys: `rp:<parts…>`. |
| `RP.format.currency(amount, currency, locale?)` | `Intl.NumberFormat` with safe fallback. |
| `RP.readTranslations(dataset, schema)` | Resolves `data-i18n-*` values with fallbacks. |

Every Liquid block already ships with `{% render 'rp_utils_loader' %}` at
the top, so `window.RPUtils` is defined before widget JS runs. The browser
dedupes identical script tags — multiple widgets on the same page cost one
HTTP request.

### Reference implementation

`assets/membership-widget.js` is the canonical consumer. It has no local
sanitize/fetch/cache helpers — everything comes from `RP.*`. Use it as the
template when porting the other four widgets (they each carry a
`MIGRATION NOTE` comment pointing here).

## Security model

- **Auth**: Each widget targets a Shopify App Proxy endpoint
  (`/apps/rewardspro/<widget>`). The backend verifies the HMAC signature and
  reads `logged_in_customer_id` from the signed URL — never from the POST
  body. See `app/routes/api.proxy.$.tsx` and `test/routes/api.proxy.auth.test.ts`.
- **Idempotency**: State-changing POSTs (raffle entry, mystery-box open,
  challenge claim, gift-card conversion) send an `Idempotency-Key` header.
  Server dedupes via Vercel KV (`SET NX EX 120`) so double-clicks, network
  retries, and replays are safe.
- **Cache keys**: Always include the customer ID so a shared device can't
  leak one customer's data to the next. Use `RP.cache.key(['<widget>', shop, customerId])`.

## Data flow

1. Liquid gates on `{% if customer %}` and emits a container with `data-*`
   attributes plus the `rp_utils_loader` snippet.
2. Widget JS reads `element.dataset`, fetches from its proxy endpoint
   (`RP.fetchWithRetry`), caches in localStorage (`RP.cache.write`), and
   renders via `innerHTML` using `RP.escapeHtml` for dynamic values.
3. Merchant theme editor settings (colors, cache duration, copy) flow
   through `data-*` and are sanitized on the client before inline
   `style=` / text interpolation.

## Debug mode

```js
localStorage.setItem('rp-debug', 'true'); // enable
localStorage.removeItem('rp-debug');      // disable
```

Reload. All widgets emit scoped `[WidgetName]` console logs for cache
hits, fetch URLs, retries, and render branches.

## Enabling in a theme

1. Online Store → Themes → Customize.
2. Theme settings → App embeds (for membership/missions) or section target
   for raffles/mystery-boxes/gift-cards.
3. Toggle the RewardsPro block on and configure settings.
4. Save.

## Tests

`test/extensions/rp-utils.test.ts` covers the entire `window.RPUtils`
surface (50 tests, jsdom + vitest). Run:

```sh
npm test -- test/extensions/rp-utils.test.ts
```

`test/routes/api.proxy.auth.test.ts` locks in the proxy auth contract
(body-tampering regression guard + idempotency requirement).

## Troubleshooting

**Widget isn't rendering** — check `localStorage.setItem('rp-debug', 'true')`
and reload; the console log shows whether the cache fired, the fetch URL,
and any HTTP error.

**"Duplicate request" error** — the idempotency guard is rejecting a
replay. In normal usage this means the user double-clicked; the first
request is still in flight. Wait and retry.

**`window.RPUtils is missing` in console** — the `rp_utils_loader` snippet
wasn't rendered before the widget's schema-injected script. Confirm each
Liquid block starts with `{% render 'rp_utils_loader' %}`.
