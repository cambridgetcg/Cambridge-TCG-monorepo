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

      this.renderAuthenticated();
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
      const { ctaText, ctaUrl } = this.config.guest;
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
              <p class="rp-guest-b__subtitle">Sign in to view your rewards</p>
            </div>
            <button class="rp-guest-b__toggle" aria-label="${this.state.isExpanded ? 'Collapse' : 'Expand'} widget">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
          <div class="rp-guest-b__body">
            <div class="rp-guest-b__perks">
              <span class="rp-guest-b__perk">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Store Credit
              </span>
              <span class="rp-guest-b__perk">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Tier Status
              </span>
              <span class="rp-guest-b__perk">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Progress
              </span>
            </div>
            <a href="${escapedCtaUrl}" class="rp-guest-b__cta">
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

    renderAuthenticated() {
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
            <button class="rp-auth__toggle" aria-label="${this.state.isExpanded ? 'Collapse' : 'Expand'} widget">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
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
