/**
 * RewardsPro Widget - DEBUG VERSION
 * Enhanced with comprehensive debugging layers to track login state and display member email
 */

(function() {
  'use strict';

  // Debug Logger
  class DebugLogger {
    constructor(enabled = true) {
      this.enabled = enabled;
      this.logs = [];
      this.maxLogs = 100;
    }

    log(level, message, data = null) {
      if (!this.enabled) return;
      
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data
      };
      
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
      
      // Console output with styling
      const styles = {
        debug: 'color: gray',
        info: 'color: blue',
        success: 'color: green',
        warn: 'color: orange',
        error: 'color: red'
      };
      
      console.log(
        `%c[RewardsPro ${level.toUpperCase()}] ${message}`,
        styles[level] || '',
        data || ''
      );
    }

    getLogs() {
      return this.logs;
    }

    exportLogs() {
      return JSON.stringify(this.logs, null, 2);
    }
  }

  // Widget Class with Enhanced Debugging
  class RewardsProWidgetDebug {
    constructor(config) {
      this.logger = new DebugLogger(true);
      this.logger.log('info', '🚀 Widget initialization started', config);
      
      this.config = config || window.RewardsProConfig || {};
      this.state = {
        isMinimized: false,
        isLoading: false,
        data: null,
        error: null,
        retryCount: 0,
        maxRetries: 3,
        // Debug specific state
        debugInfo: {
          customerDetected: false,
          customerEmail: null,
          customerId: null,
          sessionStatus: 'unknown',
          apiCalls: [],
          errors: [],
          configValidation: this.validateConfig(config)
        }
      };
      
      // Detect customer from various sources
      this.detectCustomer();
      
      // Localization
      this.locale = this.config.shopLocale || 'en';
      this.translations = null;
      
      // Bind methods
      this.handleMinimize = this.handleMinimize.bind(this);
      this.handleMaximize = this.handleMaximize.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleRetry = this.handleRetry.bind(this);
      this.toggleDebugPanel = this.toggleDebugPanel.bind(this);
      
      this.init();
    }

    // Validate configuration
    validateConfig(config) {
      const validation = {
        valid: true,
        issues: [],
        checks: {}
      };

      // Check required fields
      const requiredFields = ['shop', 'membershipApiUrl'];
      requiredFields.forEach(field => {
        validation.checks[field] = !!config[field];
        if (!config[field]) {
          validation.valid = false;
          validation.issues.push(`Missing required field: ${field}`);
        }
      });

      // Check optional fields
      const optionalFields = ['customerId', 'customerEmail', 'loginUrl', 'registerUrl', 'accountUrl'];
      optionalFields.forEach(field => {
        validation.checks[field] = config[field] || 'not set';
      });

      this.logger.log(validation.valid ? 'success' : 'warn', 'Config validation', validation);
      return validation;
    }

    // Detect customer from multiple sources
    detectCustomer() {
      this.logger.log('info', '🔍 Detecting customer...');
      
      // Check config
      if (this.config.customerId) {
        this.state.debugInfo.customerId = this.config.customerId;
        this.state.debugInfo.customerDetected = true;
        this.logger.log('success', `Customer ID found in config: ${this.config.customerId}`);
      }
      
      if (this.config.customerEmail) {
        this.state.debugInfo.customerEmail = this.config.customerEmail;
        this.logger.log('success', `Customer email found in config: ${this.config.customerEmail}`);
      }
      
      // Check Shopify customer object
      if (window.ShopifyAnalytics?.meta?.page?.customerId) {
        const shopifyCustomerId = window.ShopifyAnalytics.meta.page.customerId;
        this.state.debugInfo.customerId = shopifyCustomerId;
        this.state.debugInfo.customerDetected = true;
        this.logger.log('success', `Customer ID found in ShopifyAnalytics: ${shopifyCustomerId}`);
      }
      
      // Check meta tags
      const customerMeta = document.querySelector('meta[name="customer-id"]');
      if (customerMeta?.content) {
        this.state.debugInfo.customerId = customerMeta.content;
        this.state.debugInfo.customerDetected = true;
        this.logger.log('success', `Customer ID found in meta tag: ${customerMeta.content}`);
      }
      
      // Check __st (Shopify tracking)
      if (window.__st?.cid) {
        this.state.debugInfo.customerId = window.__st.cid;
        this.state.debugInfo.customerDetected = true;
        this.logger.log('success', `Customer ID found in __st: ${window.__st.cid}`);
      }
      
      // Log final detection status
      if (this.state.debugInfo.customerDetected) {
        this.state.debugInfo.sessionStatus = 'logged_in';
        this.logger.log('success', '✅ Customer detected - user is logged in');
      } else {
        this.state.debugInfo.sessionStatus = 'guest';
        this.logger.log('info', '👤 No customer detected - user is guest');
      }
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
      this.logger.log('info', '⚙️ Setting up widget...');
      
      // Check if widget root exists
      const root = document.getElementById('rewardspro-widget-root');
      if (!root) {
        this.logger.log('error', 'Widget root element not found!');
        this.createDebugRoot();
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
      this.container.className = 'rp-widget-container rp-debug-mode';
      this.container.setAttribute('role', 'region');
      this.container.setAttribute('aria-label', this.t('widget.title') || 'Rewards Widget');

      // Add debug panel
      this.createDebugPanel();

      // Render initial state
      if (this.state.isMinimized) {
        this.renderMinimized();
      } else {
        this.renderExpanded();
        if (this.config.customerId || this.state.debugInfo.customerId) {
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

      this.logger.log('success', '✅ Widget setup complete');
    }

    // Create debug root if missing
    createDebugRoot() {
      const debugRoot = document.createElement('div');
      debugRoot.id = 'rewardspro-widget-root';
      debugRoot.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
      `;
      document.body.appendChild(debugRoot);
      this.logger.log('warn', 'Created fallback widget root');
      this.setup();
    }

    // Create debug panel
    createDebugPanel() {
      const debugPanel = document.createElement('div');
      debugPanel.className = 'rp-debug-panel';
      debugPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: #0ff;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        max-width: 400px;
        z-index: 1000000;
        display: none;
        max-height: 80vh;
        overflow-y: auto;
      `;
      
      debugPanel.innerHTML = this.renderDebugInfo();
      document.body.appendChild(debugPanel);
      this.debugPanel = debugPanel;
    }

    // Render debug information
    renderDebugInfo() {
      const info = this.state.debugInfo;
      const config = this.config;
      
      return `
        <div style="border-bottom: 1px solid #0ff; padding-bottom: 10px; margin-bottom: 10px;">
          <h3 style="margin: 0 0 10px 0; color: #0ff;">🔧 RewardsPro Debug Panel</h3>
          <button onclick="window.RewardsProWidget.toggleDebugPanel()" style="
            background: #0ff;
            color: #000;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
          ">Close Debug</button>
        </div>
        
        <div style="margin-bottom: 15px;">
          <h4 style="color: #0ff; margin: 0 0 5px 0;">👤 Customer Status</h4>
          <div>Session: <span style="color: ${info.sessionStatus === 'logged_in' ? '#0f0' : '#ff0'}">${info.sessionStatus}</span></div>
          <div>Detected: <span style="color: ${info.customerDetected ? '#0f0' : '#f00'}">${info.customerDetected ? 'YES' : 'NO'}</span></div>
          <div>Customer ID: <span style="color: #fff">${info.customerId || 'none'}</span></div>
          <div>Email: <span style="color: #fff">${info.customerEmail || 'not available'}</span></div>
        </div>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #0ff; margin: 0 0 5px 0;">⚙️ Configuration</h4>
          <div>Shop: <span style="color: #fff">${config.shop || 'not set'}</span></div>
          <div>API URL: <span style="color: #fff">${config.membershipApiUrl || 'not set'}</span></div>
          <div>Config Valid: <span style="color: ${info.configValidation?.valid ? '#0f0' : '#f00'}">${info.configValidation?.valid ? 'YES' : 'NO'}</span></div>
          ${info.configValidation?.issues?.length > 0 ? `
            <div style="color: #ff0; margin-top: 5px;">Issues: ${info.configValidation.issues.join(', ')}</div>
          ` : ''}
        </div>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #0ff; margin: 0 0 5px 0;">📊 Widget State</h4>
          <div>Loading: <span style="color: #fff">${this.state.isLoading}</span></div>
          <div>Minimized: <span style="color: #fff">${this.state.isMinimized}</span></div>
          <div>Has Data: <span style="color: ${this.state.data ? '#0f0' : '#ff0'}">${this.state.data ? 'YES' : 'NO'}</span></div>
          <div>Has Error: <span style="color: ${this.state.error ? '#f00' : '#0f0'}">${this.state.error ? 'YES' : 'NO'}</span></div>
          ${this.state.error ? `
            <div style="color: #f00; margin-top: 5px;">Error: ${this.state.error}</div>
          ` : ''}
        </div>

        ${this.state.data ? `
          <div style="margin-bottom: 15px;">
            <h4 style="color: #0ff; margin: 0 0 5px 0;">💳 Rewards Data</h4>
            <div>Store Credit: <span style="color: #0f0">${this.state.data.formattedCredit || '$0.00'}</span></div>
            <div>Tier: <span style="color: #ff0">${this.state.data.tierName || 'No Tier'}</span></div>
            <div>Cashback Rate: <span style="color: #fff">${this.state.data.cashbackRate || 0}%</span></div>
            <div>Member Email: <span style="color: #0f0">${this.state.data.email || 'not provided'}</span></div>
            <div>Member Name: <span style="color: #fff">${this.state.data.name || 'not provided'}</span></div>
          </div>
        ` : ''}

        <div style="margin-bottom: 15px;">
          <h4 style="color: #0ff; margin: 0 0 5px 0;">🌐 API Calls</h4>
          ${info.apiCalls.length > 0 ? info.apiCalls.slice(-5).map(call => `
            <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 4px;">
              <div style="color: ${call.success ? '#0f0' : '#f00'}">${call.timestamp}</div>
              <div style="color: #fff; font-size: 10px;">${call.url}</div>
              <div style="color: ${call.success ? '#0f0' : '#f00'}">Status: ${call.status}</div>
            </div>
          `).join('') : '<div style="color: #666">No API calls yet</div>'}
        </div>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #0ff; margin: 0 0 5px 0;">🔍 Page Context</h4>
          <div>URL: <span style="color: #fff">${window.location.pathname}</span></div>
          <div>Shopify Page: <span style="color: #fff">${window.Shopify ? 'YES' : 'NO'}</span></div>
          <div>Theme: <span style="color: #fff">${window.Shopify?.theme?.name || 'unknown'}</span></div>
        </div>

        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #0ff;">
          <button onclick="window.RewardsProWidget.exportDebugData()" style="
            background: #0f0;
            color: #000;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
          ">Export Debug Data</button>
          <button onclick="window.RewardsProWidget.forceReload()" style="
            background: #ff0;
            color: #000;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
          ">Force Reload Data</button>
        </div>
      `;
    }

    // Toggle debug panel visibility
    toggleDebugPanel() {
      if (this.debugPanel) {
        const isVisible = this.debugPanel.style.display !== 'none';
        this.debugPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
          this.debugPanel.innerHTML = this.renderDebugInfo();
        }
      }
    }

    // Export debug data
    exportDebugData() {
      const debugData = {
        timestamp: new Date().toISOString(),
        config: this.config,
        state: this.state,
        logs: this.logger.getLogs(),
        pageContext: {
          url: window.location.href,
          shopify: window.Shopify || null,
          shopifyAnalytics: window.ShopifyAnalytics || null,
          __st: window.__st || null
        }
      };
      
      const dataStr = JSON.stringify(debugData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rewardspro-debug-${Date.now()}.json`;
      link.click();
      
      this.logger.log('success', 'Debug data exported');
    }

    // Force reload data
    forceReload() {
      this.logger.log('info', 'Force reloading data...');
      this.state.retryCount = 0;
      this.state.error = null;
      this.loadData();
    }

    // Load translations
    async loadTranslations() {
      try {
        this.logger.log('info', 'Loading translations...');
        
        // Map locale codes to supported languages
        const supportedLocales = ['en', 'fr', 'es', 'de'];
        let localeCode = this.locale.toLowerCase().split('-')[0];
        
        if (!supportedLocales.includes(localeCode)) {
          localeCode = 'en';
        }

        const translationUrl = this.config.translationsUrl || 
          `/apps/rewardspro/locales/${localeCode}.json`;
        
        const response = await fetch(translationUrl);
        if (response.ok) {
          this.translations = await response.json();
          this.logger.log('success', `Translations loaded for ${localeCode}`);
        } else {
          this.translations = this.getDefaultTranslations();
          this.logger.log('warn', 'Using default translations');
        }
      } catch (error) {
        this.logger.log('error', 'Failed to load translations', error);
        this.translations = this.getDefaultTranslations();
      }
    }

    // Translation helper
    t(key, replacements = {}) {
      if (!this.translations) {
        return key;
      }

      const keys = key.split('.');
      let value = this.translations;
      
      for (const k of keys) {
        value = value?.[k];
        if (!value) break;
      }

      if (typeof value !== 'string') {
        return key;
      }

      return value.replace(/\{\{(\w+)\}\}/g, (match, placeholder) => {
        return replacements[placeholder] || match;
      });
    }

    // Default English translations
    getDefaultTranslations() {
      return {
        widget: {
          title: 'Rewards Center',
          close: 'Close rewards widget',
          open: 'Open rewards widget',
          loading: 'Loading your rewards...',
          debug: {
            title: 'Debug Mode Active',
            customer: 'Customer: {{email}}',
            id: 'ID: {{id}}',
            status: 'Status: {{status}}'
          },
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
            welcome: 'Welcome back, {{name}}!',
            email: 'Logged in as: {{email}}',
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
          }
        }
      };
    }

    // Render minimized state
    renderMinimized() {
      const icon = this.getIcon();
      const debugBadge = this.state.debugInfo.customerDetected ? '🟢' : '🔴';
      
      this.container.innerHTML = `
        <button 
          class="rp-widget-toggle rp-widget-minimized"
          aria-label="${this.escapeHtml(this.t('widget.open'))}"
          aria-expanded="false"
          type="button"
        >
          <span class="rp-widget-icon">${icon}</span>
          <span class="rp-debug-badge" style="
            position: absolute;
            top: -5px;
            right: -5px;
            font-size: 10px;
          ">${debugBadge}</span>
        </button>
        <button onclick="window.RewardsProWidget.toggleDebugPanel()" style="
          position: absolute;
          top: -30px;
          right: 0;
          background: #000;
          color: #0ff;
          border: 1px solid #0ff;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
        ">DEBUG</button>
      `;

      this.container.querySelector('.rp-widget-toggle').addEventListener('click', this.handleMaximize);
    }

    // Render expanded state
    renderExpanded() {
      const isGuest = !this.config.customerId && !this.state.debugInfo.customerId;
      const debugStatus = this.state.debugInfo.customerDetected ? '🟢 Logged In' : '🔴 Guest';
      
      this.container.innerHTML = `
        <div class="rp-widget-panel" role="dialog" aria-label="${this.escapeHtml(this.t('widget.title'))}">
          <div class="rp-widget-header">
            <h3 class="rp-widget-title">${this.escapeHtml(this.t('widget.title'))}</h3>
            <span style="
              background: #000;
              color: #0ff;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              margin-left: 10px;
            ">${debugStatus}</span>
            <button 
              class="rp-widget-close"
              aria-label="${this.escapeHtml(this.t('widget.close'))}"
              type="button"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="rp-debug-bar" style="
            background: #000;
            color: #0ff;
            padding: 5px 10px;
            font-family: monospace;
            font-size: 11px;
            border-top: 1px solid #0ff;
          ">
            <div>Customer ID: ${this.state.debugInfo.customerId || 'none'}</div>
            <div>Email: ${this.state.debugInfo.customerEmail || 'detecting...'}</div>
            <button onclick="window.RewardsProWidget.toggleDebugPanel()" style="
              background: #0ff;
              color: #000;
              border: none;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              margin-top: 5px;
              cursor: pointer;
            ">Open Debug Panel</button>
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
      this.logger.log('info', 'Rendering guest content');
      
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
            <a href="${this.config.loginUrl || '/account/login'}" class="rp-button rp-button-primary">
              ${this.escapeHtml(this.t('widget.guest.signin'))}
            </a>
            <a href="${this.config.registerUrl || '/account/register'}" class="rp-button rp-button-secondary">
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
      this.logger.log('info', 'Rendering loading state');
      
      return `
        <div class="rp-loading" role="status" aria-live="polite">
          <div class="rp-spinner" aria-hidden="true"></div>
          <p>${this.escapeHtml(this.t('widget.loading'))}</p>
        </div>
      `;
    }

    // Render error state
    renderError() {
      this.logger.log('error', 'Rendering error state', this.state.error);
      
      return `
        <div class="rp-error" role="alert">
          <div class="rp-error-icon">⚠️</div>
          <p>${this.escapeHtml(this.t('widget.error.title'))}</p>
          <div style="
            background: rgba(255,0,0,0.1);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            font-size: 12px;
            color: #f00;
          ">
            Error: ${this.escapeHtml(this.state.error)}
          </div>
          <button class="rp-button rp-retry-button" type="button">
            ${this.escapeHtml(this.t('widget.error.retry'))}
          </button>
        </div>
      `;
    }

    // Render rewards data
    renderRewardsData() {
      const data = this.state.data;
      this.logger.log('success', 'Rendering rewards data', data);
      
      // Update debug info with member data
      if (data.email) {
        this.state.debugInfo.customerEmail = data.email;
      }
      
      // Ensure we have default values
      const storeCredit = data.formattedCredit || '$0.00';
      const tierName = data.tierName || 'No Tier';
      const isNoTier = tierName === 'No Tier';
      const cashbackRate = data.cashbackRate || 0;
      const memberEmail = data.email || this.state.debugInfo.customerEmail || 'Unknown';
      const memberName = data.name || 'Member';
      
      return `
        <div class="rp-rewards-info">
          <!-- Member Info -->
          <div class="rp-member-info" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
          ">
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">
              ${this.escapeHtml(this.t('widget.member.welcome', { name: memberName }))}
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
              ${this.escapeHtml(this.t('widget.member.email', { email: memberEmail }))}
            </div>
          </div>
          
          <!-- Store Credit Balance -->
          <div class="rp-balance-section">
            <div class="rp-balance">
              <div class="rp-balance-label">${this.escapeHtml(this.t('widget.member.balance.label'))}</div>
              <div class="rp-balance-amount" style="font-size: 28px; font-weight: bold; color: #4CAF50;">
                ${this.escapeHtml(storeCredit)}
              </div>
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
                  style="width: ${Math.min(100, data.progressPercent || 0)}%; background: linear-gradient(90deg, #667eea, #764ba2);"
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
          
          <!-- Debug Info -->
          <div style="
            background: rgba(0,0,0,0.1);
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
            font-size: 11px;
            font-family: monospace;
          ">
            <div>Customer ID: ${data.customerId || this.state.debugInfo.customerId || 'N/A'}</div>
            <div>API Response Time: ${data.responseTime || 'N/A'}</div>
            <div>Data Freshness: ${data.dataAge || 'Real-time'}</div>
          </div>
          
          <!-- Action Buttons -->
          <div class="rp-actions">
            <a href="${this.config.accountUrl || '/account'}" class="rp-button rp-button-primary">
              ${this.escapeHtml(this.t('widget.member.actions.dashboard'))}
            </a>
          </div>
        </div>
      `;
    }

    // Load member data
    async loadData() {
      if (this.state.isLoading) return;
      
      const customerId = this.config.customerId || this.state.debugInfo.customerId;
      
      if (!customerId) {
        this.logger.log('warn', 'No customer ID available, cannot load data');
        return;
      }
      
      this.setState({ isLoading: true, error: null });
      this.updateContent();

      const startTime = Date.now();

      try {
        // Build URL with proper parameters
        const apiUrl = new URL(this.config.membershipApiUrl || '/apps/rewardspro/membership', window.location.origin);
        
        // Add required parameters
        if (!apiUrl.searchParams.has('shop') && this.config.shop) {
          apiUrl.searchParams.set('shop', this.config.shop);
        }
        if (!apiUrl.searchParams.has('logged_in_customer_id')) {
          apiUrl.searchParams.set('logged_in_customer_id', customerId);
        }
        
        this.logger.log('info', `📡 API Call: ${apiUrl.toString()}`);
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        const responseTime = Date.now() - startTime;
        
        // Log API call
        this.state.debugInfo.apiCalls.push({
          timestamp: new Date().toISOString(),
          url: apiUrl.pathname,
          status: response.status,
          success: response.ok,
          responseTime
        });

        // Check response type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          this.logger.log('error', `Invalid response type: ${contentType}`);
          throw new Error('Invalid response from server');
        }

        const data = await response.json();

        if (!response.ok) {
          this.logger.log('error', 'API error response', data);
          throw new Error(data.error || `Unable to load rewards (${response.status})`);
        }

        // Check if login required
        if (data.requiresLogin) {
          this.logger.log('warn', 'Login required');
          this.config.customerId = null;
          this.state.debugInfo.customerId = null;
          this.state.debugInfo.customerDetected = false;
          this.state.debugInfo.sessionStatus = 'guest';
          this.setState({ isLoading: false });
          this.renderExpanded();
          return;
        }

        // Success - enhance data with debug info
        const processedData = {
          ...data,
          formattedCredit: data.formattedCredit || '$0.00',
          tierName: data.tierName || 'No Tier',
          cashbackRate: data.cashbackRate || 0,
          lifetimeEarned: data.lifetimeEarned || '$0.00',
          lifetimeSpent: data.lifetimeSpent || '$0.00',
          email: data.email || this.state.debugInfo.customerEmail,
          name: data.name || 'Member',
          customerId: data.customerId || customerId,
          responseTime: `${responseTime}ms`,
          dataAge: 'Real-time'
        };
        
        // Update debug info with member data
        if (data.email) {
          this.state.debugInfo.customerEmail = data.email;
        }
        
        this.logger.log('success', '✅ Data loaded successfully', processedData);
        
        this.setState({ 
          data: processedData,
          isLoading: false,
          error: null,
          retryCount: 0
        });
        this.updateContent();
        
        // Update debug panel if visible
        if (this.debugPanel && this.debugPanel.style.display !== 'none') {
          this.debugPanel.innerHTML = this.renderDebugInfo();
        }

      } catch (error) {
        this.logger.log('error', '❌ Failed to load data', error);
        this.state.debugInfo.errors.push({
          timestamp: new Date().toISOString(),
          message: error.message,
          stack: error.stack
        });
        
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
        this.logger.log('info', `Retrying in ${delay}ms (attempt ${this.state.retryCount}/${this.state.maxRetries})`);
        setTimeout(() => this.loadData(), delay);
      } else {
        this.logger.log('error', 'Max retries reached');
        this.updateContent();
      }
    }

    // Update content area
    updateContent() {
      const contentArea = this.container.querySelector('.rp-widget-content');
      if (contentArea) {
        const isGuest = !this.config.customerId && !this.state.debugInfo.customerId;
        contentArea.innerHTML = isGuest ? this.renderGuestContent() : this.renderMemberContent();
        
        // Re-attach retry button if needed
        const retryBtn = contentArea.querySelector('.rp-retry-button');
        if (retryBtn) {
          retryBtn.addEventListener('click', this.handleRetry);
        }
      }
      
      // Update debug bar
      const debugBar = this.container.querySelector('.rp-debug-bar');
      if (debugBar) {
        debugBar.innerHTML = `
          <div>Customer ID: ${this.state.debugInfo.customerId || 'none'}</div>
          <div>Email: ${this.state.debugInfo.customerEmail || 'detecting...'}</div>
          <button onclick="window.RewardsProWidget.toggleDebugPanel()" style="
            background: #0ff;
            color: #000;
            border: none;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            margin-top: 5px;
            cursor: pointer;
          ">Open Debug Panel</button>
        `;
      }
    }

    // Event Handlers
    handleMinimize() {
      this.setState({ isMinimized: true });
      if (this.config.rememberState) {
        this.storeState(true);
      }
      this.renderMinimized();
      this.logger.log('info', 'Widget minimized');
    }

    handleMaximize() {
      this.setState({ isMinimized: false });
      if (this.config.rememberState) {
        this.storeState(false);
      }
      this.renderExpanded();
      const customerId = this.config.customerId || this.state.debugInfo.customerId;
      if (customerId && !this.state.data) {
        this.loadData();
      }
      this.logger.log('info', 'Widget maximized');
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
      if (name === 'no tier') return '👤';
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
  }

  // Initialize widget when config is ready
  function initWidget() {
    if (window.RewardsProConfig) {
      window.RewardsProWidget = new RewardsProWidgetDebug(window.RewardsProConfig);
      console.log('%c🔧 RewardsPro Debug Mode Activated', 'background: #000; color: #0ff; padding: 10px; font-size: 16px; font-weight: bold;');
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
        } else {
          console.error('RewardsPro: No configuration found after 2 seconds');
        }
      }
    }, 100);
  }

})();