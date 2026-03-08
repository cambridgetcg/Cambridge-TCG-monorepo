/**
 * RewardsPro Gift Cards Widget
 * Displays purchasable gift card bundles and the customer's issued cards.
 *
 * Security: CSS color/number sanitization, textContent for API strings
 * Performance: LocalStorage caching (60s TTL, shop-keyed)
 * Accessibility: ARIA labels, keyboard handlers, live regions
 * Debug: localStorage.setItem('rp-debug', 'true')
 */
(function () {
  'use strict';

  const CONFIG = {
    TIMEOUT_MS: 10000,
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 1000,
    CACHE_KEY_PREFIX: 'rp_giftcards_v1_',
    CACHE_VERSION: 1,
  };

  const DEBUG = (() => {
    try { return localStorage.getItem('rp-debug') === 'true'; } catch { return false; }
  })();
  const log = {
    debug: (...a) => DEBUG && console.log('[RP:GiftCards]', ...a),
    warn: (...a) => console.warn('[RP:GiftCards]', ...a),
    error: (...a) => console.error('[RP:GiftCards]', ...a),
  };

  // ── Security ──────────────────────────────────────────────────────────────
  function sanitizeColor(val, fallback) {
    if (!val || typeof val !== 'string') return fallback;
    const v = val.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    if (/^rgba?\(/.test(v)) return v;
    return fallback;
  }
  function sanitizeNumber(val, fallback, min = 0, max = 9999999) {
    const n = Number(val);
    return isFinite(n) && n >= min && n <= max ? n : fallback;
  }
  function txt(val) {
    // Safe text — use this when building innerHTML from API data
    const d = document.createElement('span');
    d.textContent = String(val ?? '');
    return d.innerHTML;
  }

  // ── Cache ─────────────────────────────────────────────────────────────────
  function cacheKey(shopDomain) {
    return `${CONFIG.CACHE_KEY_PREFIX}${CONFIG.CACHE_VERSION}_${shopDomain}`;
  }
  function readCache(shopDomain, ttl) {
    try {
      const raw = localStorage.getItem(cacheKey(shopDomain));
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < ttl * 1000) return data;
    } catch { /* ignore */ }
    return null;
  }
  function writeCache(shopDomain, data) {
    try {
      localStorage.setItem(cacheKey(shopDomain), JSON.stringify({ ts: Date.now(), data }));
    } catch { /* ignore */ }
  }
  function bustCache(shopDomain) {
    try { localStorage.removeItem(cacheKey(shopDomain)); } catch { /* ignore */ }
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  async function fetchWithRetry(url, opts = {}, retries = CONFIG.MAX_RETRIES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (retries <= 0) throw err;
      await new Promise(r => setTimeout(r, CONFIG.RETRY_BASE_MS * (CONFIG.MAX_RETRIES - retries + 1)));
      return fetchWithRetry(url, opts, retries - 1);
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  function fmtCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' })
        .format(Number(amount) || 0);
    } catch {
      return `${currency || '$'}${(Number(amount) || 0).toFixed(2)}`;
    }
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return iso; }
  }

  // ── Render: bundle card ───────────────────────────────────────────────────
  function renderBundleCard(bundle, storeCredit, currency, apiEndpoint, customerId, shopDomain, primary, bg) {
    const value = fmtCurrency(bundle.giftCardValue, currency);
    const cost  = fmtCurrency(bundle.cashbackCost, currency);
    const canAfford = storeCredit >= bundle.cashbackCost;

    const card = document.createElement('div');
    card.className = 'rp-gc-bundle-card';
    card.style.cssText = `background:${bg};border-color:${primary}30`;
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', `${bundle.name} — ${value} for ${cost} store credit`);

    card.innerHTML = `
      <div class="rp-gc-bundle-value" style="color:${primary}">${txt(value)}</div>
      <div class="rp-gc-bundle-name" style="color:#fff">${txt(bundle.name)}</div>
      <div class="rp-gc-bundle-cost" style="color:#aaa">Cost: ${txt(cost)} store credit</div>
      ${bundle.description ? `<div class="rp-gc-bundle-desc" style="color:#888">${txt(bundle.description)}</div>` : ''}
      <div class="rp-gc-bundle-status" aria-live="polite" aria-atomic="true"></div>`;

    const btn = document.createElement('button');
    btn.className = 'rp-gc-btn';
    btn.style.cssText = `background:${canAfford ? primary : '#444'};color:${canAfford ? bg : '#888'}`;
    btn.textContent = canAfford ? `Redeem for ${cost}` : `Need ${fmtCurrency(bundle.cashbackCost - storeCredit, currency)} more`;
    btn.disabled = !canAfford;
    btn.setAttribute('aria-label', `Redeem ${bundle.name} gift card for ${cost} store credit`);
    if (!canAfford) btn.setAttribute('aria-disabled', 'true');

    btn.addEventListener('click', async () => {
      const statusEl = card.querySelector('.rp-gc-bundle-status');
      btn.disabled = true;
      btn.textContent = 'Redeeming…';
      statusEl.textContent = '';
      try {
        const convertEndpoint = apiEndpoint.replace('/gift-cards', '/gift-cards/convert');
        const res = await fetch(convertEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId: bundle.id, customerId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        statusEl.textContent = '✓ Gift card issued! Check your email.';
        statusEl.style.color = primary;
        btn.textContent = '✓ Redeemed';
        bustCache(shopDomain);
      } catch (err) {
        log.error('Redemption failed', err);
        btn.disabled = false;
        btn.textContent = `Redeem for ${cost}`;
        statusEl.textContent = err.message || 'Redemption failed. Please try again.';
        statusEl.style.color = '#ff3b30';
      }
    });

    card.appendChild(btn);
    return card;
  }

  // ── Render: issued card ───────────────────────────────────────────────────
  function renderIssuedCard(card, currency, primary, bg) {
    const balance  = fmtCurrency(card.remainingBalance, card.currency || currency);
    const statusCls = card.status === 'ACTIVE' ? 'active' : card.status === 'FULLY_USED' ? 'used' : 'expired';
    const statusLabel = card.status === 'ACTIVE' ? 'Active' : card.status === 'FULLY_USED' ? 'Used' : 'Expired';

    const el = document.createElement('div');
    el.className = 'rp-gc-issued-card';
    el.style.cssText = `background:${bg};border-color:${primary}25`;
    el.setAttribute('role', 'article');
    el.setAttribute('aria-label', `Gift card: ${balance} remaining`);

    el.innerHTML = `
      <div class="rp-gc-issued-icon" aria-hidden="true">🎁</div>
      <div class="rp-gc-issued-info">
        <div class="rp-gc-issued-balance" style="color:${primary}">${txt(balance)}</div>
        ${card.code ? `<div class="rp-gc-issued-code">${txt(card.code)}</div>` : ''}
        ${card.expiresAt ? `<div class="rp-gc-issued-meta">Expires ${txt(fmtDate(card.expiresAt))}</div>` : ''}
        <div class="rp-gc-issued-meta">Issued ${txt(fmtDate(card.createdAt))}</div>
      </div>
      <span class="rp-gc-issued-status rp-gc-issued-status--${statusCls}" aria-label="Status: ${statusLabel}">${statusLabel}</span>`;

    return el;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function render(el, data, cfg) {
    const primary = sanitizeColor(cfg.primaryColor, '#FFD700');
    const bg      = sanitizeColor(cfg.bgColor,      '#1a1a2e');
    const cols    = sanitizeNumber(cfg.columns, 3, 1, 4);
    const currency   = data.currency || 'USD';
    const credit     = data.storeCredit || 0;
    const apiEndpoint = el.dataset.apiEndpoint;
    const customerId  = el.dataset.customerId;
    const shopDomain  = el.dataset.shopDomain;

    el.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'rp-gc-header';
    header.innerHTML = `
      <h2 class="rp-gc-title" style="color:#fff">${txt(cfg.heading || 'Gift Cards')}</h2>
      <span class="rp-gc-credit-badge" style="color:${primary};border-color:${primary}">
        ${txt(fmtCurrency(credit, currency))} credit
      </span>`;
    el.appendChild(header);

    const hasBundles = cfg.showBundles !== 'false' && data.bundles && data.bundles.length > 0;
    const hasIssued  = cfg.showIssued  !== 'false' && data.issuedGiftCards && data.issuedGiftCards.length > 0;

    if (!hasBundles && !hasIssued) {
      const empty = document.createElement('div');
      empty.className = 'rp-gc-empty';
      empty.style.color = '#aaa';
      empty.textContent = cfg.emptyMessage || 'No gift cards yet. Earn store credit to redeem one!';
      el.appendChild(empty);
      return;
    }

    // Bundles
    if (hasBundles) {
      const label = document.createElement('p');
      label.className = 'rp-gc-section-label';
      label.style.color = primary;
      label.textContent = 'Redeem Store Credit';
      el.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'rp-gc-grid';
      grid.style.setProperty('--rp-gc-cols', cols);
      grid.setAttribute('role', 'list');
      data.bundles.forEach(bundle => {
        const card = renderBundleCard(bundle, credit, currency, apiEndpoint, customerId, shopDomain, primary, bg);
        card.setAttribute('role', 'listitem');
        grid.appendChild(card);
      });
      el.appendChild(grid);
    }

    // Issued cards
    if (hasIssued) {
      const label = document.createElement('p');
      label.className = 'rp-gc-section-label';
      label.style.color = primary;
      label.textContent = 'Your Gift Cards';
      el.appendChild(label);

      const list = document.createElement('div');
      list.className = 'rp-gc-issued-list';
      list.setAttribute('role', 'list');
      data.issuedGiftCards.forEach(c => {
        const row = renderIssuedCard(c, currency, primary, bg);
        row.setAttribute('role', 'listitem');
        list.appendChild(row);
      });
      el.appendChild(list);
    }
  }

  function renderGuest(el, cfg) {
    const primary = sanitizeColor(cfg.primaryColor, '#FFD700');
    const bg      = sanitizeColor(cfg.bgColor,      '#1a1a2e');
    el.innerHTML = `
      <div class="rp-gc-header">
        <h2 class="rp-gc-title" style="color:#fff">${txt(cfg.heading || 'Gift Cards')}</h2>
      </div>
      <div class="rp-gc-guest">
        <p style="color:#aaa">${txt(cfg.guestMessage || 'Sign in to view gift cards.')}</p>
        <a href="${cfg.guestUrl || '/account/login'}" class="rp-gc-btn"
           style="background:${primary};color:${bg};width:auto;display:inline-flex"
           aria-label="${txt(cfg.guestCta || 'Sign In')}">
          ${txt(cfg.guestCta || 'Sign In')}
        </a>
      </div>`;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init(el) {
    const state = el.dataset.state;
    const cfg = {
      primaryColor: el.dataset.primaryColor,
      bgColor:      el.dataset.bgColor,
      heading:      el.dataset.heading,
      columns:      el.dataset.columns,
      showBundles:  el.dataset.showBundles,
      showIssued:   el.dataset.showIssued,
      emptyMessage: el.dataset.emptyMessage,
      guestMessage: el.dataset.guestMessage,
      guestCta:     el.dataset.guestCta,
      guestUrl:     el.dataset.guestUrl,
    };
    const ttl        = sanitizeNumber(el.dataset.cacheDuration, 60, 30, 600);
    const shopDomain = el.dataset.shopDomain || '';
    const apiEndpoint = el.dataset.apiEndpoint || '/apps/rewardspro/gift-cards';
    const customerId  = el.dataset.customerId  || '';

    if (state === 'guest') { renderGuest(el, cfg); return; }

    // Cache hit
    const cached = readCache(shopDomain, ttl);
    if (cached) { log.debug('Cache hit'); render(el, cached, cfg); return; }

    // Fetch
    const url = `${apiEndpoint}?logged_in_customer_id=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shopDomain)}`;
    try {
      const data = await fetchWithRetry(url);
      if (!data.enabled) {
        el.innerHTML = ''; // feature disabled — render nothing
        return;
      }
      writeCache(shopDomain, data);
      render(el, data, cfg);
    } catch (err) {
      log.error('Failed to load gift card data', err);
      el.innerHTML = `<p class="rp-gc-error">Gift cards temporarily unavailable.</p>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rp-giftcards-root').forEach(init);
  });
})();
