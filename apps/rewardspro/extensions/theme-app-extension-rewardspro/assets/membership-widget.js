/**
 * RewardsPro Membership Widget - Dynamic Version
 * Fetches real-time customer data from proxy API
 * Handles authentication, caching, and error states
 *
 * Security: CSS injection protection via sanitizeColor/sanitizeNumber/sanitizeFontFamily
 * Performance: LocalStorage caching with shop-specific keys
 * Accessibility: Keyboard handlers on interactive elements, ARIA attributes
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION CONSTANTS
  // Document magic numbers for maintainability
  // ============================================
  const CONFIG = {
    API_TIMEOUT_MS: 10000,        // API request timeout (10 seconds)
    API_MAX_RETRIES: 3,           // Max retry attempts for failed requests
    API_RETRY_BASE_MS: 1000,      // Base delay for exponential backoff (1s)
    API_RETRY_MAX_MS: 10000,      // Max retry delay (10s)
    DEFAULT_CACHE_DURATION_S: 120, // Default cache TTL (2 minutes)
    CACHE_VERSION: 1              // Cache schema version for invalidation
  };

  // ============================================
  // DEBUG UTILITY
  // Enable via: localStorage.setItem('rp-debug', 'true')
  // ============================================
  const DEBUG = (() => {
    try {
      return localStorage.getItem('rp-debug') === 'true';
    } catch {
      return false;
    }
  })();

  const log = {
    debug: (...args) => DEBUG && console.log('[RewardsWidget]', ...args),
    info: (...args) => DEBUG && console.log('[RewardsWidget]', ...args),
    warn: (...args) => console.warn('[RewardsWidget]', ...args),
    error: (...args) => console.error('[RewardsWidget]', ...args)
  };

  // ============================================
  // SECURITY UTILITIES
  // Validates inputs to prevent XSS via CSS injection
  // ============================================

  /**
   * Validate CSS color value to prevent injection attacks
   * Only allows hex, rgb, rgba, hsl, hsla, and named colors
   */
  const isValidColor = (color) => {
    if (!color || typeof color !== 'string') return false;
    const trimmed = color.trim();
    // Hex: #RGB, #RRGGBB, #RRGGBBAA
    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return true;
    // rgb/rgba
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+)?\s*\)$/i.test(trimmed)) return true;
    // hsl/hsla
    if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*[\d.]+)?\s*\)$/i.test(trimmed)) return true;
    // Named colors (common subset)
    const namedColors = ['transparent', 'inherit', 'currentcolor', 'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey'];
    if (namedColors.includes(trimmed.toLowerCase())) return true;
    return false;
  };

  /**
   * Sanitize color value - returns validated color or default
   */
  const sanitizeColor = (color, defaultColor) => {
    return isValidColor(color) ? color.trim() : defaultColor;
  };

  /**
   * Validate numeric value within range
   */
  const sanitizeNumber = (value, defaultValue, min = 0, max = 100) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < min || num > max) return defaultValue;
    return num;
  };

  /**
   * Sanitize font family - only allows safe font values
   */
  const sanitizeFontFamily = (font, defaultFont = 'inherit') => {
    if (!font || typeof font !== 'string') return defaultFont;
    // Only allow alphanumeric, spaces, quotes, commas, hyphens
    if (!/^[a-zA-Z0-9\s'",-]+$/.test(font)) return defaultFont;
    // Block anything that looks like CSS injection
    if (/[{}:;]/.test(font)) return defaultFont;
    return font;
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
          cacheDuration: parseInt(dataset.cacheDuration) || 120 // seconds (aligned with server 60s + 30s stale-while-revalidate)
        },

        // Guest configuration
        guest: {
          message: dataset.message || '',
          ctaText: dataset.ctaText || 'Sign In',
          ctaUrl: dataset.ctaUrl || '/account/login'
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

    /**
     * FERMENTATION: Fetch with exponential backoff retry
     * The volatile Mercury spirit is multiplied through repeated cycles
     */
    async fetchWithRetry(url, options, attempt = 0) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        // Don't retry on abort or if we've exhausted retries
        if (error.name === 'AbortError' || attempt >= CONFIG.API_MAX_RETRIES - 1) {
          throw error;
        }

        // Calculate exponential backoff delay: 1s, 2s, 4s... capped at 10s
        const delay = Math.min(
          CONFIG.API_RETRY_BASE_MS * Math.pow(2, attempt),
          CONFIG.API_RETRY_MAX_MS
        );

        log.debug(`Retry ${attempt + 1}/${CONFIG.API_MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.fetchWithRetry(url, options, attempt + 1);
      }
    }

    /**
     * Fetch real customer data from proxy API
     */
    async fetchCustomerData() {
      log.debug('fetchCustomerData called');

      if (!this.config.api.endpoint || !this.config.customer?.id) {
        log.error('Missing API endpoint or customer ID');
        this.handleError('Configuration error');
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
          this.handleError('Request timed out');
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

    /**
     * MULTIPLICATION: Get cached data if available, fresh, and correct version
     * The fixed Salt body is multiplied to preserve across transformations
     */
    getCachedData() {
      if (!this.config.customer?.id) return null;

      try {
        // SECURITY: Include shop domain in cache key to prevent cross-shop data leakage
        const key = `rp-widget-${this.config.shop.domain}-${this.config.customer.id}`;
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        const { data, timestamp, version } = JSON.parse(cached);

        // MULTIPLICATION: Invalidate cache if version mismatch (schema changed)
        if (version !== CONFIG.CACHE_VERSION) {
          log.debug('Cache version mismatch, invalidating (cached:', version, 'current:', CONFIG.CACHE_VERSION, ')');
          this.clearCache();
          return null;
        }

        const age = (Date.now() - timestamp) / 1000; // Age in seconds

        // Check if cache is still fresh
        if (age < this.config.api.cacheDuration) {
          log.debug('Cache hit (age: ' + Math.round(age) + 's, version:', version, ')');
          return data;
        }

        log.debug('Cache expired (age: ' + Math.round(age) + 's)');
        return null;

      } catch (error) {
        log.error('Cache read error:', error.message);
        // Clear corrupted cache
        try {
          localStorage.removeItem(`rp-widget-${this.config.shop.domain}-${this.config.customer.id}`);
        } catch (e) {}
        return null;
      }
    }

    /**
     * MULTIPLICATION: Cache data with timestamp and version
     * The Salt preserves the essence for future transformations
     */
    cacheData(data) {
      if (!this.config.customer?.id) return;

      try {
        // SECURITY: Include shop domain in cache key to prevent cross-shop data leakage
        const key = `rp-widget-${this.config.shop.domain}-${this.config.customer.id}`;
        const cache = {
          data: data,
          timestamp: Date.now(),
          version: CONFIG.CACHE_VERSION  // MULTIPLICATION: Version for future invalidation
        };
        localStorage.setItem(key, JSON.stringify(cache));
        log.debug('Data cached (version:', CONFIG.CACHE_VERSION, ')');
      } catch (error) {
        log.error('Cache write error:', error.message);
      }
    }

    /**
     * Clear cached data for current customer
     */
    clearCache() {
      if (!this.config.customer?.id) return;

      try {
        const key = `rp-widget-${this.config.shop.domain}-${this.config.customer.id}`;
        localStorage.removeItem(key);
        log.debug('Cache cleared');
      } catch (error) {
        log.error('Cache clear error:', error.message);
      }
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
              <h3 class="rp-auth__title">Rewards</h3>
              <p class="rp-auth__subtitle">Temporarily unavailable</p>
            </div>
            <div class="rp-auth__actions">
              <button class="rp-auth__toggle" aria-label="${this.state.isExpanded ? 'Collapse' : 'Expand'} widget">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rp-auth__body">
            <div class="rp-unavailable">
              <p class="rp-unavailable__message">
                We couldn't load your rewards data right now.
                Your rewards are still safe - please try again.
              </p>
              <button class="rp-unavailable__retry rp-btn-secondary" data-retry="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Try Again
              </button>
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
              <h3 class="rp-guest-b__title">Member Benefits</h3>
              <p class="rp-guest-b__subtitle">${escapedMessage}</p>
            </div>
            <div class="rp-guest-b__actions">
              <button class="rp-guest-b__toggle" aria-label="${this.state.isExpanded ? 'Collapse' : 'Expand'} widget">
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
                Store Credit
              </span>
              <span class="rp-guest-b__perk rp-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Tier Status
              </span>
              <span class="rp-guest-b__perk rp-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Progress
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

    renderLoading() {
      this.root.innerHTML = `
        <div class="rp-widget rp-widget--loading">
          <div class="rp-widget__content">
            <div class="rp-widget__spinner"></div>
            <p class="rp-widget__loading-text">Loading rewards...</p>
          </div>
        </div>
      `;
    }

    renderError() {
      this.root.innerHTML = `
        <div class="rp-widget rp-widget--error">
          <div class="rp-widget__content">
            <p class="rp-widget__error-message">Unable to load rewards data</p>
            <button class="rp-widget__retry rp-btn-secondary" data-retry="true">
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

      const { balance, membership, tierProgress } = this.state.data;

      const expandedClass = this.state.isExpanded ? 'rp-widget--expanded' : 'rp-widget--collapsed';

      // Pre-format values with error handling
      let tierName, cashbackPercent, storeCreditFormatted;
      try {
        tierName = this.escapeHtml(membership?.tier?.name || 'Member');
      } catch (e) {
        log.error('Error formatting tier name:', e.message);
        tierName = 'Member';
      }

      try {
        cashbackPercent = membership?.tier?.cashbackPercent ?? 0;
      } catch (e) {
        log.error('Error getting cashback percent:', e.message);
        cashbackPercent = 0;
      }

      try {
        storeCreditFormatted = this.formatCurrency(balance?.storeCredit);
      } catch (e) {
        log.error('Error formatting store credit:', e.message);
        storeCreditFormatted = '$0.00';
      }

      // Calculate tier progress values
      let progressPercent = 0;
      let nextTierName = '';
      let isMaxTier = false;
      let progressStats = '';

      try {
        if (tierProgress) {
          progressPercent = tierProgress.progressPercent || 0;
          const currentSpending = tierProgress.currentSpending || 0;
          const nextTierTarget = tierProgress.nextTierTarget || 0;
          nextTierName = tierProgress.nextTierName || '';
          isMaxTier = tierProgress.isMaxTier || false;

          // Format progress stats for display
          const currentSpendingFormatted = this.formatCurrency(currentSpending);
          const nextTierTargetFormatted = this.formatCurrency(nextTierTarget);

          progressStats = isMaxTier
            ? 'Max tier reached'
            : `${currentSpendingFormatted} / ${nextTierTargetFormatted}`;

          log.debug('Tier progress calculated', { progressPercent, nextTierName, isMaxTier });
        }
      } catch (e) {
        log.error('Error calculating tier progress:', e.message);
      }

      const authExpandedClass = this.state.isExpanded ? 'rp-auth--expanded' : 'rp-auth--collapsed';

      this.root.innerHTML = `
        <div class="rp-auth ${authExpandedClass}">
          <div class="rp-auth__header" role="button" tabindex="0" aria-expanded="${this.state.isExpanded}">
            <div class="rp-auth__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div class="rp-auth__text">
              <h3 class="rp-auth__title">${tierName}</h3>
              <p class="rp-auth__subtitle">${storeCreditFormatted} Store Credit</p>
            </div>
            <div class="rp-auth__actions">
              <button class="rp-auth__toggle" aria-label="${this.state.isExpanded ? 'Collapse' : 'Expand'} widget">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rp-auth__body">
            <!-- Variation C: Card Stack Layout -->
            <div class="rp-auth-c__balance-hero">
              <div class="rp-auth-c__balance-label">Store Credit Balance</div>
              <div class="rp-auth-c__balance-amount">${storeCreditFormatted}</div>
            </div>
            <div class="rp-auth-c__cards">
              <div class="rp-auth-c__card">
                <div class="rp-auth-c__card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <div class="rp-auth-c__card-value">${tierName}</div>
                <div class="rp-auth-c__card-label">Tier</div>
              </div>
              <div class="rp-auth-c__card">
                <div class="rp-auth-c__card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <div class="rp-auth-c__card-value">${cashbackPercent}%</div>
                <div class="rp-auth-c__card-label">Cashback</div>
              </div>
              <div class="rp-auth-c__card">
                <div class="rp-auth-c__card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20V10M18 20V4M6 20v-4"/>
                  </svg>
                </div>
                <div class="rp-auth-c__card-value">${progressPercent}%</div>
                <div class="rp-auth-c__card-label">Progress</div>
              </div>
            </div>
            <div class="rp-auth-c__progress">
              <div class="rp-auth-c__progress-header">
                <span class="rp-auth-c__progress-label">${isMaxTier ? 'Max Tier Achieved' : 'Next Tier Progress'}</span>
                <span class="rp-auth-c__progress-value">${isMaxTier ? '100%' : this.formatCurrency(amountRemaining) + ' to go'}</span>
              </div>
              <div class="rp-auth-c__progress-bar">
                <div class="rp-auth-c__progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>

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
     * Render "not found" state when customer doesn't exist in database
     */
    renderNotFound() {
      log.debug('Rendering not found state');

      this.root.innerHTML = `
        <div class="rp-widget rp-widget--not-found rp-widget--expanded">
          <div class="rp-widget__not-found-header">
            <span class="rp-widget__not-found-label">Rewards</span>
          </div>
          <div class="rp-widget__not-found">
            <div class="rp-widget__not-found-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 class="rp-widget__not-found-title">No Rewards Data Available</h3>
            <p class="rp-widget__not-found-message">
              Your rewards account hasn't been synced to the database yet.
              Please contact the store or wait for the merchant to complete customer synchronization.
            </p>
          </div>
        </div>
      `;
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
      cssVars['--rp-text-secondary'] = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
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

    /**
     * Format currency
     */
    formatCurrency(amount) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: this.config.shop.currency
        }).format(amount || 0);
      } catch (error) {
        log.error('Intl.NumberFormat failed, using fallback');
        const numericAmount = Number(amount || 0);
        if (isNaN(numericAmount)) {
          return '$0.00';
        }
        return '$' + numericAmount.toFixed(2);
      }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
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
     */
    loadExpandedState() {
      try {
        const stored = localStorage.getItem('rp-widget-expanded');
        return stored !== 'false'; // Default to true
      } catch {
        return true;
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
