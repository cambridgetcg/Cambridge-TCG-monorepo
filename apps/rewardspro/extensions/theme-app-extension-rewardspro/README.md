# RewardsPro Theme App Extension

Storefront surface for the RewardsPro loyalty app. Injects six widgets into
Shopify themes via app blocks and app embeds. **No build step** — assets
under `assets/` are hand-written vanilla JavaScript and CSS, loaded directly
by Shopify when a merchant enables a block.

## Layout

```
extensions/theme-app-extension-rewardspro/
├── assets/
│   ├── rp-widget-loader.js         # SHARED — small visibility/ordering entry
│   ├── rp-utils.js                 # SHARED — window.RPUtils (see below)
│   ├── membership-widget.{js,css}  # Floating tier + store-credit badge
│   ├── raffles.{js,css}            # Raffle grid (section block)
│   ├── mystery-boxes-widget.{js,css}
│   ├── missions-widget.{js,css}
│   └── gift-cards.{js,css}
├── blocks/                         # Liquid templates (one per widget)
├── snippets/
│   ├── rp_utils_loader.liquid      # Links shared widget-state styles
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

Every block references the sub-10 KB `rp-widget-loader.js` schema asset and
supplies Shopify CDN URLs through `data-rp-utils-src` and
`data-rp-widget-src`. Shopify can load the entry asynchronously without an
ordering race: it observes roots with a 300 px viewport margin, loads
`rp-utils.js` once, awaits it, and only then requests each widget runtime.
First interaction also starts loading, and browsers without
`IntersectionObserver` load immediately.

The loader deduplicates canonical asset URLs with page-global promises and
emits a root-scoped `rewardspro:widget-ready` event after a runtime is ready.
That event lets already-cached runtimes initialize blocks inserted later by
the Shopify theme editor without executing the asset twice.

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

1. Liquid gates on `{% if customer %}` and emits a container with settings
   plus the utility and widget CDN URLs. `rp_utils_loader` links shared CSS.
2. `rp-widget-loader.js` waits until the container is near the viewport or
   interacted with, then ordered-loads RPUtils and the widget runtime.
3. Widget JS reads `element.dataset`, fetches from its proxy endpoint
   (`RP.fetchWithRetry`), caches in localStorage (`RP.cache.write`), and
   renders via `innerHTML` using `RP.escapeHtml` for dynamic values.
4. Merchant theme editor settings (colors, cache duration, copy) flow
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

`test/extensions/rp-utils.test.ts` covers the `window.RPUtils` surface.
`test/extensions/rp-widget-loader.test.ts` covers ordered loading,
deduplication, viewport/interaction fallback, theme-editor insertion, and
Liquid wiring. Run:

```sh
npm test -- test/extensions/rp-utils.test.ts test/extensions/rp-widget-loader.test.ts
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

**`window.RPUtils is missing` in console** — the ordered loader contract was
bypassed. Confirm the block schema references `rp-widget-loader.js` and its
root includes both `data-rp-utils-src` and `data-rp-widget-src`.
