/**
 * RewardsPro Gift Cards Widget
 * Displays purchasable gift card bundles and the customer's issued cards.
 *
 * Security: CSS color/number sanitization, textContent for API strings
 * Performance: LocalStorage caching (60s TTL, shop+customer-keyed since v2)
 * Accessibility: ARIA labels, keyboard handlers, live regions
 * Debug: localStorage.setItem('rp-debug', 'true')
 *
 * MIGRATION NOTE: Local helpers (sanitizeColor, sanitizeNumber, txt,
 * fetchWithRetry, cache) should delegate to `window.RPUtils.*`. rp-utils.js
 * is already loaded via the rp_utils_loader snippet. Follow the
 * membership-widget.js port pattern.
 */
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Shared utilities (window.RPUtils, from rp-utils.js)
  // ────────────────────────────────────────────────────────────────────────
  if (!window.RPUtils || !window.RPUtils.VERSION) {
    console.error('[RP:GiftCards] window.RPUtils is missing. Ensure the ' +
      '`rp_utils_loader` snippet is rendered before this script.');
    return;
  }
  const RP = window.RPUtils;
  const log = RP.logger('RP:GiftCards');
  const sanitizeColor = RP.sanitize.color;
  const sanitizeNumber = RP.sanitize.number;
  const txt = RP.escapeHtml;

  // ── Cache ─────────────────────────────────────────────────────────────────
  // RP.cache keys as `rp:gift-cards:<shop>:<customer|guest>` — shop+customer
  // scoped so a shared device never leaks one shopper's cards to the next.
  function cacheParts(shopDomain, customerId) {
    return ['gift-cards', shopDomain, customerId || 'guest'];
  }
  function readCache(shopDomain, customerId, ttl) {
    return RP.cache.read(cacheParts(shopDomain, customerId), ttl);
  }
  function writeCache(shopDomain, customerId, data) {
    RP.cache.write(cacheParts(shopDomain, customerId), data);
  }
  function bustCache(shopDomain, customerId) {
    RP.cache.bust(cacheParts(shopDomain, customerId));
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  // Thin local wrapper: RP.fetchWithRetry returns the Response; gift-cards
  // historically returned JSON from fetchWithRetry. Preserve that contract
  // so call sites don't change — just proxy through to the shared retrier.
  async function fetchWithRetry(url, opts = {}) {
    try {
      const res = await RP.fetchWithRetry(url, opts);
      return await res.json();
    } catch (err) {
      // For parity with the old impl, rethrow after logging.
      log.debug('fetchWithRetry failed:', err.message);
      throw err;
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  // Delegate to RP.format.currency so gift-cards renders money the same
  // way every other widget does. Previously this widget inlined its own
  // Intl.NumberFormat wrapper; the only difference was a fallback glyph.
  function fmtCurrency(amount, currency) {
    return RP.format.currency(amount, currency || 'USD');
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

    // Use CSS custom props so colors adapt to light/dark themes. The
    // hard-coded `#aaa`/`#888` contrast was failing WCAG AA on light
    // storefronts; `--rp-text-*` vars auto-switch with system theme.
    card.innerHTML = `
      <div class="rp-gc-bundle-value" style="color:${primary}">${txt(value)}</div>
      <div class="rp-gc-bundle-name">${txt(bundle.name)}</div>
      <div class="rp-gc-bundle-cost">Cost: ${txt(cost)} store credit</div>
      ${bundle.description ? `<div class="rp-gc-bundle-desc">${txt(bundle.description)}</div>` : ''}
      <div class="rp-gc-bundle-status" aria-live="polite" aria-atomic="true"></div>`;

    const btn = document.createElement('button');
    btn.className = 'rp-gc-btn';
    // `aria-disabled` is set below when unaffordable; the CSS-var-driven
    // :disabled selectors in gift-cards.css carry the muted styling.
    btn.style.cssText = canAfford ? `background:${primary};color:${bg}` : '';
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
        const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const res = await fetch(convertEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
          body: JSON.stringify({ bundleId: bundle.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        statusEl.textContent = '✓ Gift card issued! Check your email.';
        statusEl.style.color = primary;
        btn.textContent = '✓ Redeemed';
        bustCache(shopDomain, customerId);
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
      <h2 class="rp-section-title rp-gc-title">${txt(cfg.heading || 'Gift Cards')}</h2>
      <span class="rp-gc-credit-badge" style="color:${primary};border-color:${primary}">
        ${txt(fmtCurrency(credit, currency))} credit
      </span>`;
    el.appendChild(header);

    const hasBundles = cfg.showBundles !== 'false' && data.bundles && data.bundles.length > 0;
    const hasIssued  = cfg.showIssued  !== 'false' && data.issuedGiftCards && data.issuedGiftCards.length > 0;

    if (!hasBundles && !hasIssued) {
      // Shared empty-state shell so the tone matches the other widgets.
      const empty = document.createElement('div');
      empty.className = 'rp-gc-empty rp-empty-state';
      empty.innerHTML = `
        <div class="rp-empty-state__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
            <line x1="12" y1="22" x2="12" y2="7"/>
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
          </svg>
        </div>
        <h3 class="rp-empty-state__title">No gift cards yet</h3>`;
      const msg = document.createElement('p');
      msg.className = 'rp-empty-state__message';
      msg.textContent = cfg.emptyMessage || 'Earn store credit on your orders to unlock gift cards you can share or save.';
      empty.appendChild(msg);
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
        <h2 class="rp-section-title rp-gc-title">${txt(cfg.heading || 'Gift Cards')}</h2>
      </div>
      <div class="rp-gc-guest">
        <p class="rp-gc-guest__message">${txt(cfg.guestMessage || 'Sign in to view gift cards.')}</p>
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

    // Cache hit (per-customer key — not leaked across users on shared devices)
    const cached = readCache(shopDomain, customerId, ttl);
    if (cached) { log.debug('Cache hit'); render(el, cached, cfg); return; }

    // Fetch
    const url = `${apiEndpoint}?logged_in_customer_id=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shopDomain)}`;
    try {
      const data = await fetchWithRetry(url);
      if (!data.enabled) {
        el.innerHTML = ''; // feature disabled — render nothing
        return;
      }
      writeCache(shopDomain, customerId, data);
      render(el, data, cfg);
    } catch (err) {
      log.error('Failed to load gift card data', err);
      // Match the tone + layout of the other widgets' error states.
      el.innerHTML = `
        <div class="rp-gc-error rp-empty-state" role="status">
          <div class="rp-empty-state__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="rp-empty-state__title">Gift cards are taking a moment</h3>
          <p class="rp-empty-state__message">We couldn't load your gift cards right now. Your balance is safe — try again in a moment.</p>
          <div class="rp-empty-state__actions">
            <a class="rp-btn-link" href="/account">View account</a>
          </div>
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rp-giftcards-root').forEach(init);
  });
})();
