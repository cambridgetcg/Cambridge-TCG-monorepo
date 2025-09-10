/**
 * Secure RewardsPro Widget Implementation
 * 
 * SECURITY FEATURES:
 * - No customer IDs or sensitive data in JavaScript
 * - Relies on Shopify session cookies for authentication
 * - All data fetched from secure app proxy endpoint
 * - XSS protection through proper DOM manipulation
 * - No API keys or tokens exposed
 */

(function() {
  'use strict';

  class SecureRewardsWidget {
    constructor() {
      // Configuration (no sensitive data)
      this.config = {
        apiEndpoint: '/apps/rewardspro/membership',
        retryAttempts: 3,
        retryDelay: 1000,
        cacheTimeout: 60000, // 1 minute
        debugMode: false
      };
      
      this.state = {
        isLoading: false,
        isMinimized: true,
        data: null,
        error: null,
        lastFetch: null
      };
      
      this.init();
    }
    
    async init() {
      try {
        // Wait for DOM ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
          await this.setup();
        }
      } catch (error) {
        this.logError('Initialization failed', error);
      }
    }
    
    async setup() {
      // Find widget container
      const container = document.getElementById('rewardspro-widget-root');
      if (!container) {
        this.log('Widget container not found');
        return;
      }
      
      this.container = container;
      
      // Check if customer is logged in (safely)
      const isLoggedIn = this.detectCustomerSession();
      
      if (!isLoggedIn) {
        this.renderGuestView();
        return;
      }
      
      // Create widget structure
      this.render();
      
      // Fetch rewards data
      await this.fetchRewardsData();
    }
    
    /**
     * Detect if customer is logged in WITHOUT exposing customer ID
     */
    detectCustomerSession() {
      // Option 1: Check meta tag set by Liquid
      const customerMeta = document.querySelector('meta[name="customer-logged-in"]');
      if (customerMeta?.content === 'true') {
        return true;
      }
      
      // Option 2: Check for customer-specific elements (theme dependent)
      const accountLink = document.querySelector('a[href="/account"]');
      if (accountLink && !accountLink.href.includes('/login')) {
        return true;
      }
      
      // Option 3: Check ShopifyAnalytics (if available)
      if (window.ShopifyAnalytics?.meta?.page?.customerId) {
        return true;
      }
      
      return false;
    }
    
    /**
     * Fetch rewards data from secure app proxy endpoint
     */
    async fetchRewardsData() {
      // Check cache first
      if (this.isCacheValid()) {
        this.log('Using cached data');
        this.updateUI(this.state.data);
        return;
      }
      
      this.setState({ isLoading: true, error: null });
      this.updateLoadingState();
      
      let attempts = 0;
      
      while (attempts < this.config.retryAttempts) {
        try {
          const response = await fetch(this.config.apiEndpoint, {
            method: 'GET',
            credentials: 'same-origin', // Critical: includes session cookies
            headers: {
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest' // Helps identify AJAX requests
            }
          });
          
          // Check content type
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            throw new Error('Invalid response type - possible redirect to login');
          }
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }
          
          // Handle different response scenarios
          if (data.requiresLogin) {
            this.log('Login required');
            this.renderGuestView();
            return;
          }
          
          if (data.success) {
            // Cache the data
            this.setState({
              data: data,
              lastFetch: Date.now(),
              isLoading: false,
              error: null
            });
            
            if (data.enrolled) {
              this.updateUI(data.memberData);
            } else {
              this.renderEnrollmentPrompt();
            }
            return;
          }
          
          throw new Error('Invalid response structure');
          
        } catch (error) {
          attempts++;
          this.logError(`Fetch attempt ${attempts} failed`, error);
          
          if (attempts >= this.config.retryAttempts) {
            this.setState({
              error: 'Unable to load rewards data',
              isLoading: false
            });
            this.renderErrorState();
            return;
          }
          
          // Wait before retry with exponential backoff
          await this.delay(this.config.retryDelay * attempts);
        }
      }
    }
    
    /**
     * Check if cached data is still valid
     */
    isCacheValid() {
      if (!this.state.data || !this.state.lastFetch) {
        return false;
      }
      
      const age = Date.now() - this.state.lastFetch;
      return age < this.config.cacheTimeout;
    }
    
    /**
     * Render widget container
     */
    render() {
      // Create safe DOM structure
      const widget = document.createElement('div');
      widget.className = 'rp-widget';
      widget.setAttribute('role', 'complementary');
      widget.setAttribute('aria-label', 'Rewards information');
      
      // Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'rp-widget-toggle';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-controls', 'rp-widget-content');
      toggleBtn.innerHTML = this.sanitizeHTML('🎁 Rewards');
      toggleBtn.addEventListener('click', () => this.toggle());
      
      // Content area
      const content = document.createElement('div');
      content.id = 'rp-widget-content';
      content.className = 'rp-widget-content';
      content.style.display = 'none';
      content.setAttribute('aria-hidden', 'true');
      
      widget.appendChild(toggleBtn);
      widget.appendChild(content);
      
      this.container.appendChild(widget);
      
      this.toggleBtn = toggleBtn;
      this.contentEl = content;
    }
    
    /**
     * Update UI with member data (XSS-safe)
     */
    updateUI(data) {
      if (!data || !this.contentEl) return;
      
      // Clear existing content
      this.contentEl.innerHTML = '';
      
      // Create elements safely using DOM APIs
      const container = document.createElement('div');
      container.className = 'rp-member-info';
      
      // Store credit
      if (data.storeCredit) {
        const creditEl = document.createElement('div');
        creditEl.className = 'rp-credit';
        
        const creditLabel = document.createElement('span');
        creditLabel.className = 'rp-label';
        creditLabel.textContent = 'Store Credit:';
        
        const creditValue = document.createElement('span');
        creditValue.className = 'rp-value';
        creditValue.textContent = data.storeCredit;
        
        creditEl.appendChild(creditLabel);
        creditEl.appendChild(creditValue);
        container.appendChild(creditEl);
      }
      
      // Tier info
      if (data.tierName) {
        const tierEl = document.createElement('div');
        tierEl.className = 'rp-tier';
        
        const tierLabel = document.createElement('span');
        tierLabel.className = 'rp-label';
        tierLabel.textContent = 'Tier:';
        
        const tierValue = document.createElement('span');
        tierValue.className = 'rp-value';
        tierValue.textContent = data.tierName;
        
        tierEl.appendChild(tierLabel);
        tierEl.appendChild(tierValue);
        container.appendChild(tierEl);
      }
      
      // Cashback rate
      if (data.cashbackRate !== undefined) {
        const cashbackEl = document.createElement('div');
        cashbackEl.className = 'rp-cashback';
        
        const cashbackText = document.createElement('span');
        cashbackText.textContent = `Earning ${data.cashbackRate}% cashback`;
        
        cashbackEl.appendChild(cashbackText);
        container.appendChild(cashbackEl);
      }
      
      // Progress to next tier
      if (data.nextTier && data.progressToNextTier !== undefined) {
        const progressEl = document.createElement('div');
        progressEl.className = 'rp-progress';
        
        const progressLabel = document.createElement('div');
        progressLabel.className = 'rp-progress-label';
        progressLabel.textContent = `Progress to ${data.nextTier}`;
        
        const progressBar = document.createElement('div');
        progressBar.className = 'rp-progress-bar';
        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-valuenow', data.progressToNextTier);
        progressBar.setAttribute('aria-valuemin', '0');
        progressBar.setAttribute('aria-valuemax', '100');
        
        const progressFill = document.createElement('div');
        progressFill.className = 'rp-progress-fill';
        progressFill.style.width = `${Math.min(100, data.progressToNextTier)}%`;
        
        progressBar.appendChild(progressFill);
        progressEl.appendChild(progressLabel);
        progressEl.appendChild(progressBar);
        container.appendChild(progressEl);
      }
      
      // Account link
      const accountLink = document.createElement('a');
      accountLink.href = '/account';
      accountLink.className = 'rp-account-link';
      accountLink.textContent = 'View Full Dashboard';
      container.appendChild(accountLink);
      
      this.contentEl.appendChild(container);
    }
    
    /**
     * Render guest view
     */
    renderGuestView() {
      if (!this.container) return;
      
      // Clear container
      this.container.innerHTML = '';
      
      const guestEl = document.createElement('div');
      guestEl.className = 'rp-guest-prompt';
      
      const message = document.createElement('p');
      message.textContent = 'Log in to view your rewards and earn cashback!';
      
      const loginLink = document.createElement('a');
      loginLink.href = '/account/login';
      loginLink.className = 'rp-login-btn';
      loginLink.textContent = 'Log In';
      
      const registerLink = document.createElement('a');
      registerLink.href = '/account/register';
      registerLink.className = 'rp-register-btn';
      registerLink.textContent = 'Sign Up';
      
      guestEl.appendChild(message);
      guestEl.appendChild(loginLink);
      guestEl.appendChild(registerLink);
      
      this.container.appendChild(guestEl);
    }
    
    /**
     * Render enrollment prompt
     */
    renderEnrollmentPrompt() {
      if (!this.contentEl) return;
      
      this.contentEl.innerHTML = '';
      
      const promptEl = document.createElement('div');
      promptEl.className = 'rp-enrollment';
      
      const message = document.createElement('p');
      message.textContent = 'Join our rewards program to start earning cashback!';
      
      const enrollBtn = document.createElement('a');
      enrollBtn.href = '/account';
      enrollBtn.className = 'rp-enroll-btn';
      enrollBtn.textContent = 'Join Now';
      
      promptEl.appendChild(message);
      promptEl.appendChild(enrollBtn);
      
      this.contentEl.appendChild(promptEl);
    }
    
    /**
     * Render loading state
     */
    updateLoadingState() {
      if (!this.contentEl) return;
      
      this.contentEl.innerHTML = '';
      
      const loadingEl = document.createElement('div');
      loadingEl.className = 'rp-loading';
      loadingEl.setAttribute('role', 'status');
      
      const spinner = document.createElement('div');
      spinner.className = 'rp-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      
      const message = document.createElement('span');
      message.className = 'rp-sr-only';
      message.textContent = 'Loading rewards...';
      
      loadingEl.appendChild(spinner);
      loadingEl.appendChild(message);
      
      this.contentEl.appendChild(loadingEl);
    }
    
    /**
     * Render error state
     */
    renderErrorState() {
      if (!this.contentEl) return;
      
      this.contentEl.innerHTML = '';
      
      const errorEl = document.createElement('div');
      errorEl.className = 'rp-error';
      errorEl.setAttribute('role', 'alert');
      
      const message = document.createElement('p');
      message.textContent = this.state.error || 'Unable to load rewards';
      
      const retryBtn = document.createElement('button');
      retryBtn.className = 'rp-retry-btn';
      retryBtn.textContent = 'Try Again';
      retryBtn.addEventListener('click', () => this.fetchRewardsData());
      
      errorEl.appendChild(message);
      errorEl.appendChild(retryBtn);
      
      this.contentEl.appendChild(errorEl);
    }
    
    /**
     * Toggle widget visibility
     */
    toggle() {
      const isOpen = !this.state.isMinimized;
      this.setState({ isMinimized: isOpen });
      
      if (this.toggleBtn && this.contentEl) {
        this.toggleBtn.setAttribute('aria-expanded', !isOpen);
        this.contentEl.style.display = isOpen ? 'none' : 'block';
        this.contentEl.setAttribute('aria-hidden', isOpen);
        
        // Fetch fresh data when opening
        if (!isOpen && !this.isCacheValid()) {
          this.fetchRewardsData();
        }
      }
    }
    
    /**
     * State management
     */
    setState(updates) {
      this.state = { ...this.state, ...updates };
    }
    
    /**
     * Sanitize HTML (basic XSS protection)
     */
    sanitizeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
    
    /**
     * Utility: delay function
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Logging utilities
     */
    log(message, data) {
      if (this.config.debugMode) {
        console.log(`[RewardsPro] ${message}`, data || '');
      }
    }
    
    logError(message, error) {
      console.error(`[RewardsPro] ${message}`, error);
    }
  }
  
  // Initialize widget when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.RewardsProWidget = new SecureRewardsWidget();
    });
  } else {
    window.RewardsProWidget = new SecureRewardsWidget();
  }
  
})();