/**
 * RewardsPro Membership Widget - Dynamic Version
 * Fetches real-time customer data from proxy API
 * Handles authentication, caching, and error states
 */

(function() {
  'use strict';

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
        dataSource: null, // 'fresh', 'cache', 'fallback'
        needsSync: false // Flag indicating customer needs database sync
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
          cacheDuration: parseInt(dataset.cacheDuration) || 300 // seconds
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
      console.log('[RewardsWidget] Initializing:', {
        authenticated: this.config.isAuthenticated,
        customerId: this.config.customer?.id,
        apiEnabled: this.config.api.enabled,
        apiEndpoint: this.config.api.endpoint
      });

      if (!this.config.isAuthenticated) {
        // Guest user - render CTA immediately
        this.renderGuest();
        return;
      }

      // Authenticated user - check for cached data first
      const cachedData = this.getCachedData();

      if (cachedData) {
        console.log('[RewardsWidget] Using cached data');
        this.state.data = cachedData;
        this.state.dataSource = 'cache';
        this.renderAuthenticated();
      } else {
        // Show loading state
        this.renderLoading();
      }

      // Fetch fresh data if API is enabled
      if (this.config.api.enabled) {
        console.log('[RewardsWidget] 🚀 API is enabled, fetching customer data...');
        await this.fetchCustomerData();
      } else {
        console.log('[RewardsWidget] ⚠️ API disabled, using fallback data');
        console.log('[RewardsWidget] Config:', this.config);
        this.useFallbackData();
      }
    }

    /**
     * Fetch real customer data from proxy API
     */
    async fetchCustomerData() {
      console.log('[RewardsWidget] 📞 fetchCustomerData called');
      console.log('[RewardsWidget] API Config:', {
        endpoint: this.config.api.endpoint,
        enabled: this.config.api.enabled,
        customerId: this.config.customer?.id,
        shopDomain: this.config.shop.domain
      });

      if (!this.config.api.endpoint || !this.config.customer?.id) {
        console.error('[RewardsWidget] ❌ Missing API endpoint or customer ID:', {
          endpoint: this.config.api.endpoint,
          customerId: this.config.customer?.id
        });
        this.handleError('Configuration error');
        return;
      }

      this.state.isLoading = true;

      try {
        // Build URL with query parameters
        const url = new URL(this.config.api.endpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customer.id);
        url.searchParams.append('shop', this.config.shop.domain);

        console.log('[RewardsWidget] 🌐 MAKING API CALL TO:', url.toString());
        console.log('[RewardsWidget] 📍 Full URL breakdown:', {
          origin: window.location.origin,
          endpoint: this.config.api.endpoint,
          fullUrl: url.toString()
        });

        // Fetch with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          signal: controller.signal,
          credentials: 'same-origin'
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log('[RewardsWidget] ✅ Response received:', data);
        console.log('[RewardsWidget] 📦 Full JSON response:', JSON.stringify(data, null, 2));
        console.log('[RewardsWidget] Response details:', {
          success: data.success,
          status: data.status,
          hasBalance: !!data.balance,
          hasMembership: !!data.membership,
          tierName: data.membership?.tier?.name,
          storeCredit: data.balance?.storeCredit,
          storeCreditType: typeof data.balance?.storeCredit,
          totalEarned: data.balance?.totalEarned,
          totalEarnedType: typeof data.balance?.totalEarned,
          cashbackPercent: data.membership?.tier?.cashbackPercent,
          cashbackPercentType: typeof data.membership?.tier?.cashbackPercent,
          needsSync: data.needsSync || false,
          query: data.query
        });

        // Handle customer not found specifically
        if (!data.success && data.status === 'customer_not_found') {
          console.log('[RewardsWidget] 📭 Customer not found in database');

          // Update state with not found info
          this.state.data = data;
          this.state.error = null;
          this.state.lastFetch = Date.now();
          this.state.dataSource = 'not_found';
          this.state.needsSync = true;

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
        this.state.needsSync = data.needsSync || false;

        // Cache the data
        this.cacheData(data);

        // Re-render with new data
        this.renderAuthenticated();

      } catch (error) {
        console.error('[RewardsWidget] Fetch error:', error);

        if (error.name === 'AbortError') {
          this.handleError('Request timed out');
        } else {
          this.handleError(error.message);
        }

        // Try to use cached data on error
        const cachedData = this.getCachedData();
        if (cachedData) {
          console.log('[RewardsWidget] Using cached data after error');
          this.state.data = cachedData;
          this.state.dataSource = 'cache-stale';
          this.renderAuthenticated(true); // Show stale indicator
        } else {
          // Use fallback data as last resort
          this.useFallbackData();
        }
      } finally {
        this.state.isLoading = false;
      }
    }

    /**
     * Get cached data if available and fresh
     */
    getCachedData() {
      if (!this.config.customer?.id) return null;

      try {
        const key = `rp-widget-${this.config.customer.id}`;
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const age = (Date.now() - timestamp) / 1000; // Age in seconds

        // Check if cache is still fresh
        if (age < this.config.api.cacheDuration) {
          console.log('[RewardsWidget] Cache is fresh (age: ' + Math.round(age) + 's)');
          return data;
        }

        console.log('[RewardsWidget] Cache expired (age: ' + Math.round(age) + 's)');
        return null;

      } catch (error) {
        console.error('[RewardsWidget] Cache read error:', error);
        // Clear corrupted cache
        try {
          localStorage.removeItem('rp-widget-' + this.config.customer.id);
        } catch (e) {}
        return null;
      }
    }

    /**
     * Cache data with timestamp
     */
    cacheData(data) {
      if (!this.config.customer?.id) return;

      try {
        const key = `rp-widget-${this.config.customer.id}`;
        const cache = {
          data: data,
          timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cache));
        console.log('[RewardsWidget] Data cached successfully');
      } catch (error) {
        console.error('[RewardsWidget] Cache write error:', error);
      }
    }

    /**
     * Use fallback data when API is unavailable
     */
    useFallbackData() {
      console.log('[RewardsWidget] Using fallback data');
      this.state.data = {
        customer: {
          id: this.config.customer.id,
          email: this.config.customer.email,
          name: this.config.customer.name
        },
        balance: {
          storeCredit: 0,
          totalEarned: 0,
          lastSynced: null
        },
        membership: {
          tier: {
            id: 'default',
            name: 'Member',
            cashbackPercent: 1
          }
        },
        tierProgress: {
          currentSpending: 0,
          nextTierTarget: 0,
          nextTierName: '',
          amountRemaining: 0,
          progressPercent: 0,
          isMaxTier: false
        }
      };
      this.state.dataSource = 'fallback';

      this.renderAuthenticated(false, true); // Show offline indicator
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

      this.root.innerHTML = `
        <div class="rp-widget rp-widget--guest">
          <div class="rp-widget__content">
            ${message ? `<p class="rp-widget__message">${this.escapeHtml(message)}</p>` : ''}
            <a href="${this.escapeHtml(ctaUrl)}" class="rp-widget__cta">
              ${this.escapeHtml(ctaText)}
            </a>
          </div>
        </div>
      `;
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
            <button class="rp-widget__retry" data-retry="true">
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

    renderAuthenticated(isStale = false, isOffline = false) {
      if (!this.state.data) {
        console.warn('[RewardsWidget] Cannot render - no data available');
        return;
      }

      console.log('[RewardsWidget] 🎨 Starting renderAuthenticated');
      console.log('[RewardsWidget] 📊 Full state.data:', JSON.stringify(this.state.data, null, 2));

      const { balance, membership, tierProgress } = this.state.data;

      console.log('[RewardsWidget] 💰 Balance object:', balance);
      console.log('[RewardsWidget] 💰 Balance.storeCredit:', balance?.storeCredit);
      console.log('[RewardsWidget] 💰 Balance.storeCredit type:', typeof balance?.storeCredit);
      console.log('[RewardsWidget] 🎖️ Membership object:', membership);
      console.log('[RewardsWidget] 🎖️ Tier object:', membership?.tier);
      console.log('[RewardsWidget] 🎖️ Tier.cashbackPercent:', membership?.tier?.cashbackPercent);
      console.log('[RewardsWidget] 🎖️ Tier.cashbackPercent type:', typeof membership?.tier?.cashbackPercent);
      console.log('[RewardsWidget] 📊 TierProgress object:', tierProgress);

      const expandedClass = this.state.isExpanded ? 'rp-widget--expanded' : 'rp-widget--collapsed';

      // Pre-format values with error handling
      let tierName, cashbackPercent, storeCreditFormatted;
      try {
        tierName = this.escapeHtml(membership?.tier?.name || 'Member');
        console.log('[RewardsWidget] 🏷️ Tier name:', tierName);
      } catch (e) {
        console.error('[RewardsWidget] ❌ Error formatting tier name:', e);
        tierName = 'Member';
      }

      try {
        cashbackPercent = membership?.tier?.cashbackPercent ?? 0;
        console.log('[RewardsWidget] 💎 Cashback percent:', cashbackPercent);
      } catch (e) {
        console.error('[RewardsWidget] ❌ Error getting cashback percent:', e);
        cashbackPercent = 0;
      }

      try {
        console.log('[RewardsWidget] 💰 About to format storeCredit:', balance?.storeCredit);
        storeCreditFormatted = this.formatCurrency(balance?.storeCredit);
        console.log('[RewardsWidget] ✅ Store credit formatted:', storeCreditFormatted);
      } catch (e) {
        console.error('[RewardsWidget] ❌ Error formatting store credit:', e);
        storeCreditFormatted = '$0.00';
      }

      // Calculate tier progress values
      let progressPercent = 0;
      let currentSpending = 0;
      let nextTierTarget = 0;
      let amountRemaining = 0;
      let nextTierName = '';
      let isMaxTier = false;
      let progressStats = '';
      let progressStatsCompact = '';

      try {
        if (tierProgress) {
          progressPercent = tierProgress.progressPercent || 0;
          currentSpending = tierProgress.currentSpending || 0;
          nextTierTarget = tierProgress.nextTierTarget || 0;
          amountRemaining = tierProgress.amountRemaining || 0;
          nextTierName = tierProgress.nextTierName || '';
          isMaxTier = tierProgress.isMaxTier || false;

          // Format progress stats for display
          const currentSpendingFormatted = this.formatCurrency(currentSpending);
          const nextTierTargetFormatted = this.formatCurrency(nextTierTarget);
          const amountRemainingFormatted = this.formatCurrency(amountRemaining);

          if (isMaxTier) {
            progressStats = 'Max tier reached';
            progressStatsCompact = 'Max tier';
          } else {
            progressStats = `${currentSpendingFormatted} / ${nextTierTargetFormatted}`;
            progressStatsCompact = `${currentSpendingFormatted} of ${nextTierTargetFormatted}`;
          }

          console.log('[RewardsWidget] 📊 Tier Progress Calculated:', {
            progressPercent,
            currentSpending,
            nextTierTarget,
            amountRemaining,
            nextTierName,
            isMaxTier,
            progressStats
          });
        } else {
          console.warn('[RewardsWidget] ⚠️ No tierProgress data available');
        }
      } catch (e) {
        console.error('[RewardsWidget] ❌ Error calculating tier progress:', e);
      }

      this.root.innerHTML = `
        <div class="rp-widget rp-widget--authenticated ${expandedClass}">
          <div class="rp-widget__header" role="button" tabindex="0" aria-expanded="${this.state.isExpanded}">
            <div class="rp-widget__header-content">
              <span class="rp-widget__tier">VIP Status</span>
            </div>
            ${this.state.isExpanded ? `
              <button class="rp-widget__toggle" aria-label="Collapse widget">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            ` : ''}
          </div>
          ${this.state.isExpanded ? `
            <div class="rp-widget__body">
              <div class="rp-layout-c">
                <div class="rp-layout-c__top-row">
                  <div class="rp-layout-c__tier-card">
                    <div class="rp-layout-c__card-content">
                      <div class="rp-layout-c__card-label">Tier</div>
                      <div class="rp-layout-c__card-value">${this.escapeHtml(membership.tier.name)}</div>
                    </div>
                  </div>
                  <div class="rp-layout-c__cashback-card">
                    <div class="rp-layout-c__card-content">
                      <div class="rp-layout-c__card-label">Rewards</div>
                      <div class="rp-layout-c__card-value">${membership.tier.cashbackPercent}%</div>
                    </div>
                  </div>
                </div>

                <div class="rp-layout-c__balance-card">
                  <div class="rp-layout-c__balance-label">Store Credit</div>
                  <div class="rp-layout-c__balance-amount">${storeCreditFormatted}</div>
                </div>

                <div class="rp-layout-c__progress-card">
                  <div class="rp-layout-c__progress-label">${isMaxTier ? 'Tier Status' : 'Next Tier Progress'}</div>
                  <div class="rp-layout-c__progress-wrapper">
                    <div class="rp-layout-c__progress-track">
                      <div class="rp-layout-c__progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="rp-layout-c__progress-percent">${progressPercent}%</div>
                  </div>
                  <div class="rp-layout-c__progress-info">
                    <span>${this.escapeHtml(progressStatsCompact)}</span>
                    <span class="rp-layout-c__progress-remaining">${isMaxTier ? 'Highest tier achieved!' : this.formatCurrency(amountRemaining) + ' remaining'}</span>
                  </div>
                </div>
              </div>

              ${isStale ? '<div class="rp-widget__indicator rp-widget__indicator--stale">Data may be outdated</div>' : ''}
              ${isOffline ? '<div class="rp-widget__indicator rp-widget__indicator--offline">Offline mode</div>' : ''}
              ${this.state.needsSync ? '<div class="rp-widget__indicator rp-widget__indicator--sync"><strong>⚠️ Data Not Synced:</strong> Your account is showing default data. The merchant needs to run customer sync from the admin panel to display your real tier and rewards.</div>' : ''}
            </div>
          ` : ''}
        </div>
      `;

      this.attachEventListeners();
    }

    /**
     * Render "not found" state when customer doesn't exist in database
     */
    renderNotFound() {
      console.log('[RewardsWidget] Rendering not found state');

      const query = this.state.data?.query || {};

      this.root.innerHTML = `
        <div class="rp-widget rp-widget--not-found rp-widget--expanded">
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
     * Format currency
     */
    formatCurrency(amount) {
      console.log('[RewardsWidget] 💵 formatCurrency called with:', {
        amount,
        type: typeof amount,
        isNull: amount === null,
        isUndefined: amount === undefined,
        orZero: amount || 0,
        currency: this.config.shop.currency
      });

      try {
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: this.config.shop.currency
        }).format(amount || 0);
        console.log('[RewardsWidget] ✅ Formatted successfully:', formatted);
        return formatted;
      } catch (error) {
        console.error('[RewardsWidget] ❌ Intl.NumberFormat failed:', error);
        console.log('[RewardsWidget] 🔄 Trying fallback formatting...');

        const fallbackAmount = amount || 0;
        console.log('[RewardsWidget] 💵 Fallback amount:', fallbackAmount, 'type:', typeof fallbackAmount);

        // Extra safety: ensure it's a number
        const numericAmount = Number(fallbackAmount);
        console.log('[RewardsWidget] 💵 Numeric amount:', numericAmount, 'type:', typeof numericAmount);

        if (isNaN(numericAmount)) {
          console.error('[RewardsWidget] ❌ Amount is NaN, returning $0.00');
          return '$0.00';
        }

        const result = '$' + numericAmount.toFixed(2);
        console.log('[RewardsWidget] ✅ Fallback formatted:', result);
        return result;
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
      console.log('[RewardsWidget] Initializing widget');
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
