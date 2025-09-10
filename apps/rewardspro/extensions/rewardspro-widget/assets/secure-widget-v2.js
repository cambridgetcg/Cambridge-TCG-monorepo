/**
 * RewardsPro Secure Widget v2.0
 * Complete security-hardened implementation
 * - No customer IDs or sensitive data
 * - DOM API manipulation (no innerHTML)
 * - Session-based authentication
 * - XSS protection
 */

(function() {
  'use strict';

  // Secure Session Manager
  class SecureSessionManager {
    constructor() {
      this.sessionState = this.detectSession();
    }
    
    detectSession() {
      // Check meta tag for session state (server-verified)
      const sessionMeta = document.querySelector('meta[name="rewardspro-session"]');
      if (sessionMeta?.content === 'authenticated') {
        return 'authenticated';
      }
      
      // Fallback: Check Shopify analytics (if available)
      if (window.ShopifyAnalytics?.meta?.page?.customerId) {
        return 'authenticated';
      }
      
      return 'guest';
    }
    
    isAuthenticated() {
      return this.sessionState === 'authenticated';
    }
  }

  // Secure Data Fetcher
  class SecureDataFetcher {
    constructor(config) {
      this.config = config;
      this.cache = new Map();
      this.pendingRequests = new Map();
    }
    
    async fetchRewardsData() {
      const cacheKey = 'rewards-data';
      
      // Check cache (5 minute TTL)
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
          return cached.data;
        }
      }
      
      // Prevent duplicate requests
      if (this.pendingRequests.has(cacheKey)) {
        return this.pendingRequests.get(cacheKey);
      }
      
      const request = this.makeSecureRequest();
      this.pendingRequests.set(cacheKey, request);
      
      try {
        const data = await request;
        
        // Cache successful response
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        
        return data;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    }
    
    async makeSecureRequest() {
      const url = new URL(this.config.urls.membershipApi, window.location.origin);
      
      // Add timestamp for cache busting
      url.searchParams.set('t', Date.now().toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin', // Include cookies for session
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-RewardsPro-Widget': '2.0' // Version header
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      // Handle different response statuses
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('UNAUTHENTICATED');
        }
        if (response.status === 403) {
          throw new Error('FORBIDDEN');
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '60';
          throw new Error(`RATE_LIMITED:${retryAfter}`);
        }
        throw new Error(`HTTP_${response.status}`);
      }
      
      const data = await response.json();
      
      // Validate response structure
      if (!this.validateResponse(data)) {
        throw new Error('INVALID_RESPONSE');
      }
      
      return data;
    }
    
    validateResponse(data) {
      if (typeof data !== 'object' || data === null) {
        return false;
      }
      
      // Check for valid response types
      if (data.enrolled === true) {
        return typeof data.storeCredit === 'string' && 
               typeof data.tierName === 'string';
      }
      
      return data.enrolled === false || data.requiresLogin === true;
    }
  }

  // Main Widget Class
  class SecureRewardsWidget {
    constructor() {
      this.config = window.RewardsProConfig || {};
      this.sessionManager = new SecureSessionManager();
      this.dataFetcher = new SecureDataFetcher(this.config);
      
      this.state = {
        isMinimized: this.loadMinimizedState(),
        isLoading: false,
        data: null,
        error: null,
        retryCount: 0,
        maxRetries: 3
      };
      
      this.container = null;
      this.init();
    }
    
    async init() {
      // Wait for DOM if needed
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }
      
      // Find or create widget root
      const root = document.getElementById('rewardspro-widget-root');
      if (!root) {
        console.error('[RewardsPro] Widget root element not found');
        return;
      }
      
      // Create widget container
      this.container = this.createElement('div', {
        className: 'rp-widget-container',
        role: 'complementary',
        'aria-label': 'Rewards information'
      });
      
      // Apply position styles
      this.applyPositionStyles();
      
      root.appendChild(this.container);
      
      // Check authentication and render
      if (!this.sessionManager.isAuthenticated()) {
        this.renderGuestView();
      } else {
        this.render();
        await this.loadData();
      }
      
      // Attach global event listeners
      this.attachEventListeners();
    }
    
    applyPositionStyles() {
      const position = this.config.settings?.position || 'bottom-right';
      const positions = {
        'bottom-right': { bottom: '20px', right: '20px' },
        'bottom-left': { bottom: '20px', left: '20px' },
        'top-right': { top: '20px', right: '20px' },
        'top-left': { top: '20px', left: '20px' }
      };
      
      const style = positions[position] || positions['bottom-right'];
      Object.assign(this.container.style, {
        position: 'fixed',
        zIndex: '99999',
        ...style
      });
    }
    
    async loadData() {
      if (this.state.isLoading) return;
      
      this.setState({ isLoading: true, error: null });
      
      try {
        const data = await this.dataFetcher.fetchRewardsData();
        
        if (data.requiresLogin) {
          this.renderGuestView();
          return;
        }
        
        this.setState({ 
          data, 
          isLoading: false,
          retryCount: 0
        });
        
      } catch (error) {
        console.error('[RewardsPro] Data fetch error:', error);
        
        if (error.message === 'UNAUTHENTICATED') {
          this.renderGuestView();
        } else if (error.message.startsWith('RATE_LIMITED')) {
          const retryAfter = parseInt(error.message.split(':')[1]) || 60;
          this.setState({
            error: `Too many requests. Please wait ${retryAfter} seconds.`,
            isLoading: false
          });
          
          // Auto-retry after rate limit
          setTimeout(() => this.loadData(), retryAfter * 1000);
        } else {
          this.setState({
            error: 'Unable to load rewards data',
            isLoading: false
          });
          
          // Retry with exponential backoff
          if (this.state.retryCount < this.state.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 30000);
            this.state.retryCount++;
            setTimeout(() => this.loadData(), delay);
          }
        }
      }
    }
    
    render() {
      if (!this.container) return;
      
      // Clear container safely
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      
      if (this.state.isMinimized) {
        this.renderMinimized();
      } else if (this.state.isLoading) {
        this.renderLoading();
      } else if (this.state.error) {
        this.renderError();
      } else if (this.state.data) {
        this.renderData();
      } else {
        this.renderLoading();
      }
    }
    
    renderMinimized() {
      const button = this.createElement('button', {
        className: 'rp-widget-toggle rp-widget-minimized',
        'aria-label': 'Open rewards widget',
        'aria-expanded': 'false',
        onclick: () => this.maximize()
      });
      
      const icon = this.createElement('span', {
        className: 'rp-widget-icon',
        textContent: this.getIcon()
      });
      
      button.appendChild(icon);
      this.container.appendChild(button);
    }
    
    renderData() {
      const panel = this.createElement('div', {
        className: 'rp-widget-panel',
        role: 'dialog',
        'aria-label': this.config.content?.title || 'Rewards Center'
      });
      
      // Header
      const header = this.createElement('div', {
        className: 'rp-widget-header'
      });
      
      const title = this.createElement('h3', {
        className: 'rp-widget-title',
        textContent: this.config.content?.title || 'Rewards Center'
      });
      
      const closeBtn = this.createElement('button', {
        className: 'rp-widget-close',
        'aria-label': 'Close rewards widget',
        onclick: () => this.minimize()
      });
      
      const closeIcon = this.createElement('span', {
        'aria-hidden': 'true',
        textContent: '×'
      });
      
      closeBtn.appendChild(closeIcon);
      header.appendChild(title);
      header.appendChild(closeBtn);
      
      // Content
      const content = this.createElement('div', {
        className: 'rp-widget-content'
      });
      
      // Store Credit Balance
      const balanceSection = this.createElement('div', {
        className: 'rp-balance-section'
      });
      
      const balanceLabel = this.createElement('div', {
        className: 'rp-balance-label',
        textContent: 'Store Credit Balance'
      });
      
      const balanceAmount = this.createElement('div', {
        className: 'rp-balance-amount',
        textContent: this.state.data.storeCredit || '$0.00'
      });
      
      balanceSection.appendChild(balanceLabel);
      balanceSection.appendChild(balanceAmount);
      
      // Tier Information
      const tierSection = this.createElement('div', {
        className: 'rp-tier-section'
      });
      
      const tierBadge = this.createElement('div', {
        className: 'rp-tier-badge'
      });
      
      const tierIcon = this.createElement('span', {
        className: 'rp-tier-icon',
        textContent: this.getTierIcon(this.state.data.tierName)
      });
      
      const tierName = this.createElement('span', {
        className: 'rp-tier-name',
        textContent: this.state.data.tierName || 'Member'
      });
      
      tierBadge.appendChild(tierIcon);
      tierBadge.appendChild(tierName);
      tierSection.appendChild(tierBadge);
      
      // Cashback Rate
      if (this.state.data.cashbackRate > 0) {
        const cashbackDiv = this.createElement('div', {
          className: 'rp-cashback-rate',
          textContent: `Earning ${this.state.data.cashbackRate}% cashback`
        });
        tierSection.appendChild(cashbackDiv);
      }
      
      // Progress Bar (if applicable)
      if (this.state.data.nextTierProgress !== undefined) {
        const progressSection = this.createElement('div', {
          className: 'rp-progress-section'
        });
        
        const progressLabel = this.createElement('div', {
          className: 'rp-progress-label',
          textContent: 'Progress to next tier'
        });
        
        const progressBar = this.createElement('div', {
          className: 'rp-progress-bar',
          role: 'progressbar',
          'aria-valuenow': String(this.state.data.nextTierProgress || 0),
          'aria-valuemin': '0',
          'aria-valuemax': '100'
        });
        
        const progressFill = this.createElement('div', {
          className: 'rp-progress-fill'
        });
        progressFill.style.width = `${Math.min(100, this.state.data.nextTierProgress || 0)}%`;
        
        progressBar.appendChild(progressFill);
        progressSection.appendChild(progressLabel);
        progressSection.appendChild(progressBar);
        content.appendChild(progressSection);
      }
      
      // Account Link
      const actions = this.createElement('div', {
        className: 'rp-actions'
      });
      
      const accountLink = this.createElement('a', {
        href: this.config.urls?.account || '/account',
        className: 'rp-button rp-button-primary',
        textContent: 'View Full Dashboard'
      });
      
      actions.appendChild(accountLink);
      
      // Assemble content
      content.appendChild(balanceSection);
      content.appendChild(tierSection);
      content.appendChild(actions);
      
      // Assemble panel
      panel.appendChild(header);
      panel.appendChild(content);
      this.container.appendChild(panel);
    }
    
    renderGuestView() {
      if (!this.container) return;
      
      // Clear container
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      
      const panel = this.createElement('div', {
        className: 'rp-widget-panel rp-widget-guest',
        role: 'dialog'
      });
      
      // Header
      const header = this.createElement('div', {
        className: 'rp-widget-header'
      });
      
      const title = this.createElement('h3', {
        className: 'rp-widget-title',
        textContent: this.config.content?.title || 'Rewards Program'
      });
      
      const closeBtn = this.createElement('button', {
        className: 'rp-widget-close',
        'aria-label': 'Close',
        onclick: () => this.minimize()
      });
      
      closeBtn.appendChild(this.createElement('span', {
        textContent: '×',
        'aria-hidden': 'true'
      }));
      
      header.appendChild(title);
      header.appendChild(closeBtn);
      
      // Content
      const content = this.createElement('div', {
        className: 'rp-widget-content'
      });
      
      const guestPrompt = this.createElement('div', {
        className: 'rp-guest-prompt'
      });
      
      const icon = this.createElement('div', {
        className: 'rp-guest-icon',
        textContent: '🎁'
      });
      
      const message = this.createElement('p', {
        className: 'rp-guest-message',
        textContent: this.config.content?.guestMessage || 'Join our rewards program and earn cashback on every purchase!'
      });
      
      const buttonGroup = this.createElement('div', {
        className: 'rp-button-group'
      });
      
      const signInBtn = this.createElement('a', {
        href: this.config.urls?.login || '/account/login',
        className: 'rp-button rp-button-primary',
        textContent: this.config.content?.signInText || 'Sign In'
      });
      
      const registerBtn = this.createElement('a', {
        href: this.config.urls?.register || '/account/register',
        className: 'rp-button rp-button-secondary',
        textContent: this.config.content?.registerText || 'Join Now'
      });
      
      buttonGroup.appendChild(signInBtn);
      buttonGroup.appendChild(registerBtn);
      
      guestPrompt.appendChild(icon);
      guestPrompt.appendChild(message);
      guestPrompt.appendChild(buttonGroup);
      
      content.appendChild(guestPrompt);
      panel.appendChild(header);
      panel.appendChild(content);
      
      this.container.appendChild(panel);
    }
    
    renderLoading() {
      const panel = this.createElement('div', {
        className: 'rp-widget-panel',
        role: 'dialog'
      });
      
      const content = this.createElement('div', {
        className: 'rp-widget-content rp-loading',
        role: 'status',
        'aria-live': 'polite'
      });
      
      const spinner = this.createElement('div', {
        className: 'rp-spinner',
        'aria-hidden': 'true'
      });
      
      const message = this.createElement('p', {
        textContent: 'Loading rewards...'
      });
      
      content.appendChild(spinner);
      content.appendChild(message);
      panel.appendChild(content);
      this.container.appendChild(panel);
    }
    
    renderError() {
      const panel = this.createElement('div', {
        className: 'rp-widget-panel',
        role: 'dialog'
      });
      
      const content = this.createElement('div', {
        className: 'rp-widget-content rp-error',
        role: 'alert'
      });
      
      const errorIcon = this.createElement('div', {
        className: 'rp-error-icon',
        textContent: '⚠️'
      });
      
      const errorMessage = this.createElement('p', {
        textContent: this.state.error || 'Unable to load rewards data'
      });
      
      const retryBtn = this.createElement('button', {
        className: 'rp-button rp-retry-button',
        textContent: 'Try Again',
        onclick: () => {
          this.state.retryCount = 0;
          this.loadData();
        }
      });
      
      content.appendChild(errorIcon);
      content.appendChild(errorMessage);
      content.appendChild(retryBtn);
      panel.appendChild(content);
      this.container.appendChild(panel);
    }
    
    // Helper: Create element with properties
    createElement(tag, props = {}) {
      const element = document.createElement(tag);
      
      Object.entries(props).forEach(([key, value]) => {
        if (key === 'onclick') {
          element.addEventListener('click', value);
        } else if (key === 'textContent') {
          element.textContent = value;
        } else if (key === 'className') {
          element.className = value;
        } else if (key.startsWith('aria-') || key === 'role' || key === 'href') {
          element.setAttribute(key, value);
        } else {
          element[key] = value;
        }
      });
      
      return element;
    }
    
    // State management
    setState(updates) {
      this.state = { ...this.state, ...updates };
      this.render();
    }
    
    // Session storage for minimize state
    loadMinimizedState() {
      if (!this.config.settings?.rememberState) {
        return this.config.settings?.startMinimized || false;
      }
      
      try {
        const stored = sessionStorage.getItem('rp-widget-minimized');
        return stored === 'true';
      } catch {
        return this.config.settings?.startMinimized || false;
      }
    }
    
    saveMinimizedState(minimized) {
      if (!this.config.settings?.rememberState) return;
      
      try {
        sessionStorage.setItem('rp-widget-minimized', String(minimized));
      } catch {
        // Silent fail
      }
    }
    
    minimize() {
      this.setState({ isMinimized: true });
      this.saveMinimizedState(true);
    }
    
    maximize() {
      this.setState({ isMinimized: false });
      this.saveMinimizedState(false);
      
      // Reload data if authenticated and no data
      if (this.sessionManager.isAuthenticated() && !this.state.data) {
        this.loadData();
      }
    }
    
    getIcon() {
      const style = this.config.settings?.iconStyle || 'emoji';
      
      switch (style) {
        case 'svg':
          return '⭐'; // Could be replaced with actual SVG
        case 'text':
          return 'R';
        case 'emoji':
        default:
          return '🎁';
      }
    }
    
    getTierIcon(tierName) {
      if (!tierName) return '⭐';
      
      const name = tierName.toLowerCase();
      if (name.includes('diamond') || name.includes('vip')) return '💎';
      if (name.includes('gold')) return '🏆';
      if (name.includes('silver')) return '🥈';
      if (name.includes('bronze')) return '🥉';
      if (name === 'no tier') return '👤';
      
      return '⭐';
    }
    
    attachEventListeners() {
      // ESC key to minimize
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.state.isMinimized) {
          this.minimize();
        }
      });
      
      // Auto-hide after delay
      const autoHideDelay = this.config.settings?.autoHideDelay;
      if (autoHideDelay > 0 && !this.state.isMinimized) {
        setTimeout(() => this.minimize(), autoHideDelay * 1000);
      }
    }
  }

  // Initialize widget when DOM is ready
  function initWidget() {
    if (window.RewardsProConfig) {
      window.RewardsProWidget = new SecureRewardsWidget();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

})();