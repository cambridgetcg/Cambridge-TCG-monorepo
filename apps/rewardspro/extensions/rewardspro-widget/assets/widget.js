/**
 * RewardsPro Widget - Lightweight Vanilla JavaScript Implementation
 * No frameworks, optimized for performance (<10KB minified)
 */

(function() {
  'use strict';

  // Widget Class
  class RewardsProWidget {
    constructor(config) {
      this.config = config || window.RewardsProConfig || {};
      this.state = {
        isMinimized: false,
        isLoading: false,
        data: null,
        error: null,
        retryCount: 0,
        maxRetries: 3
      };
      
      // Localization
      this.locale = this.config.shopLocale || 'en';
      this.translations = null;
      
      // Bind methods
      this.handleMinimize = this.handleMinimize.bind(this);
      this.handleMaximize = this.handleMaximize.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleRetry = this.handleRetry.bind(this);
      
      this.init();
    }

    // Initialize widget
    init() {
      // Wait for DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }

    // Setup widget
    async setup() {
      // Check if widget root exists
      const root = document.getElementById('rewardspro-widget-root');
      if (!root) {
        console.warn('RewardsPro: Widget root element not found');
        return;
      }

      // Load translations
      await this.loadTranslations();

      // Check stored state
      if (this.config.rememberState) {
        const stored = this.getStoredState();
        if (stored !== null) {
          this.state.isMinimized = stored;
        } else {
          this.state.isMinimized = this.config.startMinimized || false;
        }
      } else {
        this.state.isMinimized = this.config.startMinimized || false;
      }

      // Create widget container
      this.container = document.createElement('div');
      this.container.className = 'rp-widget-container';
      this.container.setAttribute('role', 'region');
      this.container.setAttribute('aria-label', this.t('widget.title') || 'Rewards Widget');

      // Render initial state
      if (this.state.isMinimized) {
        this.renderMinimized();
      } else {
        this.renderExpanded();
        if (this.config.customerId) {
          this.loadData();
        }
      }

      // Append to root
      root.appendChild(this.container);

      // Setup event listeners
      this.attachEventListeners();

      // Auto-hide if configured
      if (this.config.autoHideDelay > 0 && !this.state.isMinimized) {
        setTimeout(() => this.handleMinimize(), this.config.autoHideDelay * 1000);
      }
    }

    // Load translations
    async loadTranslations() {
      try {
        // Map locale codes to supported languages
        const supportedLocales = ['en', 'fr', 'es', 'de'];
        let localeCode = this.locale.toLowerCase().split('-')[0]; // e.g., 'en-US' -> 'en'
        
        if (!supportedLocales.includes(localeCode)) {
          localeCode = 'en'; // Fallback to English
        }

        // Try to load from CDN or local path
        const translationUrl = this.config.translationsUrl || 
          `/apps/rewardspro/locales/${localeCode}.json`;
        
        const response = await fetch(translationUrl);
        if (response.ok) {
          this.translations = await response.json();
        } else {
          // Fallback to embedded English translations
          this.translations = this.getDefaultTranslations();
        }
      } catch (error) {
        console.warn('RewardsPro: Failed to load translations, using defaults', error);
        this.translations = this.getDefaultTranslations();
      }
    }

    // Translation helper
    t(key, replacements = {}) {
      if (!this.translations) {
        return key;
      }

      // Navigate nested keys (e.g., 'widget.title')
      const keys = key.split('.');
      let value = this.translations;
      
      for (const k of keys) {
        value = value?.[k];
        if (!value) break;
      }

      if (typeof value !== 'string') {
        return key;
      }

      // Replace placeholders like {{amount}}
      return value.replace(/\{\{(\w+)\}\}/g, (match, placeholder) => {
        return replacements[placeholder] || match;
      });
    }

    // Default English translations (fallback)
    getDefaultTranslations() {
      return {
        widget: {
          title: 'Rewards Center',
          close: 'Close rewards widget',
          open: 'Open rewards widget',
          loading: 'Loading your rewards...',
          error: {
            title: 'Unable to load rewards data',
            retry: 'Try Again'
          },
          guest: {
            message: 'Join our rewards program and earn cashback on every purchase!',
            benefits: {
              cashback: 'Earn cashback on every order',
              tiers: 'Unlock exclusive member tiers',
              rewards: 'Get personalized rewards'
            },
            signin: 'Sign In',
            register: 'Join Now'
          },
          member: {
            balance: {
              label: 'Store Credit Balance',
              currency: '{{amount}}'
            },
            tier: {
              current: '{{tier}} Member',
              cashback: 'Earning {{rate}}% cashback',
              progress: 'Progress to {{nextTier}}',
              remaining: '{{amount}} to go'
            },
            stats: {
              earned: {
                value: '{{amount}}',
                label: 'Lifetime Earned'
              },
              spent: {
                value: '{{amount}}',
                label: 'Total Spent'
              },
              rewards: {
                value: '{{count}}',
                label: 'Rewards Available'
              }
            },
            actions: {
              dashboard: 'View Full Dashboard',
              shop: 'Continue Shopping',
              redeem: 'Redeem Rewards'
            }
          },
          accessibility: {
            minimized: 'Rewards widget minimized',
            opened: 'Rewards widget opened',
            loading: 'Loading rewards data',
            error: 'Error loading rewards'
          }
        }
      };
    }

    // Render minimized state
    renderMinimized() {
      const icon = this.getIcon();
      
      this.container.innerHTML = `
        <button 
          class="rp-widget-toggle rp-widget-minimized"
          aria-label="${this.escapeHtml(this.t('widget.open'))}"
          aria-expanded="false"
          type="button"
        >
          <span class="rp-widget-icon">${icon}</span>
        </button>
      `;

      this.container.querySelector('.rp-widget-toggle').addEventListener('click', this.handleMaximize);
    }

    // Render expanded state
    renderExpanded() {
      const isGuest = !this.config.customerId;
      
      this.container.innerHTML = `
        <div class="rp-widget-panel" role="dialog" aria-label="${this.escapeHtml(this.t('widget.title'))}">
          <div class="rp-widget-header">
            <h3 class="rp-widget-title">${this.escapeHtml(this.t('widget.title'))}</h3>
            <button 
              class="rp-widget-close"
              aria-label="${this.escapeHtml(this.t('widget.close'))}"
              type="button"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="rp-widget-content" role="main">
            ${isGuest ? this.renderGuestContent() : this.renderMemberContent()}
          </div>
        </div>
      `;

      // Attach close button handler
      const closeBtn = this.container.querySelector('.rp-widget-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', this.handleMinimize);
      }

      // Attach retry button handler if exists
      const retryBtn = this.container.querySelector('.rp-retry-button');
      if (retryBtn) {
        retryBtn.addEventListener('click', this.handleRetry);
      }

      // Focus management
      this.manageFocus();
    }

    // Render guest content
    renderGuestContent() {
      return `
        <div class="rp-guest-prompt">
          <div class="rp-guest-icon">🎁</div>
          <p class="rp-guest-message">${this.escapeHtml(this.t('widget.guest.message'))}</p>
          <div class="rp-guest-benefits">
            <div class="rp-benefit">
              <span class="rp-benefit-icon">💰</span>
              <span>${this.escapeHtml(this.t('widget.guest.benefits.cashback'))}</span>
            </div>
            <div class="rp-benefit">
              <span class="rp-benefit-icon">⭐</span>
              <span>${this.escapeHtml(this.t('widget.guest.benefits.tiers'))}</span>
            </div>
            <div class="rp-benefit">
              <span class="rp-benefit-icon">🎯</span>
              <span>${this.escapeHtml(this.t('widget.guest.benefits.rewards'))}</span>
            </div>
          </div>
          <div class="rp-button-group">
            <a href="${this.config.loginUrl}" class="rp-button rp-button-primary">
              ${this.escapeHtml(this.t('widget.guest.signin'))}
            </a>
            <a href="${this.config.registerUrl}" class="rp-button rp-button-secondary">
              ${this.escapeHtml(this.t('widget.guest.register'))}
            </a>
          </div>
        </div>
      `;
    }

    // Render member content
    renderMemberContent() {
      if (this.state.isLoading) {
        return this.renderLoading();
      }

      if (this.state.error) {
        return this.renderError();
      }

      if (this.state.data) {
        return this.renderRewardsData();
      }

      return this.renderLoading();
    }

    // Render loading state
    renderLoading() {
      return `
        <div class="rp-loading" role="status" aria-live="polite">
          <div class="rp-spinner" aria-hidden="true"></div>
          <p>${this.escapeHtml(this.t('widget.loading'))}</p>
        </div>
      `;
    }

    // Render error state
    renderError() {
      return `
        <div class="rp-error" role="alert">
          <div class="rp-error-icon">⚠️</div>
          <p>${this.escapeHtml(this.t('widget.error.title'))}</p>
          <button class="rp-button rp-retry-button" type="button">
            ${this.escapeHtml(this.t('widget.error.retry'))}
          </button>
        </div>
      `;
    }

    // Render rewards data
    renderRewardsData() {
      const data = this.state.data;
      
      // Ensure we have default values
      const storeCredit = data.formattedCredit || '$0.00';
      const tierName = data.tierName || 'No Tier';
      const isNoTier = tierName === 'No Tier';
      const cashbackRate = data.cashbackRate || 0;
      
      return `
        <div class="rp-rewards-info">
          <!-- Store Credit Balance -->
          <div class="rp-balance-section">
            <div class="rp-balance">
              <div class="rp-balance-label">${this.escapeHtml(this.t('widget.member.balance.label'))}</div>
              <div class="rp-balance-amount">${this.escapeHtml(storeCredit)}</div>
            </div>
          </div>
          
          <!-- Tier Information -->
          <div class="rp-tier-section">
            <div class="rp-tier-badge">
              <span class="rp-tier-icon">${this.getTierIcon(tierName)}</span>
              <span class="rp-tier-name">
                ${isNoTier 
                  ? this.escapeHtml(tierName) 
                  : this.escapeHtml(this.t('widget.member.tier.current', { tier: tierName }))}
              </span>
            </div>
            ${cashbackRate > 0 ? `
              <div class="rp-cashback-rate">
                ${this.escapeHtml(this.t('widget.member.tier.cashback', { rate: cashbackRate }))}
              </div>
            ` : isNoTier ? `
              <div class="rp-no-tier-message">
                Start shopping to earn rewards and unlock tiers!
              </div>
            ` : ''}
          </div>
          
          <!-- Progress to Next Tier -->
          ${data.nextTier ? `
            <div class="rp-progress-section">
              <div class="rp-progress-header">
                <span>${this.escapeHtml(this.t('widget.member.tier.progress', { nextTier: data.nextTier }))}</span>
                <span class="rp-progress-amount">${this.escapeHtml(this.t('widget.member.tier.remaining', { amount: data.progressAmount || '' }))}</span>
              </div>
              <div class="rp-progress-bar">
                <div 
                  class="rp-progress-fill" 
                  style="width: ${Math.min(100, data.progressPercent || 0)}%"
                  role="progressbar"
                  aria-valuenow="${data.progressPercent || 0}"
                  aria-valuemin="0"
                  aria-valuemax="100"
                ></div>
              </div>
            </div>
          ` : ''}
          
          <!-- Stats Grid -->
          <div class="rp-stats">
            ${data.lifetimeEarned ? `
              <div class="rp-stat">
                <span class="rp-stat-value">${this.escapeHtml(data.lifetimeEarned)}</span>
                <span class="rp-stat-label">${this.escapeHtml(this.t('widget.member.stats.earned.label'))}</span>
              </div>
            ` : ''}
            ${data.lifetimeSpent ? `
              <div class="rp-stat">
                <span class="rp-stat-value">${this.escapeHtml(data.lifetimeSpent)}</span>
                <span class="rp-stat-label">${this.escapeHtml(this.t('widget.member.stats.spent.label'))}</span>
              </div>
            ` : ''}
            ${data.availableRewards ? `
              <div class="rp-stat">
                <span class="rp-stat-value">${data.availableRewards}</span>
                <span class="rp-stat-label">${this.escapeHtml(this.t('widget.member.stats.rewards.label'))}</span>
              </div>
            ` : ''}
          </div>
          
          <!-- Action Buttons -->
          <div class="rp-actions">
            <a href="${this.config.accountUrl}" class="rp-button rp-button-primary">
              ${this.escapeHtml(this.t('widget.member.actions.dashboard'))}
            </a>
          </div>
        </div>
      `;
    }

    // Load member data
    async loadData() {
      if (this.state.isLoading) return;
      
      this.setState({ isLoading: true, error: null });
      this.updateContent();

      try {
        // Build URL with proper parameters for app proxy
        const apiUrl = new URL(this.config.membershipApiUrl || '/apps/rewardspro/membership', window.location.origin);
        
        // Add required parameters if not present
        if (!apiUrl.searchParams.has('shop') && this.config.shop) {
          apiUrl.searchParams.set('shop', this.config.shop);
        }
        if (!apiUrl.searchParams.has('logged_in_customer_id') && this.config.customerId) {
          apiUrl.searchParams.set('logged_in_customer_id', this.config.customerId);
        }
        
        console.log('RewardsPro: Loading data from', apiUrl.toString());
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        // Check response type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('RewardsPro: Invalid response type:', contentType);
          throw new Error('Invalid response from server');
        }

        const data = await response.json();

        if (!response.ok) {
          console.error('RewardsPro: API error response:', data);
          throw new Error(data.error || `Unable to load rewards (${response.status})`);
        }

        // Check if login required
        if (data.requiresLogin) {
          console.log('RewardsPro: Login required');
          this.config.customerId = null;
          this.setState({ isLoading: false });
          this.renderExpanded();
          return;
        }

        // Success - ensure we have default values
        const processedData = {
          ...data,
          formattedCredit: data.formattedCredit || '$0.00',
          tierName: data.tierName || 'No Tier',
          cashbackRate: data.cashbackRate || 0,
          lifetimeEarned: data.lifetimeEarned || '$0.00',
          lifetimeSpent: data.lifetimeSpent || '$0.00'
        };
        
        console.log('RewardsPro: Data loaded successfully', processedData);
        
        this.setState({ 
          data: processedData,
          isLoading: false,
          error: null,
          retryCount: 0
        });
        this.updateContent();

      } catch (error) {
        console.error('RewardsPro: Failed to load data', error);
        this.setState({ 
          error: error.message || 'Unable to connect to rewards service',
          isLoading: false 
        });
        this.handleLoadError();
      }
    }

    // Handle load error with retry
    handleLoadError() {
      if (this.state.retryCount < this.state.maxRetries) {
        this.state.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000);
        setTimeout(() => this.loadData(), delay);
      } else {
        this.updateContent();
      }
    }

    // Update content area
    updateContent() {
      const contentArea = this.container.querySelector('.rp-widget-content');
      if (contentArea) {
        const isGuest = !this.config.customerId;
        contentArea.innerHTML = isGuest ? this.renderGuestContent() : this.renderMemberContent();
        
        // Re-attach retry button if needed
        const retryBtn = contentArea.querySelector('.rp-retry-button');
        if (retryBtn) {
          retryBtn.addEventListener('click', this.handleRetry);
        }
      }
    }

    // Event Handlers
    handleMinimize() {
      this.setState({ isMinimized: true });
      if (this.config.rememberState) {
        this.storeState(true);
      }
      this.renderMinimized();
      this.announceToScreenReader(this.t('widget.accessibility.minimized'));
    }

    handleMaximize() {
      this.setState({ isMinimized: false });
      if (this.config.rememberState) {
        this.storeState(false);
      }
      this.renderExpanded();
      if (this.config.customerId && !this.state.data) {
        this.loadData();
      }
      this.announceToScreenReader(this.t('widget.accessibility.opened'));
    }

    handleKeydown(event) {
      if (event.key === 'Escape' && !this.state.isMinimized) {
        this.handleMinimize();
      }
    }

    handleRetry() {
      this.state.retryCount = 0;
      this.loadData();
    }

    // Attach event listeners
    attachEventListeners() {
      // Keyboard navigation
      document.addEventListener('keydown', this.handleKeydown);

      // Clean up on page unload
      window.addEventListener('beforeunload', () => {
        document.removeEventListener('keydown', this.handleKeydown);
      });
    }

    // Focus management for accessibility
    manageFocus() {
      const panel = this.container.querySelector('.rp-widget-panel');
      if (!panel) return;

      // Store previously focused element
      this.previousFocus = document.activeElement;

      // Get focusable elements
      const focusableElements = panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length > 0) {
        // Focus first element
        focusableElements[0].focus();

        // Trap focus within widget
        panel.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        });
      }
    }

    // Helper Methods
    setState(updates) {
      this.state = { ...this.state, ...updates };
    }

    getStoredState() {
      try {
        const stored = sessionStorage.getItem('rp_widget_state');
        return stored === 'minimized';
      } catch (e) {
        return null;
      }
    }

    storeState(isMinimized) {
      try {
        sessionStorage.setItem('rp_widget_state', isMinimized ? 'minimized' : 'expanded');
      } catch (e) {
        // Ignore storage errors
      }
    }

    getIcon() {
      switch (this.config.iconStyle) {
        case 'svg':
          return '<svg class="rp-icon-svg" viewBox="0 0 24 24" width="24" height="24"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/></svg>';
        case 'text':
          return 'R';
        case 'emoji':
        default:
          return '🎁';
      }
    }

    getTierIcon(tierName) {
      const name = tierName.toLowerCase();
      if (name === 'no tier') return '👤'; // User icon for no tier
      if (name.includes('vip') || name.includes('diamond')) return '💎';
      if (name.includes('gold')) return '🏆';
      if (name.includes('silver')) return '🥈';
      if (name.includes('bronze')) return '🥉';
      return '⭐';
    }

    escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    announceToScreenReader(message) {
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.className = 'rp-sr-only';
      announcement.textContent = message;
      
      document.body.appendChild(announcement);
      setTimeout(() => announcement.remove(), 1000);
    }
  }

  // Initialize widget when config is ready
  function initWidget() {
    if (window.RewardsProConfig) {
      window.RewardsProWidget = new RewardsProWidget(window.RewardsProConfig);
    }
  }

  // Check if config is already available
  if (window.RewardsProConfig) {
    initWidget();
  } else {
    // Wait for config to be set
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      if (window.RewardsProConfig || checkCount++ > 20) {
        clearInterval(checkInterval);
        if (window.RewardsProConfig) {
          initWidget();
        }
      }
    }, 100);
  }

})();