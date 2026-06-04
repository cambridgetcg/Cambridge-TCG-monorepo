/**
 * RewardsPro Membership Widget
 *
 * Fetches real-time customer data from the Shopify App Proxy, caches it,
 * and renders the floating tier + store-credit badge. Serves as the
 * reference implementation for other widgets: all shared helpers
 * (sanitize, fetch+retry, cache, escapeHtml, logger) come from
 * `window.RPUtils` — loaded by the `rp_utils_loader` Liquid snippet.
 */

(function() {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Shared utilities
  // ────────────────────────────────────────────────────────────────────────
  if (!window.RPUtils || !window.RPUtils.VERSION) {
    // Fail loudly but don't crash the page. The widget simply won't render.
    console.error('[RewardsWidget] window.RPUtils is missing. Ensure the ' +
      '`rp_utils_loader` snippet is rendered before this script. See the ' +
      'extension README for details.');
    return;
  }
  var RP = window.RPUtils;
  var log = RP.logger('RewardsWidget');
  var sanitizeColor = RP.sanitize.color;
  var sanitizeNumber = RP.sanitize.number;
  var sanitizeFontFamily = RP.sanitize.fontFamily;

  // Widget-specific tuning. Anything numerical that only this widget cares
  // about lives here; shared HTTP/cache defaults come from RPUtils.
  const CONFIG = {
    DEFAULT_CACHE_DURATION_S: 30
  };

  class MembershipWidget {
    constructor(rootElement) {
      this.root = rootElement;
      this.config = this.parseConfiguration();
      this.state = {
        isExpanded: this.loadExpandedState(),
        isLoading: false,
        data: null,
        error: null,
        lastFetch: null,
        dataSource: null // 'fresh', 'cache', 'fallback'
      };

      // Prevent double initialization
      if (this.root.dataset.initialized === 'true') {
        return;
      }
      this.root.dataset.initialized = 'true';

      // Initialize based on authentication state
      this.initialize();
    }

    /**
     * Parse all configuration from data attributes
     */
    parseConfiguration() {
      const dataset = this.root.dataset;

      return {
        // Authentication state
        isAuthenticated: dataset.state === 'authenticated',

        // Customer data
        customer: dataset.state === 'authenticated' ? {
          id: dataset.customerId,
          email: dataset.customerEmail,
          name: dataset.customerName || 'Member',
          tags: dataset.customerTags ? dataset.customerTags.split(',').filter(t => t) : []
        } : null,

        // Shop data
        shop: {
          domain: dataset.shopDomain,
          currency: dataset.shopCurrency || 'USD'
        },

        // API configuration
        api: {
          endpoint: dataset.apiEndpoint,
          enabled: dataset.enableApi !== 'false',
          cacheDuration: parseInt(dataset.cacheDuration) || CONFIG.DEFAULT_CACHE_DURATION_S // seconds (30s default for fast theme updates)
        },

        // Guest configuration
        guest: {
          message: dataset.message || '',
          ctaText: dataset.ctaText || 'Sign In',
          ctaUrl: dataset.ctaUrl || '/account/login'
        },

        // i18n strings sourced from Liquid `| t` filter (data-i18n-* attrs).
        // Fallbacks match locales/en.default.json so widgets keep working on
        // Liquid templates that predate the i18n pass (or when a merchant's
        // theme strips the attributes).
        i18n: {
          loading: dataset.i18nLoading || 'Loading rewards…',
          guestFallback: dataset.i18nGuestFallback || 'Sign in to view rewards',
          unavailableTitle: dataset.i18nUnavailableTitle || 'Rewards',
          unavailableSubtitle: dataset.i18nUnavailableSubtitle || "We'll be back in a moment",
          unavailableMessage: dataset.i18nUnavailableMessage || "We couldn't reach our rewards service. Your points and credit are safe — we just need a moment to reconnect.",
          retry: dataset.i18nRetry || 'Try again',
          viewAccount: dataset.i18nViewAccount || 'View account',
          collapse: dataset.i18nCollapse || 'Collapse widget',
          expand: dataset.i18nExpand || 'Expand widget',
          memberBenefits: dataset.i18nMemberBenefits || 'Earn on every order',
          perkStoreCredit: dataset.i18nPerkStoreCredit || 'Cashback on every order',
          perkTierStatus: dataset.i18nPerkTierStatus || 'Unlock higher tiers',
          perkProgress: dataset.i18nPerkProgress || 'Track your progress',
          storeCreditBalance: dataset.i18nStoreCreditBalance || 'Your credit',
          tierLabel: dataset.i18nTierLabel || 'Tier',
          cashbackLabel: dataset.i18nCashbackLabel || 'Cashback',
          progressLabel: dataset.i18nProgressLabel || 'Progress',
          // Patterns — use interpolate() to substitute {{placeholders}}.
          cashbackRate: dataset.i18nCashbackRate || '{{percent}}% back on every order',
          creditWithRate: dataset.i18nCreditWithRate || '{{credit}} credit · {{percent}}% back',
          maxTier: dataset.i18nMaxTier || 'Max tier reached',
          maxTierTitle: dataset.i18nMaxTierTitle || '✨ Top tier',
          maxTierMessage: dataset.i18nMaxTierMessage || "You're earning the max cashback rate on every order.",
          progressUnlocks: dataset.i18nProgressUnlocks || 'Unlocks {{percent}}% back',
          notFoundTitle: dataset.i18nNotfoundTitle || 'Setting up your rewards',
          notFoundMessage: dataset.i18nNotfoundMessage || "We're getting your account ready. This usually takes a few minutes — check back soon, or get in touch with the store if you've been waiting a while."
        }
      };
    }

    /**
     * Initialize widget based on state
     */
    async initialize() {
      log.info('Initializing', {
        authenticated: this.config.isAuthenticated,
        customerId: this.config.customer?.id,
        apiEnabled: this.config.api.enabled
      });

      // PROJECTION: Initialize system theme detection
      this.initSystemThemeDetection();

      // Apply default theme immediately to ensure CSS variables are set
      // This prevents flash of unstyled content before API data arrives
      this.applyDefaultTheme();

      if (!this.config.isAuthenticated) {
        // Guest user - render CTA immediately
        this.renderGuest();
        return;
      }

      // Authenticated user - check for cached data first
      const cachedData = this.getCachedData();

      if (cachedData) {
        log.debug('Using cached data');
        this.state.data = cachedData;
        this.state.dataSource = 'cache';

        // Apply theme from cached data before rendering
        if (cachedData.theme) {
          log.debug('Applying theme from cache:', cachedData.theme.mode);
          this.applyTheme(cachedData.theme);
        }

        this.renderAuthenticated();
      } else {
        // Show loading state
        this.renderLoading();
      }

      // Fetch fresh data if API is enabled
      if (this.config.api.enabled) {
        log.debug('API enabled, fetching customer data');
        await this.fetchCustomerData();
      } else {
        log.debug('API disabled, using fallback data');
        this.useFallbackData();
      }
    }

    /**
     * PROJECTION: Detect system color scheme preference
     * The Sulfur soul projects its nature onto surrounding matter
     */
    initSystemThemeDetection() {
      try {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Store current system preference
        this.systemPrefersDark = mediaQuery.matches;
        log.debug('System prefers dark mode:', this.systemPrefersDark);

        // Listen for changes to system preference
        mediaQuery.addEventListener('change', (e) => {
          this.systemPrefersDark = e.matches;
          log.debug('System theme changed, prefers dark:', e.matches);

          // Only auto-apply if no explicit theme is set from API
          const currentTheme = this.state.data?.theme;
          if (!currentTheme?.mode || currentTheme.mode === 'SYSTEM') {
            this.applySystemTheme();
          }
        });
      } catch (error) {
        // Fallback for browsers without matchMedia support
        this.systemPrefersDark = false;
        log.debug('matchMedia not supported, defaulting to light');
      }
    }

    /**
     * Apply theme based on system preference
     */
    applySystemTheme() {
      const mode = this.systemPrefersDark ? 'DARK' : 'LIGHT';
      log.debug('Applying system theme:', mode);

      // Merge with existing theme or create minimal theme object
      const baseTheme = this.state.data?.theme || {};
      this.applyTheme({ ...baseTheme, mode });
    }

    /** Thin wrapper so callers inside the class can still do `this.fetchWithRetry(...)`.
     *  Retry + timeout + backoff logic lives in RPUtils so every widget behaves
     *  identically under flaky networks. */
    fetchWithRetry(url, options) {
      return RP.fetchWithRetry(url, options);
    }

    /**
     * Fetch real customer data from proxy API
     */
    async fetchCustomerData() {
      log.debug('fetchCustomerData called');

      if (!this.config.api.endpoint || !this.config.customer?.id) {
        log.error('Missing API endpoint or customer ID');
        this.handleError("We're having trouble loading this right now. Please refresh the page.");
        return;
      }

      this.state.isLoading = true;

      try {
        // Build URL with query parameters
        const url = new URL(this.config.api.endpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customer.id);
        url.searchParams.append('shop', this.config.shop.domain);

        log.debug('Making API call to:', url.toString());

        // FERMENTATION: Fetch with exponential backoff retry
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

        log.debug('Response received', { success: data.success, tierName: data.membership?.tier?.name });

        // Handle customer not found specifically
        if (!data.success && data.status === 'customer_not_found') {
          log.debug('Customer not found in database');

          // Update state with not found info
          this.state.data = data;
          this.state.error = null;
          this.state.lastFetch = Date.now();
          this.state.dataSource = 'not_found';

          // Render "no data" state
          this.renderNotFound();
          return;
        }

        if (!data.success) {
          throw new Error(data.message || 'API request failed');
        }

        // Update state with fresh data
        this.state.data = data;
        this.state.error = null;
        this.state.lastFetch = Date.now();
        this.state.dataSource = 'fresh';

        // Apply theme settings from API response
        if (data.theme) {
          log.debug('Applying theme from API:', data.theme.mode);
          this.applyTheme(data.theme);
        }

        // Cache the data
        this.cacheData(data);

        // Re-render with new data
        this.renderAuthenticated();

      } catch (error) {
        log.error('Fetch error:', error.message);

        if (error.name === 'AbortError') {
          this.handleError("We're slow today — try again in a moment.");
        } else {
          this.handleError(error.message);
        }

        // Try to use cached data on error
        const cachedData = this.getCachedData();
        if (cachedData) {
          log.debug('Using stale cache after error');
          this.state.data = cachedData;
          this.state.dataSource = 'cache-stale';
          this.renderAuthenticated();
        } else {
          // Use fallback data as last resort
          this.useFallbackData();
        }
      } finally {
        this.state.isLoading = false;
      }
    }

    /** Cache key parts: widget scope + shop + customer. RPUtils.cache handles
     *  the `rp:` prefix, joins the parts, and wraps/unwraps the versioned
     *  envelope. Scope prevents collisions with other widgets' caches. */
    cacheKeyParts() {
      return ['membership', this.config.shop.domain, this.config.customer && this.config.customer.id];
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

    /**
     * Use fallback when API is unavailable - show unavailable state instead of fake zeros
     * This prevents misleading customers into thinking they have no rewards
     */
    useFallbackData() {
      log.debug('API unavailable, showing unavailable state');
      this.state.data = null;
      this.state.dataSource = 'unavailable';
      this.state.error = 'Data temporarily unavailable';
      this.renderUnavailable();
    }

    /**
     * Render unavailable state when API fails and no cache exists
     * Shows a friendly message with retry option instead of misleading zeros
     */
    renderUnavailable() {
      const expandedClass = this.state.isExpanded ? 'rp-auth--expanded' : 'rp-auth--collapsed';

      const t = this.config.i18n;
      this.root.innerHTML = `
        <div class="rp-auth ${expandedClass}">
          <div class="rp-auth__header" role="button" tabindex="0" aria-expanded="${this.state.isExpanded}">
            <div class="rp-auth__icon rp-auth__icon--warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="rp-auth__text">
              <h3 class="rp-auth__title">${this.escapeHtml(t.unavailableTitle)}</h3>
              <p class="rp-auth__subtitle">${this.escapeHtml(t.unavailableSubtitle)}</p>
            </div>
            <div class="rp-auth__actions">
              <button class="rp-auth__toggle" aria-label="${this.escapeHtml(this.state.isExpanded ? t.collapse : t.expand)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rp-auth__body">
            <div class="rp-unavailable">
              <p class="rp-unavailable__message">${this.escapeHtml(t.unavailableMessage)}</p>
              <div class="rp-unavailable__actions">
                <button class="rp-unavailable__retry rp-btn rp-btn--secondary" data-retry="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                  </svg>
                  ${this.escapeHtml(t.retry)}
                </button>
                <a class="rp-btn-link" href="/account">${this.escapeHtml(t.viewAccount)}</a>
              </div>
            </div>
          </div>
        </div>
      `;

      this.attachUnavailableEventListeners();
    }

    /**
     * Attach event listeners for unavailable state
     */
    attachUnavailableEventListeners() {
      const header = this.root.querySelector('.rp-auth__header');
      const toggle = this.root.querySelector('.rp-auth__toggle');
      const retryBtn = this.root.querySelector('[data-retry]');

      const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.state.isExpanded = !this.state.isExpanded;
        this.saveExpandedState();
        this.renderUnavailable();
      };

      if (header) {
        header.addEventListener('click', handleToggle);
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e);
          }
        });
      }

      if (toggle) {
        toggle.addEventListener('click', handleToggle);
      }

      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          log.debug('User clicked retry');
          this.renderLoading();
          this.fetchCustomerData();
        });
      }
    }

    /**
     * Handle errors
     */
    handleError(message) {
      this.state.error = message;
      this.renderError();
    }

    /**
     * Render methods for different states
     */
    renderGuest() {
      const { message, ctaText, ctaUrl } = this.config.guest;
      const escapedMessage = this.escapeHtml(message || 'Sign in to view your rewards');
      const escapedCtaUrl = this.escapeHtml(ctaUrl);
      const escapedCtaText = this.escapeHtml(ctaText);
      const expandedClass = this.state.isExpanded ? 'rp-guest-b--expanded' : 'rp-guest-b--collapsed';

      const t = this.config.i18n;
      this.root.innerHTML = `
        <div class="rp-guest-b ${expandedClass}">
          <div class="rp-guest-b__header" role="button" tabindex="0" aria-expanded="${this.state.isExpanded}">
            <div class="rp-guest-b__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="5"/>
                <path d="M20 21a8 8 0 0 0-16 0"/>
              </svg>
            </div>
            <div class="rp-guest-b__text">
              <h3 class="rp-guest-b__title">${this.escapeHtml(t.memberBenefits)}</h3>
              <p class="rp-guest-b__subtitle">${escapedMessage}</p>
            </div>
            <div class="rp-guest-b__actions">
              <button class="rp-guest-b__toggle" aria-label="${this.escapeHtml(this.state.isExpanded ? t.collapse : t.expand)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rp-guest-b__body">
            <div class="rp-guest-b__perks">
              <span class="rp-guest-b__perk rp-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ${this.escapeHtml(t.perkStoreCredit)}
              </span>
              <span class="rp-guest-b__perk rp-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ${this.escapeHtml(t.perkTierStatus)}
              </span>
              <span class="rp-guest-b__perk rp-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ${this.escapeHtml(t.perkProgress)}
              </span>
            </div>
            <a href="${escapedCtaUrl}" class="rp-guest-b__cta rp-btn-primary">
              ${escapedCtaText}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
          </div>
        </div>
      `;

      this.attachGuestEventListeners();
    }

    /**
     * Attach event listeners for guest widget
     */
    attachGuestEventListeners() {
      const header = this.root.querySelector('.rp-guest-b__header');
      const toggle = this.root.querySelector('.rp-guest-b__toggle');

      const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.state.isExpanded = !this.state.isExpanded;
        this.saveExpandedState();
        this.renderGuest();
      };

      if (header) {
        header.addEventListener('click', handleToggle);
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e);
          }
        });
      }

      if (toggle) {
        toggle.addEventListener('click', handleToggle);
      }
    }

    /** Replace `{{token}}` placeholders in an i18n pattern.
     *  Keeps us out of template-literal hell while the strings stay translatable. */
    interpolate(pattern, vars) {
      var out = String(pattern || '');
      var keys = Object.keys(vars || {});
      for (var i = 0; i < keys.length; i++) {
        var re = new RegExp('\\{\\{\\s*' + keys[i] + '\\s*\\}\\}', 'g');
        out = out.replace(re, String(vars[keys[i]] == null ? '' : vars[keys[i]]));
      }
      return out;
    }

    /** Skeleton loader that matches the shape of the final content so the
     *  layout doesn't jump once data arrives. Visually communicates "I'm
     *  loading" without the old "Loading rewards…" text. */
    renderLoading() {
      var expanded = this.state.isExpanded ? 'rp-auth--expanded' : 'rp-auth--collapsed';
      this.root.innerHTML = `
        <div class="rp-auth rp-auth--skeleton ${expanded}" aria-busy="true" aria-live="polite">
          <div class="rp-auth__header">
            <div class="rp-skel rp-skel--circle rp-auth__icon"></div>
            <div class="rp-auth__text">
              <div class="rp-skel rp-skel--bar rp-skel--bar-md"></div>
              <div class="rp-skel rp-skel--bar rp-skel--bar-sm"></div>
            </div>
            <div class="rp-skel rp-skel--circle rp-skel--circle-sm rp-auth__toggle-placeholder"></div>
          </div>
          <div class="rp-auth__body">
            <div class="rp-auth-c__balance-hero">
              <div class="rp-skel rp-skel--bar rp-skel--bar-sm rp-skel--center"></div>
              <div class="rp-skel rp-skel--bar rp-skel--bar-xl rp-skel--center"></div>
            </div>
            <div class="rp-auth-c__progress">
              <div class="rp-skel rp-skel--bar rp-skel--bar-md"></div>
              <div class="rp-skel rp-skel--bar rp-skel--bar-full"></div>
            </div>
          </div>
          <span class="rp-sr-only">${this.escapeHtml(this.config.i18n.loading)}</span>
        </div>
      `;
    }

    renderError() {
      this.root.innerHTML = `
        <div class="rp-widget rp-widget--error">
          <div class="rp-widget__content">
            <p class="rp-widget__error-message">Unable to load rewards data</p>
            <button class="rp-widget__retry rp-btn rp-btn--secondary" data-retry="true">
              Try Again
            </button>
          </div>
        </div>
      `;

      // Attach retry listener
      const retryBtn = this.root.querySelector('[data-retry]');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.renderLoading();
          this.fetchCustomerData();
        });
      }
    }

    renderAuthenticated() {
      if (!this.state.data) {
        log.warn('Cannot render - no data available');
        return;
      }

      log.debug('Rendering authenticated state');

      var t = this.config.i18n;
      var data = this.state.data || {};
      var balance = data.balance || {};
      var membership = data.membership || {};
      var tierProgress = data.tierProgress || null;

      // Pre-format values defensively so a malformed field can't take out the
      // whole widget. Individual failures degrade to safe defaults.
      var tierName = 'Member';
      var cashbackPercent = 0;
      var storeCreditFormatted = this.formatCurrency(0);
      try { tierName = membership.tier && membership.tier.name ? membership.tier.name : 'Member'; } catch (e) {}
      try { cashbackPercent = (membership.tier && membership.tier.cashbackPercent) != null ? membership.tier.cashbackPercent : 0; } catch (e) {}
      try { storeCreditFormatted = this.formatCurrency(balance.storeCredit); } catch (e) {}

      // Tier progress — show when the shopper either owns the top tier or has
      // a meaningful target to aim at.
      var progressPercent = 0, nextTierName = '', nextTierCashback = null;
      var amountRemaining = 0, isMaxTier = false, showTierProgress = false;
      try {
        if (tierProgress) {
          progressPercent = tierProgress.progressPercent || 0;
          nextTierName = tierProgress.nextTierName || '';
          nextTierCashback = tierProgress.nextTierCashbackPercent != null ? tierProgress.nextTierCashbackPercent : null;
          isMaxTier = !!tierProgress.isMaxTier;
          amountRemaining = tierProgress.amountRemaining || 0;
          showTierProgress = isMaxTier || (tierProgress.nextTierTarget > 0 && nextTierName);
        }
      } catch (e) { log.error('Error calculating tier progress:', e.message); }

      // Collapsed subtitle: pack BOTH the credit balance AND the cashback
      // rate into the header so shoppers see the one number they care about
      // (their credit) without expanding. On expand, the hero below owns the
      // big balance; this subtitle becomes secondary info.
      var collapsedSubtitle = this.interpolate(t.creditWithRate, {
        credit: storeCreditFormatted,
        percent: cashbackPercent
      });

      var authExpandedClass = this.state.isExpanded ? 'rp-auth--expanded' : 'rp-auth--collapsed';
      var toggleLabel = this.state.isExpanded ? t.collapse : t.expand;

      // Progress section: either a celebratory max-tier panel or a
      // single progress bar with "X more to Tier — unlocks Y% back".
      var progressBlock = '';
      if (showTierProgress) {
        if (isMaxTier) {
          progressBlock = `
            <div class="rp-auth__maxtier" role="status">
              <span class="rp-auth__maxtier-title">${this.escapeHtml(t.maxTierTitle)}</span>
              <span class="rp-auth__maxtier-message">${this.escapeHtml(t.maxTierMessage)}</span>
            </div>`;
        } else {
          var progressLabel = this.interpolate(t.progressTo || '{{amount}} more to {{tierName}}', {
            amount: this.formatCurrency(amountRemaining),
            tierName: nextTierName
          });
          var unlocks = nextTierCashback != null
            ? this.interpolate(t.progressUnlocks, { percent: nextTierCashback })
            : '';
          progressBlock = `
            <div class="rp-auth-c__progress">
              <div class="rp-auth-c__progress-header">
                <span class="rp-auth-c__progress-label">${this.escapeHtml(progressLabel)}</span>
                ${unlocks ? `<span class="rp-auth-c__progress-value">${this.escapeHtml(unlocks)}</span>` : ''}
              </div>
              <div class="rp-auth-c__progress-bar">
                <div class="rp-auth-c__progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>`;
        }
      }

      this.root.innerHTML = `
        <div class="rp-auth ${authExpandedClass}">
          <div class="rp-auth__header" role="button" tabindex="0" aria-expanded="${this.state.isExpanded}">
            <div class="rp-auth__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div class="rp-auth__text">
              <h3 class="rp-auth__title">${this.escapeHtml(tierName)}</h3>
              <p class="rp-auth__subtitle">${this.escapeHtml(collapsedSubtitle)}</p>
            </div>
            <div class="rp-auth__actions">
              <button class="rp-auth__toggle" aria-label="${this.escapeHtml(toggleLabel)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rp-auth__body">
            <div class="rp-auth-c__balance-hero">
              <div class="rp-auth-c__balance-label">${this.escapeHtml(t.storeCreditBalance)}</div>
              <div class="rp-auth-c__balance-amount">${this.escapeHtml(storeCreditFormatted)}</div>
              <div class="rp-auth__balance-rate">${this.escapeHtml(this.interpolate(t.cashbackRate, { percent: cashbackPercent }))}</div>
            </div>
            ${progressBlock}
            ${this.renderPointsSection()}
          </div>
        </div>
      `;

      this.attachAuthEventListeners();
    }

    /**
     * Attach event listeners for authenticated widget
     */
    attachAuthEventListeners() {
      const header = this.root.querySelector('.rp-auth__header');
      const toggle = this.root.querySelector('.rp-auth__toggle');

      const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.state.isExpanded = !this.state.isExpanded;
        this.saveExpandedState();
        this.renderAuthenticated();
      };

      if (header) {
        header.addEventListener('click', handleToggle);
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e);
          }
        });
      }

      if (toggle) {
        toggle.addEventListener('click', handleToggle);
      }
    }

    /**
     * Render the Points Engagement section
     * Shows points balance, active bonuses, streak, and redemption options
     */
    renderPointsSection() {
      const points = this.state.data?.points;

      // If points not enabled or no data, return empty string
      if (!points?.enabled) {
        return '';
      }

      const { balance, currency, activeBonus, streak } = points;

      // Format points balance
      const pointsBalance = balance?.available || 0;
      const lifetimePoints = balance?.lifetime || 0;
      const currencyIcon = this.escapeHtml(currency?.icon || '⭐');
      const currencyName = this.escapeHtml(currency?.name || 'Points');

      // Build active bonus badge
      let bonusBadgeHtml = '';
      if (activeBonus?.hasBonus) {
        const multiplier = activeBonus.multiplier || 1;
        const eventName = activeBonus.eventNames?.[0] || 'Bonus Event';
        bonusBadgeHtml = `
          <div class="rp-points__bonus-badge">
            <span class="rp-points__bonus-icon">🔥</span>
            <span class="rp-points__bonus-text">${multiplier}x ${this.escapeHtml(eventName)}</span>
          </div>
        `;
      }

      // Build streak display
      let streakHtml = '';
      if (streak && streak.current > 0) {
        const streakDays = streak.current;
        const streakBonus = Math.round((streak.bonusMultiplier - 1) * 100);
        streakHtml = `
          <div class="rp-points__streak">
            <span class="rp-points__streak-icon">🔥</span>
            <span class="rp-points__streak-days">${streakDays} day streak</span>
            ${streakBonus > 0 ? `<span class="rp-points__streak-bonus">+${streakBonus}% bonus</span>` : ''}
          </div>
        `;
      }

      return `
        <div class="rp-points-section">
          <div class="rp-points__divider"></div>
          ${bonusBadgeHtml}
          <div class="rp-points__header">
            <span class="rp-points__label">${currencyName} Balance</span>
          </div>
          <div class="rp-points__balance">
            <span class="rp-points__balance-icon">${currencyIcon}</span>
            <span class="rp-points__balance-value">${RP.format.number(pointsBalance)}</span>
          </div>
          <div class="rp-points__lifetime">
            Lifetime: ${RP.format.number(lifetimePoints)} ${currencyIcon}
          </div>
          ${streakHtml}
        </div>
      `;
    }

    /**
     * Render "not found" state when customer doesn't exist in database
     */
    renderNotFound() {
      log.debug('Rendering not found state');

      const t = this.config.i18n;
      // Switched icon to an hourglass so the visual mood matches the new copy
      // ("Setting up your rewards" — an in-progress state, not an error).
      this.root.innerHTML = `
        <div class="rp-widget rp-widget--not-found rp-widget--expanded">
          <div class="rp-widget__not-found-header">
            <span class="rp-widget__not-found-label">${this.escapeHtml(t.unavailableTitle)}</span>
          </div>
          <div class="rp-widget__not-found">
            <div class="rp-widget__not-found-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 3h14M5 21h14M6 3v3a6 6 0 0 0 12 0V3M6 21v-3a6 6 0 0 1 12 0v3"/>
              </svg>
            </div>
            <h3 class="rp-widget__not-found-title">${this.escapeHtml(t.notFoundTitle)}</h3>
            <p class="rp-widget__not-found-message">${this.escapeHtml(t.notFoundMessage)}</p>
            <a class="rp-btn-link" href="/account">${this.escapeHtml(t.viewAccount)}</a>
          </div>
        </div>
      `;
    }


    /**
     * Apply default theme on initialization
     * Ensures CSS variables are set before API data arrives
     * Respects system preference for light/dark mode
     */
    applyDefaultTheme() {
      const defaultTheme = {
        mode: this.systemPrefersDark ? 'DARK' : 'LIGHT',
        primaryColor: '#5C6AC4',
        backgroundColor: '#FFFFFF',
        textColor: '#212B36',
        accentColor: '#008060',
        borderRadius: 12,
        fontFamily: 'inherit'
      };
      log.debug('Applying default theme:', defaultTheme.mode);
      this.applyTheme(defaultTheme);
    }

    /**
     * Apply theme settings from API response
     * Sets CSS custom properties on the widget root element
     * SECURITY: All color values are sanitized to prevent CSS injection
     */
    applyTheme(theme) {
      if (!theme) {
        log.warn('applyTheme called with null/undefined theme');
        return;
      }

      const root = this.root;
      if (!root) {
        log.error('Cannot apply theme - root element not found');
        return;
      }

      // PROJECTION: Resolve theme mode - use system preference if mode is 'SYSTEM' or unset
      let resolvedMode = theme.mode;
      if (!resolvedMode || resolvedMode === 'SYSTEM') {
        resolvedMode = this.systemPrefersDark ? 'DARK' : 'LIGHT';
        log.debug('Using system preference for theme:', resolvedMode);
      }

      log.debug('Applying theme:', resolvedMode);

      // SECURITY: Sanitize all color inputs to prevent CSS injection attacks
      const primaryColor = sanitizeColor(theme.primaryColor, '#5C6AC4');
      const backgroundColor = sanitizeColor(theme.backgroundColor, '#FFFFFF');
      const textColor = sanitizeColor(theme.textColor, '#212B36');
      const accentColor = sanitizeColor(theme.accentColor, '#008060');
      const borderRadius = sanitizeNumber(theme.borderRadius, 12, 0, 50);
      const fontFamily = sanitizeFontFamily(theme.fontFamily, 'inherit');

      // Apply theme colors (all values pre-validated)
      const cssVars = {
        '--rp-primary-color': primaryColor,
        '--rp-background-color': backgroundColor,
        '--rp-text-color': textColor,
        '--rp-accent-color': accentColor,
        '--rp-border-radius': borderRadius + 'px',
        '--rp-font-family': fontFamily
      };

      // Calculate derived colors based on resolved theme mode
      const isDark = resolvedMode === 'DARK';
      // Use custom secondary text color if set, otherwise auto-derive from mode
      cssVars['--rp-text-secondary'] = theme.secondaryTextColor || (isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)');
      cssVars['--rp-border-color'] = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
      cssVars['--rp-progress-bg'] = isDark ? 'rgba(255, 255, 255, 0.15)' : '#E1E3E5';
      cssVars['--rp-card-bg'] = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
      cssVars['--rp-card-hover-bg'] = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

      // Create semi-transparent version of primary color for radial gradients
      cssVars['--rp-primary-color-alpha'] = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(92, 106, 196, 0.08)';

      // Frame styling (border and shadow for widget container)
      cssVars['--rp-frame-border'] = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      cssVars['--rp-frame-shadow'] = isDark
        ? '0 4px 12px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)'
        : '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)';

      log.debug('Setting CSS variables for theme mode:', resolvedMode);

      // Apply all CSS variables
      Object.entries(cssVars).forEach(([prop, value]) => {
        root.style.setProperty(prop, value);
      });

      // Add theme mode class
      root.classList.remove('rp-theme-light', 'rp-theme-dark', 'rp-theme-custom', 'rp-theme-system');
      const themeClass = `rp-theme-${resolvedMode.toLowerCase()}`;
      root.classList.add(themeClass);

      log.debug('Theme applied:', themeClass);
    }

    /** Delegates to RP.format.currencySymbol so every widget extracts
     *  the `$` / `€` / `¥` glyph the same way. */
    getCurrencySymbol() {
      return RP.format.currencySymbol(this.config.shop.currency);
    }

    /** Delegates to RPUtils so every widget formats money the same way. */
    formatCurrency(amount) {
      return RP.format.currency(amount || 0, this.config.shop.currency, 'en-US');
    }

    /** Delegates to RPUtils.escapeHtml (textContent→innerHTML round-trip). */
    escapeHtml(text) {
      return RP.escapeHtml(text);
    }


    /**
     * Attach event listeners to widget
     */
    attachEventListeners() {
      const header = this.root.querySelector('.rp-widget__header');
      const toggle = this.root.querySelector('.rp-widget__toggle');

      if (header) {
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking the toggle button itself
          if (!e.target.closest('.rp-widget__toggle')) {
            this.toggleExpanded();
          }
        });

        // Keyboard support
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggleExpanded();
          }
        });
      }

      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleExpanded();
        });
      }

      // Add scroll detection for fade indicators
      this.attachScrollListeners();
    }


    /**
     * Attach scroll listeners for scroll indicators
     */
    attachScrollListeners() {
      const body = this.root.querySelector('.rp-widget__body');

      if (!body) return;

      const updateScrollIndicators = () => {
        const scrollTop = body.scrollTop;
        const scrollHeight = body.scrollHeight;
        const clientHeight = body.clientHeight;
        const scrollBottom = scrollHeight - scrollTop - clientHeight;

        // Add 'is-scrolled' class if scrolled from top
        if (scrollTop > 10) {
          body.classList.add('is-scrolled');
        } else {
          body.classList.remove('is-scrolled');
        }

        // Add 'has-more-content' class if there's more content below
        if (scrollBottom > 10) {
          body.classList.add('has-more-content');
        } else {
          body.classList.remove('has-more-content');
        }
      };

      // Initial check
      updateScrollIndicators();

      // Update on scroll
      body.addEventListener('scroll', updateScrollIndicators);

      // Update on resize (in case content changes)
      const resizeObserver = new ResizeObserver(() => {
        updateScrollIndicators();
      });
      resizeObserver.observe(body);

      // Store cleanup function
      this._scrollCleanup = () => {
        body.removeEventListener('scroll', updateScrollIndicators);
        resizeObserver.disconnect();
      };
    }

    /**
     * Toggle expanded/collapsed state
     */
    toggleExpanded() {
      this.state.isExpanded = !this.state.isExpanded;
      this.saveExpandedState();

      if (this.state.data) {
        this.renderAuthenticated();
      }
    }

    /**
     * Load expanded state from localStorage
     * On mobile (<768px), default to collapsed for better UX
     */
    loadExpandedState() {
      try {
        const stored = localStorage.getItem('rp-widget-expanded');
        if (stored !== null) {
          return stored !== 'false';
        }
        // No stored preference — default to collapsed on mobile
        return window.innerWidth >= 768;
      } catch {
        return window.innerWidth >= 768;
      }
    }

    /**
     * Save expanded state to localStorage
     */
    saveExpandedState() {
      try {
        localStorage.setItem('rp-widget-expanded', String(this.state.isExpanded));
      } catch (error) {
        // Silently fail if localStorage is not available
      }
    }

  }

  /**
   * Initialize widget when DOM is ready
   */
  function initWidget() {
    const root = document.getElementById('membership-widget-root');
    if (root && !root.dataset.initialized) {
      log.info('Widget init');
      new MembershipWidget(root);
    }
  }

  // Multiple initialization strategies for different scenarios
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

  // Re-initialize on Shopify theme editor events
  if (typeof Shopify !== 'undefined') {
    document.addEventListener('shopify:section:load', initWidget);
    document.addEventListener('shopify:section:reorder', initWidget);
  }
})();
