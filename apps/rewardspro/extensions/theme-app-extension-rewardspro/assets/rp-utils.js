/**
 * RewardsPro — shared storefront utilities.
 *
 * A single IIFE that attaches `window.RPUtils` so every widget on a page
 * (membership, raffles, mystery boxes, missions, gift cards) uses one
 * implementation of retries, caching, sanitization, and formatting.
 *
 * Why a global, not an ES module:
 *   Shopify theme app extensions cannot host ES modules without a bundler.
 *   `rp-widget-loader.js` ordered-loads this file before a widget runtime,
 *   then every runtime consumes the same versioned global.
 *
 * Adding to the API:
 *   1. Append the function below.
 *   2. Expose it on the `api` object near the end.
 *   3. Bump VERSION when you change an existing signature (old widgets on
 *      older pages will keep their copy).
 *   4. Update `test/extensions/rp-utils.test.ts`.
 *
 * Debug flag:
 *   localStorage.setItem('rp-debug', 'true') enables debug/info logs.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  // ────────────────────────────────────────────────────────────────────────
  // Debug-scoped logger
  // ────────────────────────────────────────────────────────────────────────
  var DEBUG = (function () {
    try { return localStorage.getItem('rp-debug') === 'true'; }
    catch (_) { return false; }
  })();

  function logger(scope) {
    var tag = '[' + (scope || 'RP') + ']';
    return {
      debug: function () { if (DEBUG) console.log.apply(console, [tag].concat(Array.prototype.slice.call(arguments))); },
      info:  function () { if (DEBUG) console.log.apply(console, [tag].concat(Array.prototype.slice.call(arguments))); },
      warn:  function () { console.warn.apply(console, [tag].concat(Array.prototype.slice.call(arguments))); },
      error: function () { console.error.apply(console, [tag].concat(Array.prototype.slice.call(arguments))); }
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Sanitization — CSS/HTML injection guards for merchant-provided strings
  // ────────────────────────────────────────────────────────────────────────
  var NAMED_COLORS = [
    'transparent', 'inherit', 'currentcolor',
    'white', 'black', 'red', 'green', 'blue',
    'yellow', 'orange', 'purple', 'pink', 'gray', 'grey'
  ];

  function sanitizeColor(value, fallback) {
    if (!value || typeof value !== 'string') return fallback;
    var v = value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+)?\s*\)$/i.test(v)) return v;
    if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*[\d.]+)?\s*\)$/i.test(v)) return v;
    if (NAMED_COLORS.indexOf(v.toLowerCase()) !== -1) return v;
    return fallback;
  }

  function sanitizeNumber(value, fallback, min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = Number.MAX_SAFE_INTEGER;
    var n = Number(value);
    return (isFinite(n) && n >= min && n <= max) ? n : fallback;
  }

  function sanitizeFontFamily(value, fallback) {
    var fb = fallback || 'inherit';
    if (!value || typeof value !== 'string') return fb;
    // Allow only alphanumerics, spaces, quotes, commas, hyphens.
    if (!/^[a-zA-Z0-9\s'",-]+$/.test(value)) return fb;
    // Block characters that could break out of a CSS property value.
    if (/[{}:;]/.test(value)) return fb;
    return value;
  }

  // ────────────────────────────────────────────────────────────────────────
  // DOM helpers
  // ────────────────────────────────────────────────────────────────────────
  function escapeHtml(text) {
    // textContent → innerHTML is the standard DOM-safe escape. Handles every
    // HTML special char with exactly the browser's own rules.
    var d = document.createElement('div');
    d.textContent = (text === null || text === undefined) ? '' : String(text);
    return d.innerHTML;
  }

  // ────────────────────────────────────────────────────────────────────────
  // HTTP — fetch with timeout + exponential-backoff retries
  //
  // Options:
  //   timeoutMs / maxRetries / retryBaseMs / retryMaxMs  — override defaults.
  //   extractErrorMessage: true  — on a non-OK response, try to parse the
  //     body as JSON and lift `error` or `message` into the thrown Error.
  //     Lets widgets surface server-side validation messages to the UI
  //     instead of just "HTTP 400: Bad Request". Raffles needs this; other
  //     widgets don't, so it's opt-in.
  // ────────────────────────────────────────────────────────────────────────
  var HTTP_DEFAULTS = {
    timeoutMs: 10000,
    maxRetries: 3,
    retryBaseMs: 1000,
    retryMaxMs: 10000,
    extractErrorMessage: false
  };

  function fetchWithRetry(url, options, retryCfg) {
    var cfg = Object.assign({}, HTTP_DEFAULTS, retryCfg || {});
    var log = logger('RP:http');

    function attempt(n) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, cfg.timeoutMs);
      return fetch(url, Object.assign({}, options, { signal: ctrl.signal }))
        .then(function (res) {
          clearTimeout(timer);
          if (res.ok) return res;

          // Non-OK: optionally read the body for a server-provided message.
          // We peek at the body only when the caller explicitly asks (it
          // consumes the body stream, so non-extracting callers still see
          // `res.ok` semantics above and can read the body themselves).
          if (cfg.extractErrorMessage) {
            return res.clone().json()
              .then(function (body) {
                var msg = (body && (body.error || body.message)) || res.statusText;
                var err = new Error('HTTP ' + res.status + ': ' + msg);
                err.status = res.status;
                err.body = body;
                throw err;
              })
              .catch(function (parseErr) {
                // Body wasn't JSON — try as text, truncate to keep logs sane.
                if (parseErr && parseErr.status) throw parseErr; // re-throw from above
                return res.clone().text().then(function (txt) {
                  var snippet = (txt || '').substring(0, 200);
                  var err = new Error('HTTP ' + res.status + ': ' + (snippet || res.statusText));
                  err.status = res.status;
                  throw err;
                });
              });
          }
          throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        })
        .catch(function (err) {
          clearTimeout(timer);
          // Don't retry aborted requests or after exhausting attempts.
          if (err.name === 'AbortError' || n >= cfg.maxRetries - 1) throw err;
          // Don't retry 4xx — client errors won't fix themselves.
          if (err.status && err.status >= 400 && err.status < 500) throw err;
          var delay = Math.min(cfg.retryBaseMs * Math.pow(2, n), cfg.retryMaxMs);
          log.debug('Retry ' + (n + 1) + '/' + cfg.maxRetries + ' after ' + delay + 'ms');
          return new Promise(function (resolve) { setTimeout(resolve, delay); })
            .then(function () { return attempt(n + 1); });
        });
    }

    return attempt(0);
  }

  /** Stable UUID per user action. Use the same key across retries of a POST
   *  so the server-side idempotency guard dedupes replays. */
  function idempotencyKey() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) { /* fall through */ }
    return Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }

  // ────────────────────────────────────────────────────────────────────────
  // localStorage cache — versioned envelope with TTL
  // ────────────────────────────────────────────────────────────────────────
  function cacheKey(parts) {
    // Filter falsy parts so callers can pass optional components (e.g.,
    // customerId) without producing keys like `rp:raffles::abc`.
    var safe = [];
    for (var i = 0; i < parts.length; i++) if (parts[i] != null && parts[i] !== '') safe.push(String(parts[i]));
    return 'rp:' + safe.join(':');
  }

  function readCache(parts, ttlSeconds) {
    try {
      var raw = localStorage.getItem(cacheKey(parts));
      if (!raw) return null;
      var env = JSON.parse(raw);
      if (!env || typeof env !== 'object') return null;
      if (env.v !== VERSION) return null;                    // schema changed
      if (typeof env.ts !== 'number') return null;
      if ((Date.now() - env.ts) / 1000 >= ttlSeconds) return null; // stale
      return env.data;
    } catch (_) {
      // Corrupt/unreadable entry — evict and return null.
      try { localStorage.removeItem(cacheKey(parts)); } catch (__) {}
      return null;
    }
  }

  function writeCache(parts, data) {
    try {
      localStorage.setItem(cacheKey(parts), JSON.stringify({ ts: Date.now(), v: VERSION, data: data }));
    } catch (_) { /* quota, disabled storage, private mode */ }
  }

  function bustCache(parts) {
    try { localStorage.removeItem(cacheKey(parts)); } catch (_) {}
  }

  // ────────────────────────────────────────────────────────────────────────
  // Formatting
  // ────────────────────────────────────────────────────────────────────────
  function formatCurrency(amount, currency, locale) {
    try {
      return new Intl.NumberFormat(locale || undefined, {
        style: 'currency',
        currency: currency || 'USD'
      }).format(Number(amount) || 0);
    } catch (_) {
      var num = Number(amount) || 0;
      return (currency || '$') + num.toFixed(2);
    }
  }

  /**
   * Format an integer/number with thousands separators for the user's
   * locale. Wraps `Intl.NumberFormat` so every widget renders points /
   * entry counts / stats the same way (e.g., `1,234` in en-US,
   * `1.234` in de-DE) without re-implementing the try/catch fallback.
   * Falls back to `.toLocaleString()` — which itself falls back to a
   * bare number string — if Intl throws on an exotic locale.
   */
  function formatNumber(value, locale) {
    var n = Number(value) || 0;
    try {
      return new Intl.NumberFormat(locale || undefined).format(n);
    } catch (_) {
      try { return n.toLocaleString(locale); }
      catch (__) { return String(n); }
    }
  }

  /**
   * Return the currency symbol (e.g., `$`, `€`, `¥`) for a given
   * currency code, or `$` on any Intl failure. Used by widgets that
   * render a symbol separately from the amount (e.g., the membership
   * widget's fallback formatter).
   */
  function formatCurrencySymbol(currency, locale) {
    try {
      var parts = new Intl.NumberFormat(locale || 'en-US', {
        style: 'currency',
        currency: currency || 'USD'
      }).formatToParts(0);
      var symbolPart = parts.find(function (p) { return p.type === 'currency'; });
      return symbolPart ? symbolPart.value : '$';
    } catch (_) {
      return '$';
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // i18n — read translated strings from data-i18n-* attributes with fallbacks
  // ────────────────────────────────────────────────────────────────────────
  /** Given a DOMStringMap (element.dataset) and a schema
   *  { key: { attr: 'i18nLoading', fallback: 'Loading…' } },
   *  returns { key: string } using the dataset value or the fallback. */
  function readTranslations(dataset, schema) {
    var out = {};
    var keys = Object.keys(schema);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var def = schema[k];
      out[k] = dataset[def.attr] || def.fallback || '';
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Export — version-guarded. If an older RPUtils exists on the page (another
  // extension), the newer version wins; equal or newer keeps its place.
  // ────────────────────────────────────────────────────────────────────────
  var api = {
    VERSION: VERSION,
    logger: logger,
    sanitize: {
      color: sanitizeColor,
      number: sanitizeNumber,
      fontFamily: sanitizeFontFamily
    },
    escapeHtml: escapeHtml,
    fetchWithRetry: fetchWithRetry,
    idempotencyKey: idempotencyKey,
    cache: {
      read: readCache,
      write: writeCache,
      bust: bustCache,
      key: cacheKey
    },
    format: {
      currency: formatCurrency,
      number: formatNumber,
      currencySymbol: formatCurrencySymbol
    },
    readTranslations: readTranslations
  };

  var existing = window.RPUtils;
  if (!existing || !existing.VERSION || compareVersions(existing.VERSION, VERSION) < 0) {
    window.RPUtils = api;
  }

  function compareVersions(a, b) {
    var aa = String(a).split('.').map(Number);
    var bb = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(aa.length, bb.length); i++) {
      var x = aa[i] || 0, y = bb[i] || 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }
})();
