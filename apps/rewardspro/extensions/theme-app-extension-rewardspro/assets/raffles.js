// @ts-check
/**
 * RewardsPro Raffles Widget
 * Standalone section block for raffle display and entry.
 *
 * Shared helpers (sanitize/fetch/cache/escapeHtml/logger/format) come from
 * `window.RPUtils` — loaded by the `rp_utils_loader` Liquid snippet. Widget
 * doesn't render if RPUtils is missing; the page gets a console error
 * explaining what to fix.
 */

/**
 * @typedef {Object} ProxyErrorResponse
 * @property {false} success
 * @property {string} error - Machine-readable error message
 * @property {string} message - Human-readable error message (same as error)
 */

/**
 * @typedef {Object} ProxySuccessResponse
 * @property {true} success
 * @property {string} [message] - Success message
 * @property {number} [newBalance] - Updated points balance
 * @property {number} [newEntryCount] - Customer's entry count for this raffle
 * @property {number} [totalEntries] - Total entries in raffle
 * @property {number} [pointsSpent] - Points deducted
 * @property {string[]} [bonuses] - Applied bonus names
 */

(function() {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Shared utilities (window.RPUtils, from rp-utils.js)
  // ────────────────────────────────────────────────────────────────────────
  if (!window.RPUtils || !window.RPUtils.VERSION) {
    console.error('[RafflesWidget] window.RPUtils is missing. Ensure the ' +
      '`rp_utils_loader` snippet is rendered before this script. See the ' +
      'extension README for details.');
    return;
  }
  var RP = window.RPUtils;
  var log = RP.logger('RafflesWidget');
  var sanitizeColor = RP.sanitize.color;
  var sanitizeNumber = RP.sanitize.number;

  // Widget-specific tuning. HTTP defaults come from RP.fetchWithRetry;
  // raffles passes `{ extractErrorMessage: true }` so non-OK responses
  // carry the server's validation message through the thrown Error.
  const CONFIG = {
    DEFAULT_CACHE_DURATION_S: 60,
    TOAST_DURATION_MS: 4000,
    COUNTDOWN_INTERVAL_MS: 1000,
    COUNTDOWN_URGENT_THRESHOLD_MS: 3600000, // 1 hour
    COUNTDOWN_CRITICAL_THRESHOLD_MS: 300000  // 5 minutes
  };

  // ============================================
  // RAFFLES WIDGET CLASS
  // ============================================

  class RafflesWidget {
    constructor(root) {
      this.root = root;

      // Prevent double initialization
      if (this.root.dataset.initialized === 'true') {
        return;
      }
      this.root.dataset.initialized = 'true';

      this.config = this.parseConfiguration();
      this.state = {
        isLoading: false,
        data: null,
        error: null,
        lastFetch: null,
        dataSource: null,
        quantities: {},   // { raffleId: number }
        purchasing: {}    // { raffleId: boolean }
      };
      this.countdownIntervals = {};
      this.toastTimeout = null;
      this._listenersAttached = false;

      this.initialize();
    }

    // ──────────────────────────────────────────
    // CONFIGURATION
    // ──────────────────────────────────────────

    parseConfiguration() {
      const d = this.root.dataset;

      return {
        isAuthenticated: d.state === 'authenticated',

        customer: d.state === 'authenticated' ? {
          id: d.customerId,
          email: d.customerEmail,
          name: d.customerName || 'Member',
          tags: d.customerTags ? d.customerTags.split(',').filter(Boolean) : []
        } : null,

        shop: {
          domain: d.shopDomain,
          currency: d.shopCurrency || 'USD'
        },

        api: {
          endpoint: d.apiEndpoint,
          enabled: d.enableApi !== 'false',
          cacheDuration: parseInt(d.cacheDuration) || CONFIG.DEFAULT_CACHE_DURATION_S
        },

        display: {
          heading: d.heading || 'Raffles',
          gridColumns: sanitizeNumber(d.gridColumns, 3, 1, 4),
          showImages: d.showImages !== 'false',
          showCountdown: d.showCountdown !== 'false',
          emptyMessage: d.emptyMessage || 'No raffles available right now. Check back soon!'
        },

        guest: {
          message: d.guestMessage || 'Sign in to enter raffles and win prizes!',
          ctaText: d.guestCtaText || 'Sign In',
          ctaUrl: d.guestCtaUrl || '/account/login'
        }
      };
    }

    // ──────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────

    async initialize() {
      log.info('Initializing', {
        authenticated: this.config.isAuthenticated,
        customerId: this.config.customer?.id,
        apiEnabled: this.config.api.enabled
      });

      // Set grid columns CSS variable
      this.root.style.setProperty('--rp-grid-columns', this.config.display.gridColumns);

      if (!this.config.isAuthenticated) {
        this.renderGuest();
        return;
      }

      // Check cache first
      const cachedData = this.getCachedData();
      if (cachedData) {
        log.debug('Using cached data');
        this.state.data = cachedData;
        this.state.dataSource = 'cache';
        this.renderAuthenticated();
      } else {
        this.renderLoading();
      }

      // Fetch fresh data
      if (this.config.api.enabled) {
        await this.fetchRaffles();
      }
    }

    // ──────────────────────────────────────────
    // API: FETCH WITH RETRY
    //
    // Delegates to RP.fetchWithRetry with `extractErrorMessage: true` so
    // the server-side validation message surfaces in the thrown Error
    // (e.g., "HTTP 400: Raffle entry limit reached"). Raffles originally
    // carried a custom local copy for this feature; as of rp-utils v1.1
    // the shared retry supports it via an option flag.
    // ──────────────────────────────────────────

    async fetchWithRetry(url, options) {
      return RP.fetchWithRetry(url, options, { extractErrorMessage: true });
    }

    // ──────────────────────────────────────────
    // API: FETCH RAFFLES
    // ──────────────────────────────────────────

    async fetchRaffles() {
      if (!this.config.api.endpoint || !this.config.customer?.id) {
        log.error('Missing API endpoint or customer ID', {
          endpoint: this.config.api.endpoint,
          customerId: this.config.customer?.id
        });
        this.renderError("We're having trouble loading this right now. Please refresh the page.");
        return;
      }

      this.state.isLoading = true;
      log.info('fetchRaffles started', {
        endpoint: this.config.api.endpoint,
        shop: this.config.shop.domain,
        customerId: this.config.customer.id,
        apiEnabled: this.config.api.enabled,
        origin: window.location.origin
      });

      try {
        const url = new URL(this.config.api.endpoint, window.location.origin);
        url.searchParams.append('action', 'available');
        url.searchParams.append('shop', this.config.shop.domain);
        url.searchParams.append('logged_in_customer_id', this.config.customer.id);

        log.info('Fetching raffles:', url.toString());

        const response = await this.fetchWithRetry(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });

        const data = await response.json();
        log.info('Response received', {
          success: data.success,
          enabled: data.enabled,
          count: data.raffles?.length,
          pointsBalance: data.pointsBalance,
          isAuthenticated: data.isAuthenticated,
          error: data.error,
          message: data.message
        });

        if (!data.success) {
          throw new Error(data.message || "We couldn't load the raffles. Try again in a moment.");
        }

        this.state.data = data;
        this.state.error = null;
        this.state.lastFetch = Date.now();
        this.state.dataSource = 'fresh';

        this.cacheData(data);
        this.renderAuthenticated();

      } catch (error) {
        log.error('Fetch error:', error.message, {
          name: error.name,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
          config: {
            endpoint: this.config.api.endpoint,
            shop: this.config.shop.domain,
            customerId: this.config.customer?.id,
          }
        });

        // Try stale cache on error
        const cachedData = this.getCachedData();
        if (cachedData) {
          log.warn('Using stale cache after error');
          this.state.data = cachedData;
          this.state.dataSource = 'cache-stale';
          this.renderAuthenticated();
        } else {
          log.error('No cache available, showing error state');
          this.state.error = error.message;
          this.renderError(error.name === 'AbortError' ? "We're slow today — try again in a moment." : error.message);
        }
      } finally {
        this.state.isLoading = false;
      }
    }

    // ──────────────────────────────────────────
    // API: PURCHASE ENTRIES
    // ──────────────────────────────────────────

    async purchaseEntries(raffleId, quantity) {
      if (this.state.purchasing[raffleId]) return;

      this.state.purchasing[raffleId] = true;
      this.updateCardButtonState(raffleId, true);

      try {
        const url = new URL(this.config.api.endpoint, window.location.origin);

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
            intent: 'purchase',
            raffleId: raffleId,
            quantity: quantity,
            logged_in_customer_id: this.config.customer.id,
            shop: this.config.shop.domain
          })
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();

        if (!data.success) {
          const serverError = data.error || data.message || 'Purchase failed';
          log.error('Purchase rejected by server:', { success: data.success, error: data.error, message: data.message, status: response.status });
          throw new Error(serverError);
        }

        // Update local state from response
        if (data.newBalance !== undefined) {
          this.state.data.pointsBalance = data.newBalance;
        }

        // Update raffle entry count locally
        const raffle = this.findRaffle(raffleId);
        if (raffle && data.newEntryCount !== undefined) {
          raffle.customerEntries = data.newEntryCount;
        }
        if (raffle && data.totalEntries !== undefined) {
          raffle.totalEntries = data.totalEntries;
        }

        // Reset quantity to 1
        this.state.quantities[raffleId] = 1;

        // Update just the affected card and header balance
        this.updateCardAfterPurchase(raffleId);
        this.updateBalanceDisplay();

        // Cache updated data
        this.cacheData(this.state.data);

        // Show success toast
        const bonuses = data.bonuses || [];
        this.showToast(
          `${quantity} entr${quantity === 1 ? 'y' : 'ies'} purchased!`,
          'success',
          bonuses
        );

      } catch (error) {
        log.error('Purchase error:', error.message, { raffleId, quantity, stack: error.stack });
        this.showToast(error.message || 'Purchase failed', 'error');
      } finally {
        this.state.purchasing[raffleId] = false;
        this.updateCardButtonState(raffleId, false);
      }
    }

    // ──────────────────────────────────────────
    // API: CLAIM FREE ENTRY
    // ──────────────────────────────────────────

    async claimFreeEntry(raffleId) {
      if (this.state.purchasing[raffleId]) return;

      this.state.purchasing[raffleId] = true;
      this.updateCardButtonState(raffleId, true);

      try {
        const url = new URL(this.config.api.endpoint, window.location.origin);

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
            intent: 'free-entry',
            raffleId: raffleId,
            logged_in_customer_id: this.config.customer.id,
            shop: this.config.shop.domain
          })
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();

        if (!data.success) {
          const serverError = data.error || data.message || "We couldn't claim your free entry. Try again in a moment.";
          log.error('Free entry rejected by server:', { success: data.success, error: data.error, message: data.message, status: response.status });
          throw new Error(serverError);
        }

        // Update local state
        const raffle = this.findRaffle(raffleId);
        if (raffle) {
          raffle.freeEntryAvailable = false;
          if (data.newEntryCount !== undefined) {
            raffle.customerEntries = data.newEntryCount;
          }
          if (data.totalEntries !== undefined) {
            raffle.totalEntries = data.totalEntries;
          }
        }

        this.updateCardAfterPurchase(raffleId);
        this.cacheData(this.state.data);
        this.showToast('Free entry claimed!', 'success');

      } catch (error) {
        log.error('Free entry error:', error.message, { raffleId, stack: error.stack });
        this.showToast(error.message || "We couldn't claim your free entry. Try again in a moment.", 'error');
      } finally {
        this.state.purchasing[raffleId] = false;
        this.updateCardButtonState(raffleId, false);
      }
    }

    // ──────────────────────────────────────────
    // CACHE LAYER (delegates to RP.cache — shop + customer scoped)
    // ──────────────────────────────────────────

    cacheKeyParts() {
      return ['raffles', this.config.shop.domain, this.config.customer && this.config.customer.id];
    }

    getCachedData() {
      if (!this.config.customer || !this.config.customer.id) return null;
      return RP.cache.read(this.cacheKeyParts(), this.config.api.cacheDuration);
    }

    cacheData(data) {
      if (!this.config.customer || !this.config.customer.id) return;
      RP.cache.write(this.cacheKeyParts(), data);
    }

    clearCache() {
      if (!this.config.customer || !this.config.customer.id) return;
      RP.cache.bust(this.cacheKeyParts());
    }

    // ──────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────

    escapeHtml(text) {
      return RP.escapeHtml(text);
    }

    findRaffle(raffleId) {
      return this.state.data?.raffles?.find(r => r.id === raffleId) || null;
    }

    /** Delegates to RP.format.number so every widget renders counts with
     *  the same thousands-separator treatment (e.g., `1,234` on en-US). */
    formatNumber(num) {
      if (num === null || num === undefined) return '0';
      return RP.format.number(num);
    }

    formatPrizeValue(prize) {
      if (!prize || !prize.prizeType) return null;
      const val = prize.prizeValue || {};
      switch (prize.prizeType) {
        case 'DISCOUNT':
          if (val.type === 'percentage') return `${val.value}% OFF`;
          if (val.type === 'fixed') return `$${(val.value / 100).toFixed(val.value % 100 === 0 ? 0 : 2)} OFF`;
          return null;
        case 'STORE_CREDIT':
          if (val.amount != null) {
            const dollars = val.amount / 100;
            return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)} Credit`;
          }
          return null;
        case 'POINTS':
          return val.amount != null ? `${this.formatNumber(val.amount)} Points` : null;
        case 'PRODUCT':
          return 'Free Product';
        case 'CUSTOM':
        default:
          return null;
      }
    }

    prizeTypeBadgeLabel(prizeType) {
      switch (prizeType) {
        case 'DISCOUNT': return 'Discount';
        case 'STORE_CREDIT': return 'Credit';
        case 'POINTS': return 'Points';
        case 'PRODUCT': return 'Product';
        case 'CUSTOM':
        default: return 'Prize';
      }
    }

    buildPrizeSectionHtml(raffle) {
      const prizes = raffle.prizes;

      // Fallback: no prizes array or empty — show trophy + raffle name (backward-compatible)
      if (!prizes || prizes.length === 0) {
        const prizeName = raffle.name;
        return `
          <div class="rp-raffle__prize">
            <svg class="rp-raffle__prize-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/>
              <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0012 0V2Z"/>
            </svg>
            <h3 class="rp-raffle__prize-name">${this.escapeHtml(prizeName)}</h3>
          </div>`;
      }

      const trophySvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2Z"/></svg>';

      // Helper: get product page URL for PRODUCT prizes with a stored handle
      const getProductUrl = (prize) => {
        if (prize.prizeType === 'PRODUCT' && prize.prizeValue && prize.prizeValue.productHandle) {
          return '/products/' + encodeURIComponent(prize.prizeValue.productHandle);
        }
        return null;
      };

      if (prizes.length === 1) {
        // Single prize — hero layout
        const p = prizes[0];
        const remaining = p.quantity - p.quantityWon;
        const valueLabel = this.formatPrizeValue(p);
        const badgeLabel = this.prizeTypeBadgeLabel(p.prizeType);
        const badgeType = (p.prizeType || 'custom').toLowerCase();
        const productUrl = getProductUrl(p);

        const thumbHtml = p.imageUrl
          ? `<img class="rp-raffle__prize-thumb rp-raffle__prize-thumb--hero" src="${this.escapeHtml(p.imageUrl)}" alt="${this.escapeHtml(p.name)}" loading="lazy">`
          : `<div class="rp-raffle__prize-thumb-placeholder rp-raffle__prize-thumb-placeholder--hero">${trophySvg}</div>`;

        const nameHtml = productUrl
          ? `<a href="${this.escapeHtml(productUrl)}" class="rp-raffle__prize-link" target="_blank" rel="noopener">${this.escapeHtml(p.name)}</a>`
          : this.escapeHtml(p.name);

        return `
          <div class="rp-raffle__prizes">
            <div class="rp-raffle__prize-item rp-raffle__prize-item--hero">
              ${productUrl ? `<a href="${this.escapeHtml(productUrl)}" target="_blank" rel="noopener">${thumbHtml}</a>` : thumbHtml}
              <div class="rp-raffle__prize-item-details">
                <h3 class="rp-raffle__prize-item-name rp-raffle__prize-item-name--hero">${nameHtml}</h3>
                <div class="rp-raffle__prize-meta">
                  <span class="rp-raffle__prize-badge rp-raffle__prize-badge--${badgeType}">${this.escapeHtml(badgeLabel)}</span>
                  ${valueLabel ? `<span class="rp-raffle__prize-value">${this.escapeHtml(valueLabel)}</span>` : ''}
                  ${remaining > 0 ? `<span class="rp-raffle__prize-remaining">${remaining} left</span>` : ''}
                </div>
              </div>
            </div>
          </div>`;
      }

      // Multiple prizes — header + scrollable list
      let itemsHtml = '';
      for (const p of prizes) {
        const remaining = p.quantity - p.quantityWon;
        const valueLabel = this.formatPrizeValue(p);
        const badgeLabel = this.prizeTypeBadgeLabel(p.prizeType);
        const badgeType = (p.prizeType || 'custom').toLowerCase();
        const productUrl = getProductUrl(p);

        const thumbHtml = p.imageUrl
          ? `<img class="rp-raffle__prize-thumb" src="${this.escapeHtml(p.imageUrl)}" alt="${this.escapeHtml(p.name)}" loading="lazy">`
          : `<div class="rp-raffle__prize-thumb-placeholder">${trophySvg}</div>`;

        const nameHtml = productUrl
          ? `<a href="${this.escapeHtml(productUrl)}" class="rp-raffle__prize-link" target="_blank" rel="noopener">${this.escapeHtml(p.name)}</a>`
          : this.escapeHtml(p.name);

        itemsHtml += `
          <div class="rp-raffle__prize-item">
            ${productUrl ? `<a href="${this.escapeHtml(productUrl)}" target="_blank" rel="noopener">${thumbHtml}</a>` : thumbHtml}
            <div class="rp-raffle__prize-item-details">
              <span class="rp-raffle__prize-item-name">${nameHtml}</span>
              <div class="rp-raffle__prize-meta">
                <span class="rp-raffle__prize-badge rp-raffle__prize-badge--${badgeType}">${this.escapeHtml(badgeLabel)}</span>
                ${valueLabel ? `<span class="rp-raffle__prize-value">${this.escapeHtml(valueLabel)}</span>` : ''}
                ${remaining > 0 ? `<span class="rp-raffle__prize-remaining">${remaining} left</span>` : ''}
              </div>
            </div>
          </div>`;
      }

      return `
        <div class="rp-raffle__prizes">
          <div class="rp-raffle__prizes-header">
            ${trophySvg}
            <span>${prizes.length} Prizes</span>
          </div>
          <div class="rp-raffle__prizes-list">
            ${itemsHtml}
          </div>
        </div>`;
    }

    getRemainingEntries(raffle) {
      const max = raffle.maxEntriesPerCustomer || Infinity;
      const current = raffle.customerEntries || 0;
      return Math.max(0, max - current);
    }

    getEntryCost(raffle, quantity) {
      return (raffle.costPerEntry || 0) * (quantity || 1);
    }

    canAfford(raffle, quantity) {
      const balance = this.state.data?.pointsBalance || 0;
      return balance >= this.getEntryCost(raffle, quantity);
    }

    isRaffleEnded(raffle) {
      if (!raffle.endsAt) return false;
      return new Date(raffle.endsAt).getTime() <= Date.now();
    }

    // ──────────────────────────────────────────
    // RENDER: LOADING (SKELETON)
    // ──────────────────────────────────────────

    renderLoading() {
      const cols = this.config.display.gridColumns;
      const skeletonCount = Math.min(cols, 3);
      let skeletons = '';

      for (let i = 0; i < skeletonCount; i++) {
        const delay = i * 0.15;
        const heroHtml = this.config.display.showImages
          ? `<div class="rp-raffle-skeleton__hero">
              <div class="rp-raffle-skeleton__badge"></div>
              <div class="rp-raffle-skeleton__notch--left"></div>
              <div class="rp-raffle-skeleton__notch--right"></div>
            </div>`
          : '';

        skeletons += `
          <div class="rp-raffle-skeleton" style="animation-delay: ${delay}s">
            ${heroHtml}
            <hr class="rp-raffle-skeleton__perforation">
            <div class="rp-raffle-skeleton__body">
              <div class="rp-raffle-skeleton__prize-row">
                <div class="rp-raffle-skeleton__thumb"></div>
                <div class="rp-raffle-skeleton__prize-details">
                  <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--prize"></div>
                  <div class="rp-raffle-skeleton__meta-row">
                    <div class="rp-raffle-skeleton__badge-pill"></div>
                    <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--value"></div>
                  </div>
                </div>
              </div>
              <div class="rp-raffle-skeleton__stats-row">
                <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--stat"></div>
                <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--stat"></div>
              </div>
              <div class="rp-raffle-skeleton__bar"></div>
              <div class="rp-raffle-skeleton__cost-box">
                <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--cost-label"></div>
                <div class="rp-raffle-skeleton__line rp-raffle-skeleton__line--cost-val"></div>
              </div>
              <div class="rp-raffle-skeleton__btn"></div>
            </div>
          </div>`;
      }

      this.root.innerHTML = `
        <div class="rp-raffles__header">
          <h2 class="rp-section-title rp-raffles__heading">${this.escapeHtml(this.config.display.heading)}</h2>
          <div class="rp-raffle-skeleton__balance-pill"></div>
        </div>
        <div class="rp-raffles__grid">${skeletons}</div>
      `;
    }

    // ──────────────────────────────────────────
    // RENDER: GUEST
    // ──────────────────────────────────────────

    renderGuest() {
      const { message, ctaText, ctaUrl } = this.config.guest;
      const heading = this.config.display.heading;

      // Teaser raffle cards shown in locked state to drive sign-ups
      const teaserRaffles = [
        { icon: '🃏', name: 'Monthly Mystery Pack Raffle', cost: '100 pts', entries: '47 entered', ends: '6 days left' },
        { icon: '⭐', name: 'Rare Card Collector Prize', cost: '250 pts', entries: '23 entered', ends: '12 days left' },
        { icon: '🎁', name: 'Booster Box Bundle', cost: '500 pts', entries: '89 entered', ends: '3 days left' },
      ];

      const teaserCardsHtml = teaserRaffles.map(r => `
        <div class="rp-raffles-guest__teaser-card">
          <div class="rp-raffles-guest__teaser-icon">${r.icon}</div>
          <div class="rp-raffles-guest__teaser-body">
            <div class="rp-raffles-guest__teaser-name">${this.escapeHtml(r.name)}</div>
            <div class="rp-raffles-guest__teaser-meta">
              <span>🎟 ${this.escapeHtml(r.cost)}</span>
              <span>👥 ${this.escapeHtml(r.entries)}</span>
              <span>⏱ ${this.escapeHtml(r.ends)}</span>
            </div>
          </div>
          <div class="rp-raffles-guest__teaser-lock" aria-label="Sign in to enter">🔒</div>
        </div>`).join('');

      this.root.innerHTML = `
        <div class="rp-raffles-guest">
          <div class="rp-raffles-guest__header">
            <h2 class="rp-raffles-guest__heading">${this.escapeHtml(heading)}</h2>
            <p class="rp-raffles-guest__message">${this.escapeHtml(message)}</p>
            <a href="${this.escapeHtml(ctaUrl)}" class="rp-raffles-guest__cta">${this.escapeHtml(ctaText)}</a>
          </div>
          <div class="rp-raffles-guest__teasers" aria-label="Sample raffles" role="list">
            ${teaserCardsHtml}
          </div>
          <p class="rp-raffles-guest__note">🔒 Sign in to enter raffles with your points</p>
        </div>
      `;
    }

    // ──────────────────────────────────────────
    // RENDER: AUTHENTICATED (MAIN VIEW)
    // ──────────────────────────────────────────

    renderAuthenticated() {
      this.clearCountdowns();

      const data = this.state.data;
      if (!data) return;

      const raffles = data.raffles || [];
      const balance = data.pointsBalance || 0;
      const heading = this.config.display.heading;

      // Header with heading and balance
      let html = `
        <div class="rp-raffles__header">
          <h2 class="rp-section-title rp-raffles__heading">${this.escapeHtml(heading)}</h2>
          <div class="rp-raffles__balance" data-balance>
            <svg class="rp-raffles__balance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span data-balance-value>${this.formatNumber(balance)}</span> pts
          </div>
        </div>
      `;

      if (raffles.length === 0) {
        html += this.renderEmptyHtml();
      } else {
        html += '<div class="rp-raffles__grid">';
        for (const raffle of raffles) {
          html += this.renderRaffleCardHtml(raffle);
        }
        html += '</div>';
      }

      this.root.innerHTML = html;

      // Start countdowns for active raffles
      if (this.config.display.showCountdown) {
        for (const raffle of raffles) {
          if (raffle.endsAt && !this.isRaffleEnded(raffle)) {
            this.startCountdown(raffle.id, raffle.endsAt);
          }
        }
      }

      this.attachEventListeners();
    }

    // ──────────────────────────────────────────
    // RENDER: SINGLE RAFFLE CARD
    // ──────────────────────────────────────────

    renderRaffleCardHtml(raffle) {
      const ended = this.isRaffleEnded(raffle);
      const remaining = this.getRemainingEntries(raffle);
      const maxReached = remaining <= 0;
      const quantity = this.state.quantities[raffle.id] || 1;
      const totalCost = this.getEntryCost(raffle, quantity);
      const affordable = this.canAfford(raffle, quantity);
      const hasFreeEntry = raffle.freeEntryAvailable && !ended;
      const isPurchasing = this.state.purchasing[raffle.id] || false;

      let modifiers = '';
      if (ended) modifiers += ' rp-raffle--ended';
      if (maxReached) modifiers += ' rp-raffle--max-reached';
      if (hasFreeEntry) modifiers += ' rp-raffle--free-entry';

      // Badge (top-left: LIVE / FREE ENTRY / ENDED)
      let badge = '';
      if (ended) {
        badge = '<span class="rp-raffle__badge rp-raffle__badge--ended">Ended</span>';
      } else if (hasFreeEntry) {
        badge = '<span class="rp-raffle__badge rp-raffle__badge--free">Free Entry</span>';
      } else {
        badge = '<span class="rp-raffle__badge rp-raffle__badge--active">Live</span>';
      }

      // Hero zone (image/gradient + overlay + badge + countdown + notches)
      let heroHtml = '';
      if (this.config.display.showImages) {
        const imageContent = raffle.imageUrl
          ? `<img src="${this.escapeHtml(raffle.imageUrl)}" alt="${this.escapeHtml(raffle.name)}" loading="lazy">`
          : `<div class="rp-raffle__image-placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor" width="56" height="56">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"/>
              </svg>
            </div>`;

        // Countdown overlay inside hero
        let countdownOverlay = '';
        if (this.config.display.showCountdown && raffle.endsAt && !ended) {
          countdownOverlay = `
            <div class="rp-raffle__countdown-hero" data-countdown="${raffle.id}">
              <div class="rp-raffle__countdown-label">Ends in</div>
              <div class="rp-raffle__countdown-digits">
                <div class="rp-raffle__countdown-segment">
                  <span class="rp-raffle__countdown-value" data-countdown-days="${raffle.id}">--</span>
                  <span class="rp-raffle__countdown-unit">Day</span>
                </div>
                <span class="rp-raffle__countdown-sep">:</span>
                <div class="rp-raffle__countdown-segment">
                  <span class="rp-raffle__countdown-value" data-countdown-hours="${raffle.id}">--</span>
                  <span class="rp-raffle__countdown-unit">Hr</span>
                </div>
                <span class="rp-raffle__countdown-sep">:</span>
                <div class="rp-raffle__countdown-segment">
                  <span class="rp-raffle__countdown-value" data-countdown-minutes="${raffle.id}">--</span>
                  <span class="rp-raffle__countdown-unit">Min</span>
                </div>
                <span class="rp-raffle__countdown-sep">:</span>
                <div class="rp-raffle__countdown-segment">
                  <span class="rp-raffle__countdown-value" data-countdown-seconds="${raffle.id}">--</span>
                  <span class="rp-raffle__countdown-unit">Sec</span>
                </div>
              </div>
            </div>`;
        }

        heroHtml = `
          <div class="rp-raffle__hero">
            ${imageContent}
            <div class="rp-raffle__hero-overlay"></div>
            ${badge}
            <div class="rp-raffle__notch--left"></div>
            <div class="rp-raffle__notch--right"></div>
            ${countdownOverlay}
          </div>`;
      }

      // Prize section — rich display with type badges, thumbnails, values
      const prizeHtml = this.buildPrizeSectionHtml(raffle);

      // Stats with icons
      const totalEntries = raffle.totalEntries || 0;
      const customerEntries = raffle.customerEntries || 0;
      const statsHtml = `
        <div class="rp-raffle__stats">
          <span class="rp-raffle__stat">
            <svg class="rp-raffle__stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            ${this.formatNumber(totalEntries)} entries
          </span>
          <span class="rp-raffle__stat rp-raffle__stat--yours">
            <svg class="rp-raffle__stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            You: ${this.formatNumber(customerEntries)}
          </span>
        </div>`;

      // Entries progress bar
      let entriesBarHtml = '';
      if (raffle.maxEntriesPerCustomer) {
        const pct = Math.min(100, Math.round((customerEntries / raffle.maxEntriesPerCustomer) * 100));
        entriesBarHtml = `
          <div class="rp-raffle__entries" data-entries="${raffle.id}">
            <div class="rp-raffle__entries-label">
              <span>Your entries</span>
              <span data-entries-text="${raffle.id}">${customerEntries} / ${raffle.maxEntriesPerCustomer}</span>
            </div>
            <div class="rp-raffle__entries-bar">
              <div class="rp-raffle__entries-fill" style="width: ${pct}%" data-entries-fill="${raffle.id}"></div>
            </div>
          </div>`;
      }

      // Cost + quantity row (combined)
      let costRowHtml = '';
      if (raffle.costPerEntry > 0 && !ended) {
        let quantityHtml = '';
        if (!maxReached && remaining > 1) {
          quantityHtml = `
            <div class="rp-raffle__quantity" data-quantity="${raffle.id}">
              <button class="rp-raffle__quantity-btn" data-action="quantity-decrease" data-raffle-id="${raffle.id}"
                      ${quantity <= 1 ? 'disabled' : ''} aria-label="Decrease quantity">\u2212</button>
              <span class="rp-raffle__quantity-val" data-quantity-val="${raffle.id}">${quantity}</span>
              <button class="rp-raffle__quantity-btn" data-action="quantity-increase" data-raffle-id="${raffle.id}"
                      ${quantity >= remaining ? 'disabled' : ''} aria-label="Increase quantity">+</button>
            </div>`;
        }

        costRowHtml = `
          <div class="rp-raffle__cost-row" data-cost="${raffle.id}">
            <div class="rp-raffle__cost-info">
              <span class="rp-raffle__cost-label">Cost</span>
              <span class="rp-raffle__cost-value" data-cost-value="${raffle.id}">${this.formatNumber(totalCost)} pts</span>
            </div>
            ${quantityHtml}
          </div>`;
      }

      // Enter button with shimmer
      let enterBtnHtml = '';
      if (!ended && !maxReached) {
        const btnDisabled = (raffle.costPerEntry > 0 && !affordable) || isPurchasing;
        const btnClass = isPurchasing ? 'rp-raffle__enter-btn rp-raffle__enter-btn--loading' : 'rp-raffle__enter-btn';
        const label = raffle.costPerEntry > 0
          ? `Enter \u2022 ${this.formatNumber(totalCost)} pts`
          : 'Enter Raffle';

        enterBtnHtml = `
          <button class="${btnClass}" data-action="purchase" data-raffle-id="${raffle.id}"
                  ${btnDisabled ? 'disabled' : ''} data-enter-btn="${raffle.id}">
            <span class="rp-raffle__enter-shimmer"></span>
            ${this.escapeHtml(label)}
          </button>`;
      } else if (maxReached && !ended) {
        enterBtnHtml = `
          <button class="rp-raffle__enter-btn" disabled>Max Entries Reached</button>`;
      }

      // Free entry button
      let freeEntryHtml = '';
      if (hasFreeEntry && !maxReached) {
        freeEntryHtml = `
          <button class="rp-raffle__free-entry" data-action="free-entry" data-raffle-id="${raffle.id}"
                  ${isPurchasing ? 'disabled' : ''} data-free-btn="${raffle.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Claim Free Entry
          </button>`;
      }

      return `
        <div class="rp-raffle${modifiers}" data-raffle-card="${raffle.id}">
          ${heroHtml}
          <hr class="rp-raffle__perforation">
          <div class="rp-raffle__body">
            ${prizeHtml}
            ${raffle.description ? `<p class="rp-raffle__description">${this.escapeHtml(raffle.description)}</p>` : ''}
            ${statsHtml}
            ${entriesBarHtml}
            ${costRowHtml}
            <div class="rp-raffle__actions">
              ${enterBtnHtml}
              ${freeEntryHtml}
            </div>
          </div>
        </div>`;
    }

    // ──────────────────────────────────────────
    // RENDER: EMPTY
    // ──────────────────────────────────────────

    renderEmptyHtml() {
      // Uses the shared `.rp-empty-state` affordance from rp-shared.css so
      // every widget's "nothing yet" moment looks the same.
      return `
        <div class="rp-raffles__empty rp-empty-state">
          <div class="rp-empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>
              <path d="M9 21V9"/>
            </svg>
          </div>
          <h3 class="rp-empty-state__title">No raffles right now</h3>
          <p class="rp-empty-state__message">${this.escapeHtml(this.config.display.emptyMessage)}</p>
        </div>`;
    }

    // ──────────────────────────────────────────
    // RENDER: ERROR
    // ──────────────────────────────────────────

    renderError(message) {
      const heading = this.config.display.heading;
      // Friendly + actionable: retry stays primary, /account gives the
      // shopper somewhere to go if the widget is stuck.
      this.root.innerHTML = `
        <div class="rp-raffles__header">
          <h2 class="rp-section-title rp-raffles__heading">${this.escapeHtml(heading)}</h2>
        </div>
        <div class="rp-raffles__grid">
          <div class="rp-raffles__error rp-empty-state" role="status">
            <div class="rp-empty-state__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 class="rp-empty-state__title">Raffles are taking a moment</h3>
            <p class="rp-empty-state__message">${this.escapeHtml(message || "We couldn't load raffles right now. Your points are safe — try again in a moment.")}</p>
            <div class="rp-empty-state__actions">
              <button class="rp-btn rp-btn--secondary" data-action="retry">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Try again
              </button>
              <a class="rp-btn-link" href="/account">View account</a>
            </div>
          </div>
        </div>
      `;

      this.attachEventListeners();
    }

    // ──────────────────────────────────────────
    // PARTIAL UPDATES (avoid full re-render)
    // ──────────────────────────────────────────

    updateCardAfterPurchase(raffleId) {
      const raffle = this.findRaffle(raffleId);
      if (!raffle) return;

      const card = this.root.querySelector(`[data-raffle-card="${raffleId}"]`);
      if (!card) {
        // Card not in DOM — full re-render
        this.renderAuthenticated();
        return;
      }

      const remaining = this.getRemainingEntries(raffle);
      const quantity = this.state.quantities[raffleId] || 1;
      const totalCost = this.getEntryCost(raffle, quantity);
      const affordable = this.canAfford(raffle, quantity);
      const customerEntries = raffle.customerEntries || 0;

      // Update stats (new structure: icon + text in each stat span)
      const statsEl = card.querySelector('.rp-raffle__stats');
      if (statsEl) {
        const stats = statsEl.querySelectorAll('.rp-raffle__stat');
        if (stats[0]) {
          const icon0 = stats[0].querySelector('.rp-raffle__stat-icon');
          const iconHtml0 = icon0 ? icon0.outerHTML : '';
          stats[0].innerHTML = `${iconHtml0} ${this.formatNumber(raffle.totalEntries || 0)} entries`;
        }
        if (stats[1]) {
          const icon1 = stats[1].querySelector('.rp-raffle__stat-icon');
          const iconHtml1 = icon1 ? icon1.outerHTML : '';
          stats[1].innerHTML = `${iconHtml1} You: ${this.formatNumber(customerEntries)}`;
        }
      }

      // Update entries bar
      const entriesText = card.querySelector(`[data-entries-text="${raffleId}"]`);
      const entriesFill = card.querySelector(`[data-entries-fill="${raffleId}"]`);
      if (entriesText && raffle.maxEntriesPerCustomer) {
        entriesText.textContent = `${customerEntries} / ${raffle.maxEntriesPerCustomer}`;
      }
      if (entriesFill && raffle.maxEntriesPerCustomer) {
        const pct = Math.min(100, Math.round((customerEntries / raffle.maxEntriesPerCustomer) * 100));
        entriesFill.style.width = `${pct}%`;
      }

      // Update cost display
      const costValue = card.querySelector(`[data-cost-value="${raffleId}"]`);
      if (costValue) {
        costValue.textContent = `${this.formatNumber(totalCost)} pts`;
      }

      // Update enter button (preserve shimmer span)
      const enterBtn = card.querySelector(`[data-enter-btn="${raffleId}"]`);
      if (enterBtn) {
        if (remaining <= 0) {
          enterBtn.disabled = true;
          enterBtn.innerHTML = 'Max Entries Reached';
          card.classList.add('rp-raffle--max-reached');
        } else {
          enterBtn.disabled = raffle.costPerEntry > 0 && !affordable;
          if (raffle.costPerEntry > 0) {
            enterBtn.innerHTML = `<span class="rp-raffle__enter-shimmer"></span>Enter \u2022 ${this.formatNumber(totalCost)} pts`;
          }
        }
      }

      // Update free entry button visibility
      const freeBtn = card.querySelector(`[data-free-btn="${raffleId}"]`);
      if (freeBtn && !raffle.freeEntryAvailable) {
        freeBtn.remove();
      }

      // Update quantity buttons
      const qtyDecBtn = card.querySelector(`[data-action="quantity-decrease"][data-raffle-id="${raffleId}"]`);
      const qtyIncBtn = card.querySelector(`[data-action="quantity-increase"][data-raffle-id="${raffleId}"]`);
      if (qtyDecBtn) qtyDecBtn.disabled = quantity <= 1;
      if (qtyIncBtn) qtyIncBtn.disabled = quantity >= remaining;

      // Remove quantity selector if remaining <= 1
      if (remaining <= 1) {
        const qtyEl = card.querySelector(`[data-quantity="${raffleId}"]`);
        if (qtyEl) qtyEl.remove();
      }
    }

    updateBalanceDisplay() {
      const balanceVal = this.root.querySelector('[data-balance-value]');
      if (balanceVal) {
        balanceVal.textContent = this.formatNumber(this.state.data?.pointsBalance || 0);
      }
    }

    updateCardButtonState(raffleId, loading) {
      const enterBtn = this.root.querySelector(`[data-enter-btn="${raffleId}"]`);
      const freeBtn = this.root.querySelector(`[data-free-btn="${raffleId}"]`);

      if (enterBtn) {
        enterBtn.classList.toggle('rp-raffle__enter-btn--loading', loading);
        enterBtn.disabled = loading;
      }
      if (freeBtn) {
        freeBtn.disabled = loading;
      }
    }

    // ──────────────────────────────────────────
    // TOAST NOTIFICATION
    // ──────────────────────────────────────────

    showToast(message, type, bonuses) {
      // Remove existing toast
      const existing = document.querySelector('.rp-raffle-toast');
      if (existing) existing.remove();
      if (this.toastTimeout) clearTimeout(this.toastTimeout);

      let bonusHtml = '';
      if (bonuses && bonuses.length > 0) {
        bonusHtml = `<span class="rp-raffle-toast__bonus">${this.escapeHtml(bonuses.join(', '))}</span>`;
      }

      const toast = document.createElement('div');
      toast.className = `rp-raffle-toast rp-raffle-toast--${type}`;
      toast.innerHTML = `${this.escapeHtml(message)}${bonusHtml}`;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);

      // Trigger show animation
      requestAnimationFrame(() => {
        toast.classList.add('rp-raffle-toast--visible');
      });

      // Auto-dismiss
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('rp-raffle-toast--visible');
        setTimeout(() => toast.remove(), 350);
      }, CONFIG.TOAST_DURATION_MS);
    }

    // ──────────────────────────────────────────
    // COUNTDOWN TIMERS
    //
    // One interval, not N. Previously each raffle card ran its own
    // setInterval(update, 1000) — a page with 12 live raffles triggered
    // 12 DOM-writing timers every second. Now a single tick walks the
    // active countdown list and updates them all at once.
    // ──────────────────────────────────────────

    startCountdown(raffleId, endsAt) {
      this.countdownIntervals[raffleId] = new Date(endsAt).getTime();
      this.tickCountdown(raffleId);     // initial paint — no 1s delay
      this.ensureCountdownPump();
    }

    stopCountdown(raffleId) {
      delete this.countdownIntervals[raffleId];
      if (Object.keys(this.countdownIntervals).length === 0) {
        this.stopCountdownPump();
      }
    }

    clearCountdowns() {
      this.countdownIntervals = {};
      this.stopCountdownPump();
    }

    /** Global 1Hz tick — re-enters once per widget instance; when the set of
     *  tracked raffles drains, the pump stops. */
    ensureCountdownPump() {
      if (this._countdownPump) return;
      this._countdownPump = setInterval(() => {
        for (const id of Object.keys(this.countdownIntervals)) {
          this.tickCountdown(id);
        }
      }, CONFIG.COUNTDOWN_INTERVAL_MS);
    }

    stopCountdownPump() {
      if (this._countdownPump) {
        clearInterval(this._countdownPump);
        this._countdownPump = null;
      }
    }

    /** Update one raffle's countdown digits + urgency classes. */
    tickCountdown(raffleId) {
      const endTime = this.countdownIntervals[raffleId];
      if (!endTime) return;

      const pad = (n) => String(n).padStart(2, '0');
      const now = Date.now();
      const diff = endTime - now;
      const wrapperEl = this.root.querySelector(`[data-countdown="${raffleId}"]`);
      const card = this.root.querySelector(`[data-raffle-card="${raffleId}"]`);

      const daysEl = this.root.querySelector(`[data-countdown-days="${raffleId}"]`);
      const hoursEl = this.root.querySelector(`[data-countdown-hours="${raffleId}"]`);
      const minutesEl = this.root.querySelector(`[data-countdown-minutes="${raffleId}"]`);
      const secondsEl = this.root.querySelector(`[data-countdown-seconds="${raffleId}"]`);

      if (!daysEl && !hoursEl) {
        // Card was re-rendered away — drop this countdown from the pump.
        this.stopCountdown(raffleId);
        return;
      }

      if (diff <= 0) {
        if (daysEl) daysEl.textContent = '00';
        if (hoursEl) hoursEl.textContent = '00';
        if (minutesEl) minutesEl.textContent = '00';
        if (secondsEl) secondsEl.textContent = '00';

        if (card) {
          card.classList.add('rp-raffle--ended');
          card.classList.remove('rp-raffle--urgent', 'rp-raffle--critical');
          const enterBtn = card.querySelector(`[data-enter-btn="${raffleId}"]`);
          if (enterBtn) enterBtn.disabled = true;
          const freeBtn = card.querySelector(`[data-free-btn="${raffleId}"]`);
          if (freeBtn) freeBtn.disabled = true;

          const badge = card.querySelector('.rp-raffle__badge');
          if (badge) {
            badge.className = 'rp-raffle__badge rp-raffle__badge--ended';
            badge.textContent = 'Ended';
          }
        }

        this.stopCountdown(raffleId);
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (daysEl) daysEl.textContent = pad(days);
      if (hoursEl) hoursEl.textContent = pad(hours);
      if (minutesEl) minutesEl.textContent = pad(minutes);
      if (secondsEl) secondsEl.textContent = pad(seconds);

      if (diff < CONFIG.COUNTDOWN_CRITICAL_THRESHOLD_MS) {
        if (wrapperEl) {
          wrapperEl.classList.remove('rp-raffle__countdown-hero--urgent');
          wrapperEl.classList.add('rp-raffle__countdown-hero--critical');
        }
        if (card) {
          card.classList.remove('rp-raffle--urgent');
          card.classList.add('rp-raffle--critical');
        }
      } else if (diff < CONFIG.COUNTDOWN_URGENT_THRESHOLD_MS) {
        if (wrapperEl) {
          wrapperEl.classList.add('rp-raffle__countdown-hero--urgent');
          wrapperEl.classList.remove('rp-raffle__countdown-hero--critical');
        }
        if (card) {
          card.classList.add('rp-raffle--urgent');
          card.classList.remove('rp-raffle--critical');
        }
      }
    }

    // ──────────────────────────────────────────
    // EVENT HANDLING (Delegated)
    // ──────────────────────────────────────────

    attachEventListeners() {
      // Guard: only attach once per widget instance (prevents stacking on re-renders)
      if (this._listenersAttached) return;
      this._listenersAttached = true;

      // Single delegated listener on root
      this.root.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const raffleId = target.dataset.raffleId;

        switch (action) {
          case 'purchase': {
            e.preventDefault();
            if (target.disabled) return;
            const qty = this.state.quantities[raffleId] || 1;
            this.purchaseEntries(raffleId, qty);
            break;
          }
          case 'free-entry': {
            e.preventDefault();
            if (target.disabled) return;
            this.claimFreeEntry(raffleId);
            break;
          }
          case 'quantity-increase': {
            e.preventDefault();
            this.updateQuantity(raffleId, 1);
            break;
          }
          case 'quantity-decrease': {
            e.preventDefault();
            this.updateQuantity(raffleId, -1);
            break;
          }
          case 'retry': {
            e.preventDefault();
            this.renderLoading();
            this.fetchRaffles();
            break;
          }
        }
      });

      // Keyboard support for action buttons
      this.root.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = e.target.closest('[data-action]');
        if (!target || target.tagName === 'BUTTON') return; // Buttons handle Enter/Space natively
        e.preventDefault();
        target.click();
      });
    }

    // ──────────────────────────────────────────
    // QUANTITY MANAGEMENT
    // ──────────────────────────────────────────

    updateQuantity(raffleId, delta) {
      const raffle = this.findRaffle(raffleId);
      if (!raffle) return;

      const remaining = this.getRemainingEntries(raffle);
      const current = this.state.quantities[raffleId] || 1;
      const newQty = Math.max(1, Math.min(remaining, current + delta));

      if (newQty === current) return;
      this.state.quantities[raffleId] = newQty;

      // Update quantity display
      const qtyVal = this.root.querySelector(`[data-quantity-val="${raffleId}"]`);
      if (qtyVal) qtyVal.textContent = newQty;

      // Update +/- button states
      const decBtn = this.root.querySelector(`[data-action="quantity-decrease"][data-raffle-id="${raffleId}"]`);
      const incBtn = this.root.querySelector(`[data-action="quantity-increase"][data-raffle-id="${raffleId}"]`);
      if (decBtn) decBtn.disabled = newQty <= 1;
      if (incBtn) incBtn.disabled = newQty >= remaining;

      // Update cost
      const totalCost = this.getEntryCost(raffle, newQty);
      const costValue = this.root.querySelector(`[data-cost-value="${raffleId}"]`);
      if (costValue) costValue.textContent = `${this.formatNumber(totalCost)} pts`;

      // Update enter button label and disabled state
      const enterBtn = this.root.querySelector(`[data-enter-btn="${raffleId}"]`);
      if (enterBtn && !this.state.purchasing[raffleId]) {
        const affordable = this.canAfford(raffle, newQty);
        enterBtn.disabled = !affordable;
        enterBtn.innerHTML = `<span class="rp-raffle__enter-shimmer"></span>Enter \u2022 ${this.formatNumber(totalCost)} pts`;
      }
    }

    // ──────────────────────────────────────────
    // CLEANUP
    // ──────────────────────────────────────────

    destroy() {
      this.clearCountdowns();
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      const toast = document.querySelector('.rp-raffle-toast');
      if (toast) toast.remove();
      this._listenersAttached = false;
      this.root.dataset.initialized = '';
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function initRaffles() {
    const roots = document.querySelectorAll('.rp-raffles-root');
    roots.forEach(root => {
      if (!root.dataset.initialized) {
        log.info('Raffles widget init');
        new RafflesWidget(root);
      }
    });
  }

  // Multiple initialization strategies
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRaffles);
  } else {
    initRaffles();
  }

  // Shopify theme editor events
  if (typeof Shopify !== 'undefined') {
    document.addEventListener('shopify:section:load', initRaffles);
    document.addEventListener('shopify:section:reorder', initRaffles);
    document.addEventListener('shopify:section:unload', (e) => {
      const roots = e.target.querySelectorAll('.rp-raffles-root[data-initialized="true"]');
      roots.forEach(root => {
        // Find and destroy the widget instance
        // Since we don't store refs globally, just clean up the DOM
        root.dataset.initialized = '';
        const toast = document.querySelector('.rp-raffle-toast');
        if (toast) toast.remove();
      });
    });
  }

})();
