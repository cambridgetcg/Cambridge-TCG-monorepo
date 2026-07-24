// @ts-check
/**
 * RewardsPro Mystery Boxes Widget
 * Displays mystery boxes on the storefront with open/reveal flow
 *
 * Security: HTML escaping on all user-provided content
 * Performance: LocalStorage caching with version + TTL
 * Accessibility: Keyboard support, ARIA attributes, focus management
 *
 * MIGRATION NOTE: Local helpers (fetchWithRetry, cache, escapeHtml) predate
 * the shared `window.RPUtils` module. rp-widget-loader.js guarantees RPUtils
 * is ready first. See membership-widget.js for the port pattern — this
 * widget is next in line.
 */

/**
 * @typedef {Object} ProxyErrorResponse
 * @property {false} success
 * @property {string} error - Machine-readable error message
 * @property {string} message - Human-readable error message
 */

/**
 * @typedef {Object} ProxySuccessResponse
 * @property {true} success
 * @property {string} [message]
 */

(function() {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Shared utilities (window.RPUtils, from rp-utils.js)
  // ────────────────────────────────────────────────────────────────────────
  if (!window.RPUtils || !window.RPUtils.VERSION) {
    console.error('[MysteryBoxes] window.RPUtils is missing. Ensure the ' +
      '`rp-widget-loader.js` schema asset ordered-loads this runtime.');
    return;
  }
  var RP = window.RPUtils;
  var log = RP.logger('MysteryBoxes');

  const CONFIG = {
    DEFAULT_CACHE_DURATION_S: 60,
    ANIMATION_SPEEDS: { fast: 1500, normal: 2500, slow: 3500 }
  };

  const RARITY_COLORS = {
    COMMON: '#6B7280',
    UNCOMMON: '#10B981',
    RARE: '#3B82F6',
    EPIC: '#8B5CF6',
    LEGENDARY: '#F59E0B'
  };

  class MysteryBoxesWidget {
    constructor(rootElement) {
      this.root = rootElement;
      this.config = this.parseConfiguration();
      this.state = {
        isLoading: false,
        data: null,
        error: null,
        pointsBalance: 0,
        currencyName: 'Points',
        currencyIcon: 'star'
      };

      if (this.root.dataset.initialized === 'true') return;
      this.root.dataset.initialized = 'true';

      this.initialize();
    }

    parseConfiguration() {
      const d = this.root.dataset;
      return {
        isAuthenticated: d.state === 'authenticated',
        customerId: d.customerId || null,
        shopDomain: d.shopDomain,
        apiEndpoint: d.apiEndpoint,
        openEndpoint: d.openEndpoint,
        sectionTitle: d.sectionTitle || 'Mystery Boxes',
        showRarity: d.showRarity !== 'false',
        animationSpeed: d.animationSpeed || 'normal',
        cacheDuration: parseInt(d.cacheDuration) || CONFIG.DEFAULT_CACHE_DURATION_S,
        guest: {
          message: d.guestMessage || 'Sign in to open mystery boxes and win rewards!',
          ctaText: d.guestCtaText || 'Sign In',
          ctaUrl: d.guestCtaUrl || '/account/login'
        }
      };
    }

    async initialize() {
      log.debug('Initializing', { authenticated: this.config.isAuthenticated });

      if (!this.config.isAuthenticated) {
        this.renderGuest();
        return;
      }

      const cached = this.getCachedData();
      if (cached) {
        log.debug('Using cached data');
        this.state.data = cached.boxes;
        this.state.pointsBalance = cached.pointsBalance || 0;
        this.state.currencyName = cached.config?.currencyName || 'Points';
        this.state.currencyIcon = cached.config?.currencyIcon || 'star';
        this.renderBoxes();
      } else {
        this.renderLoading();
      }

      await this.fetchBoxes();
    }

    // ─── Network ───────────────────────────────────────────
    // Delegate to RP.fetchWithRetry (timeout + exponential backoff, skips
    // AbortError retries). This widget has no custom error-body extraction,
    // so the shared implementation is a direct replacement.

    fetchWithRetry(url, options) {
      return RP.fetchWithRetry(url, options);
    }

    async fetchBoxes() {
      if (!this.config.apiEndpoint || !this.config.customerId) {
        log.error('Missing API endpoint or customer ID');
        this.renderError("We're having trouble loading this right now. Please refresh the page.");
        return;
      }

      this.state.isLoading = true;

      try {
        const url = new URL(this.config.apiEndpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        const response = await this.fetchWithRetry(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin'
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || data.message || "We couldn't load the mystery boxes. Try again in a moment.");
        }

        if (!data.enabled) {
          this.renderEmpty('Mystery boxes are not available right now.');
          return;
        }

        this.state.data = data.boxes || [];
        this.state.pointsBalance = data.pointsBalance || 0;
        this.state.currencyName = data.config?.currencyName || 'Points';
        this.state.currencyIcon = data.config?.currencyIcon || 'star';
        this.state.error = null;

        this.cacheData(data);
        this.renderBoxes();

      } catch (error) {
        log.error('Fetch error:', error.message);

        if (!this.state.data) {
          this.renderError(error.name === 'AbortError' ? "We're slow today — try again in a moment." : "We couldn't load the mystery boxes. Try again in a moment.");
        }
      } finally {
        this.state.isLoading = false;
      }
    }

    async openBox(boxId) {
      const box = this.state.data?.find(b => b.id === boxId);
      if (!box) return;

      try {
        const url = new URL(this.config.openEndpoint, window.location.origin);
        const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const response = await this.fetchWithRetry(url.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Idempotency-Key': idemKey
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            boxId,
            logged_in_customer_id: this.config.customerId,
            shop: this.config.shopDomain
          })
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || data.message || "We couldn't open the box. Your points are safe — try again.");
        }

        // Update local state optimistically
        this.updateLocalState(boxId);

        // Show reveal animation
        this.renderRewardReveal(data.reward);

      } catch (error) {
        log.error('Open box error:', error.message);
        this.dismissModal();
        this.showToast(error.message, 'error');
        this.renderBoxes();
      }
    }

    updateLocalState(boxId) {
      if (!this.state.data) return;

      const box = this.state.data.find(b => b.id === boxId);
      if (box) {
        box.customerOpens = (box.customerOpens || 0) + 1;
        box.totalOpens = (box.totalOpens || 0) + 1;

        // Update canOpen status
        if (box.customerOpens >= box.maxOpensPerCustomer) {
          box.canOpen = false;
          box.reason = 'Max opens reached';
        }
      }

      // Deduct points
      const cost = box?.pointsCost || 0;
      this.state.pointsBalance = Math.max(0, this.state.pointsBalance - cost);

      // Update insufficient points on all boxes
      this.state.data.forEach(b => {
        if (b.canOpen && this.state.pointsBalance < (b.pointsCost || 0)) {
          b.canOpen = false;
          b.reason = 'Insufficient points';
        }
      });

      // Update cache
      this.cacheData({
        boxes: this.state.data,
        pointsBalance: this.state.pointsBalance,
        config: { currencyName: this.state.currencyName, currencyIcon: this.state.currencyIcon }
      });
    }

    // ─── Cache ─────────────────────────────────────────────
    // RP.cache keys as `rp:mystery-boxes:<shop>:<customer>` so a shared
    // device can't leak one shopper's recently-viewed boxes to the next.

    cacheKeyParts() {
      return ['mystery-boxes', this.config.shopDomain, this.config.customerId];
    }

    getCachedData() {
      if (!this.config.customerId) return null;
      return RP.cache.read(this.cacheKeyParts(), this.config.cacheDuration);
    }

    cacheData(data) {
      if (!this.config.customerId) return;
      RP.cache.write(this.cacheKeyParts(), data);
    }

    // ─── Render: States ────────────────────────────────────

    renderLoading() {
      const skeletonCard = (delay) => `
        <div class="rp-mb-skeleton" style="animation-delay:${delay}s">
          <div class="rp-mb-skeleton__image"></div>
          <div class="rp-mb-skeleton__body">
            <div class="rp-mb-skeleton__line rp-mb-skeleton__line--name"></div>
            <div class="rp-mb-skeleton__line rp-mb-skeleton__line--desc"></div>
            <div class="rp-mb-skeleton__line rp-mb-skeleton__line--desc-short"></div>
            <div class="rp-mb-skeleton__rarity-row">
              <div class="rp-mb-skeleton__rarity-dot"></div>
              <div class="rp-mb-skeleton__rarity-bar"></div>
            </div>
            <div class="rp-mb-skeleton__rarity-row">
              <div class="rp-mb-skeleton__rarity-dot"></div>
              <div class="rp-mb-skeleton__rarity-bar"></div>
            </div>
            <div class="rp-mb-skeleton__cost"></div>
            <div class="rp-mb-skeleton__btn"></div>
          </div>
        </div>`;

      this.root.innerHTML = `
        <div class="rp-mb-container">
          <div class="rp-mb-grid">
            ${skeletonCard(0)}
            ${skeletonCard(0.1)}
            ${skeletonCard(0.2)}
          </div>
        </div>
      `;
    }

    renderGuest() {
      const { message, ctaText, ctaUrl } = this.config.guest;

      // Teaser boxes shown locked to drive sign-ups
      const teaserBoxes = [
        { icon: '🃏', rarity: 'RARE', name: 'Holo Rare Box', cost: '200 pts', rarityColor: '#3b82f6' },
        { icon: '💜', rarity: 'EPIC', name: 'Alt-Art Mystery Box', cost: '500 pts', rarityColor: '#8b5cf6' },
        { icon: '✨', rarity: 'LEGENDARY', name: 'Secret Rare Treasure', cost: '1000 pts', rarityColor: '#f59e0b' },
      ];

      const teaserHtml = teaserBoxes.map(b => `
        <div class="rp-mb-guest__teaser-card" role="listitem">
          <div class="rp-mb-guest__teaser-top">
            <span class="rp-mb-guest__teaser-icon">${b.icon}</span>
            <span class="rp-mb-guest__teaser-rarity" style="color:${b.rarityColor}">${b.rarity}</span>
          </div>
          <div class="rp-mb-guest__teaser-name">${this.escapeHtml(b.name)}</div>
          <div class="rp-mb-guest__teaser-cost">${this.escapeHtml(b.cost)}</div>
          <div class="rp-mb-guest__teaser-overlay">🔒</div>
        </div>`).join('');

      this.root.innerHTML = `
        <div class="rp-mb-container">
          <div class="rp-mb-guest">
            <div class="rp-mb-guest__header">
              <h2 class="rp-section-title rp-mb-title">${this.escapeHtml(this.config.sectionTitle)}</h2>
              <p class="rp-mb-guest__message">${this.escapeHtml(message)}</p>
              <a href="${this.escapeHtml(ctaUrl)}" class="rp-mb-btn rp-mb-btn--primary rp-mb-guest__cta">
                ${this.escapeHtml(ctaText)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
            </div>
            <div class="rp-mb-guest__teasers" aria-label="Sample mystery boxes" role="list">
              ${teaserHtml}
            </div>
            <p class="rp-mb-guest__note">🔒 Sign in to open mystery boxes with your points</p>
          </div>
        </div>
      `;
    }

    renderError(message) {
      this.root.innerHTML = `
        <div class="rp-mb-container">
          <h2 class="rp-section-title rp-mb-title">${this.escapeHtml(this.config.sectionTitle)}</h2>
          <div class="rp-mb-error rp-empty-state" role="status">
            <div class="rp-empty-state__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 class="rp-empty-state__title">Boxes are taking a moment</h3>
            <p class="rp-empty-state__message">${this.escapeHtml(message || "We couldn't load the mystery boxes right now. Your points are safe — try again in a moment.")}</p>
            <div class="rp-empty-state__actions">
              <button class="rp-btn rp-btn--secondary" data-action="retry">Try again</button>
              <a class="rp-btn-link" href="/account">View account</a>
            </div>
          </div>
        </div>
      `;

      this.root.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
        this.renderLoading();
        this.fetchBoxes();
      });
    }

    renderEmpty(message) {
      this.root.innerHTML = `
        <div class="rp-mb-container">
          <h2 class="rp-section-title rp-mb-title">${this.escapeHtml(this.config.sectionTitle)}</h2>
          <div class="rp-mb-empty rp-empty-state">
            <div class="rp-empty-state__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" aria-hidden="true">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
            </div>
            <h3 class="rp-empty-state__title">No boxes right now</h3>
            <p class="rp-empty-state__message">${this.escapeHtml(message || 'New mystery boxes drop regularly — check back soon.')}</p>
          </div>
        </div>
      `;
    }

    // ─── Render: Main Grid ─────────────────────────────────

    renderBoxes() {
      const boxes = this.state.data;
      if (!boxes || boxes.length === 0) {
        this.renderEmpty();
        return;
      }

      const currencyName = this.escapeHtml(this.state.currencyName);
      const balance = this.state.pointsBalance;

      this.root.innerHTML = `
        <div class="rp-mb-container">
          <div class="rp-mb-header">
            <h2 class="rp-section-title rp-mb-title">${this.escapeHtml(this.config.sectionTitle)}</h2>
            <div class="rp-mb-balance">
              <span class="rp-mb-balance__label">Your Balance:</span>
              <span class="rp-mb-balance__value">${RP.format.number(balance)} ${currencyName}</span>
            </div>
          </div>
          <div class="rp-mb-grid">
            ${boxes.map(box => this.renderBoxCard(box)).join('')}
          </div>
        </div>
      `;

      this.attachBoxEventListeners();
    }

    renderBoxCard(box) {
      const canOpen = box.canOpen !== false;
      const disabledClass = canOpen ? '' : 'rp-mb-card--disabled';
      const currencyName = this.escapeHtml(this.state.currencyName);
      const opensInfo = box.customerOpens !== undefined
        ? `${box.customerOpens} / ${box.maxOpensPerCustomer} opens`
        : '';

      const imageHtml = box.imageUrl
        ? `<div class="rp-mb-card__image"><img src="${this.escapeHtml(box.imageUrl)}" alt="${this.escapeHtml(box.name)}" loading="lazy"/></div>`
        : `<div class="rp-mb-card__image rp-mb-card__image--placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>`;

      const rarityHtml = this.config.showRarity && box.rarityPreview?.length
        ? `<div class="rp-mb-card__rarity">${box.rarityPreview.map(r => this.renderRarityBar(r)).join('')}</div>`
        : '';

      const reasonHtml = !canOpen && box.reason
        ? `<span class="rp-mb-card__reason">${this.escapeHtml(box.reason)}</span>`
        : '';

      return `
        <div class="rp-mb-card ${disabledClass}" data-box-id="${this.escapeHtml(box.id)}">
          ${imageHtml}
          <div class="rp-mb-card__body">
            <h3 class="rp-mb-card__name">${this.escapeHtml(box.name)}</h3>
            ${box.description ? `<p class="rp-mb-card__desc">${this.escapeHtml(box.description)}</p>` : ''}
            ${rarityHtml}
            <div class="rp-mb-card__footer">
              <div class="rp-mb-card__cost">
                <span class="rp-mb-card__cost-value">${RP.format.number(box.pointsCost || 0)}</span>
                <span class="rp-mb-card__cost-label">${currencyName}</span>
              </div>
              <div class="rp-mb-card__meta">
                ${opensInfo ? `<span class="rp-mb-card__opens">${opensInfo}</span>` : ''}
                ${reasonHtml}
              </div>
              <button class="rp-mb-btn rp-mb-btn--primary rp-mb-card__btn"
                      data-action="open" data-box-id="${this.escapeHtml(box.id)}"
                      ${canOpen ? '' : 'disabled'}
                      aria-label="Open ${this.escapeHtml(box.name)}">
                ${canOpen ? 'Open Box' : (box.reason || 'Unavailable')}
                ${canOpen ? '<span class="rp-mb-btn__shimmer"></span>' : ''}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    renderRarityBar(rarityItem) {
      const color = RARITY_COLORS[rarityItem.rarity] || RARITY_COLORS.COMMON;
      const label = rarityItem.rarity.charAt(0) + rarityItem.rarity.slice(1).toLowerCase();
      const pct = Math.round(rarityItem.chance * 100);

      // Colorblind-friendly: label text is present alongside the color dot,
      // and the decorative color chip is hidden from screen readers so they
      // announce the rarity name + percentage only.
      return `
        <div class="rp-mb-rarity" role="group" aria-label="${label} ${pct}%">
          <span class="rp-mb-rarity__dot" aria-hidden="true" style="background:${color}"></span>
          <span class="rp-mb-rarity__label">${label}</span>
          <div class="rp-mb-rarity__track" aria-hidden="true">
            <div class="rp-mb-rarity__fill" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
      `;
    }

    // ─── Render: Confirm Modal ─────────────────────────────

    renderConfirmModal(box) {
      const currencyName = this.escapeHtml(this.state.currencyName);
      const cost = box.pointsCost || 0;
      const balance = this.state.pointsBalance;
      const remaining = balance - cost;

      const overlay = document.createElement('div');
      overlay.className = 'rp-mb-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', `Open ${box.name}`);
      overlay.innerHTML = `
        <div class="rp-mb-modal">
          <h3 class="rp-mb-modal__title">Open ${this.escapeHtml(box.name)}?</h3>
          <div class="rp-mb-modal__cost-breakdown">
            <div class="rp-mb-modal__row">
              <span>Cost</span>
              <span>${RP.format.number(cost)} ${currencyName}</span>
            </div>
            <div class="rp-mb-modal__row">
              <span>Your balance</span>
              <span>${RP.format.number(balance)} ${currencyName}</span>
            </div>
            <div class="rp-mb-modal__divider"></div>
            <div class="rp-mb-modal__row rp-mb-modal__row--result">
              <span>After opening</span>
              <span>${RP.format.number(remaining)} ${currencyName}</span>
            </div>
          </div>
          <div class="rp-mb-modal__actions">
            <button class="rp-mb-btn rp-mb-btn--secondary" data-action="cancel">Cancel</button>
            <button class="rp-mb-btn rp-mb-btn--primary" data-action="confirm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
              Open Box
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus the confirm button
      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      setTimeout(() => confirmBtn?.focus(), 100);

      // Event listeners
      overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismissModal());
      overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
        this.dismissModal();
        this.openBox(box.id);
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.dismissModal();
      });

      // Escape key
      this._modalEscHandler = (e) => {
        if (e.key === 'Escape') this.dismissModal();
      };
      document.addEventListener('keydown', this._modalEscHandler);
    }

    dismissModal() {
      const overlay = document.querySelector('.rp-mb-overlay');
      if (overlay) {
        overlay.remove();
        document.body.style.overflow = '';
      }
      if (this._modalEscHandler) {
        document.removeEventListener('keydown', this._modalEscHandler);
        this._modalEscHandler = null;
      }
    }

    // ─── Render: Reward Reveal ─────────────────────────────

    renderRewardReveal(reward) {
      const rarityColor = RARITY_COLORS[reward.rarity] || RARITY_COLORS.COMMON;
      const rarityLabel = reward.rarity ? reward.rarity.charAt(0) + reward.rarity.slice(1).toLowerCase() : 'Common';
      const speedMs = CONFIG.ANIMATION_SPEEDS[this.config.animationSpeed] || CONFIG.ANIMATION_SPEEDS.normal;

      const overlay = document.createElement('div');
      overlay.className = 'rp-mb-overlay rp-mb-reveal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Reward revealed');
      overlay.innerHTML = `
        <div class="rp-mb-reveal__content">
          <div class="rp-mb-reveal__box rp-mb-reveal--shake">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="80" height="80">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <div class="rp-mb-reveal__reward" style="--rp-mb-rarity-color:${rarityColor}">
            <div class="rp-mb-reveal__glow"></div>
            <div class="rp-mb-reveal__badge" style="border-color:${rarityColor}">
              <span class="rp-mb-reveal__rarity" style="color:${rarityColor}">${rarityLabel}</span>
            </div>
            <h3 class="rp-mb-reveal__name">${this.escapeHtml(reward.name || 'Mystery Reward')}</h3>
            <p class="rp-mb-reveal__desc">${this.escapeHtml(reward.description || '')}</p>
            ${reward.value ? `<p class="rp-mb-reveal__value">${this.escapeHtml(String(reward.value))}</p>` : ''}
          </div>
          <button class="rp-mb-btn rp-mb-btn--primary rp-mb-reveal__close" data-action="close-reveal">Awesome!</button>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      // Play animation sequence
      this.playRevealAnimation(overlay, speedMs);

      // Close handlers
      overlay.querySelector('[data-action="close-reveal"]')?.addEventListener('click', () => {
        overlay.remove();
        document.body.style.overflow = '';
        this.renderBoxes();
      });

      this._revealEscHandler = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.body.style.overflow = '';
          document.removeEventListener('keydown', this._revealEscHandler);
          this.renderBoxes();
        }
      };
      document.addEventListener('keydown', this._revealEscHandler);
    }

    playRevealAnimation(overlay, speedMs) {
      const boxEl = overlay.querySelector('.rp-mb-reveal__box');
      const rewardEl = overlay.querySelector('.rp-mb-reveal__reward');
      const closeBtn = overlay.querySelector('.rp-mb-reveal__close');

      // Phase 1: Shake (40% of total time)
      const shakeTime = speedMs * 0.4;
      // Phase 2: Box opens / fades out (20%)
      const openTime = speedMs * 0.2;

      // After shake, transition to open
      setTimeout(() => {
        if (boxEl) {
          boxEl.classList.remove('rp-mb-reveal--shake');
          boxEl.classList.add('rp-mb-reveal--open');
        }
      }, shakeTime);

      // After open, reveal reward
      setTimeout(() => {
        if (boxEl) boxEl.classList.add('rp-mb-reveal--hidden');
        if (rewardEl) rewardEl.classList.add('rp-mb-reveal--visible');
        if (closeBtn) closeBtn.classList.add('rp-mb-reveal--visible');
      }, shakeTime + openTime);
    }

    // ─── Event Listeners ───────────────────────────────────

    attachBoxEventListeners() {
      this.root.querySelectorAll('[data-action="open"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const boxId = e.currentTarget.dataset.boxId;
          const box = this.state.data?.find(b => b.id === boxId);
          if (box) this.renderConfirmModal(box);
        });
      });
    }

    // ─── Toast ───────────────────────────────────────────

    showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = 'rp-mb-toast rp-mb-toast--' + (type || 'error');
      toast.textContent = message;
      document.body.appendChild(toast);

      // Trigger reflow then animate in
      toast.offsetHeight; // eslint-disable-line no-unused-expressions
      toast.classList.add('rp-mb-toast--visible');

      setTimeout(() => {
        toast.classList.remove('rp-mb-toast--visible');
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, 3000);
    }

    // ─── Utilities ─────────────────────────────────────────

    escapeHtml(text) {
      return RP.escapeHtml(text);
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────

  function initWidget(candidate) {
    const selector = '#mystery-boxes-widget-root, .rp-mb-root';
    const roots = candidate && candidate.matches && candidate.matches(selector)
      ? [candidate]
      : document.querySelectorAll(selector);
    roots.forEach((root) => {
      if (!root.dataset.initialized) {
        log.debug('Widget init');
        new MysteryBoxesWidget(root);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

  if (typeof Shopify !== 'undefined') {
    document.addEventListener('shopify:section:load', initWidget);
    document.addEventListener('shopify:section:reorder', initWidget);
  }

  document.addEventListener('rewardspro:widget-ready', (event) => {
    if (event.target && event.target.matches &&
        event.target.matches('#mystery-boxes-widget-root, .rp-mb-root')) {
      initWidget(event.target);
    }
  });
})();
