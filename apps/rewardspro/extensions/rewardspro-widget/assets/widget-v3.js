/**
 * RewardsPro Widget v2.0
 * Clean implementation based on actual API structure
 * Uses Shopify App Proxy with HMAC verification
 */

(function() {
  'use strict';

  /**
   * Main widget class
   */
  class RewardsWidget {
    constructor() {
      // Log version for debugging
      console.log('[RewardsWidget v3.0.0] Latest version - No translation keys, direct text display');
      console.log('[RewardsWidget v3.0.0] If you see translation keys, clear your browser cache!');
      
      // Configuration from page
      this.config = window.RewardsProConfig || {};
      
      // Widget state
      this.state = {
        isOpen: false,
        isLoading: false,
        data: null,
        error: null
      };
      
      // API endpoint (uses Shopify App Proxy)
      this.apiEndpoint = '/apps/rewardspro/membership';
      
      // Initialize when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
    
    /**
     * Initialize the widget
     */
    init() {
      console.log('[RewardsWidget] Initializing...');
      
      // Find or create root container
      this.root = document.getElementById('rewardspro-widget-root');
      if (!this.root) {
        console.error('[RewardsWidget] Root element not found');
        return;
      }
      
      // Create widget container
      this.container = document.createElement('div');
      this.container.className = 'rewards-widget';
      this.container.setAttribute('data-state', 'closed');
      
      // Render initial state
      this.render();
      
      // Append to root
      this.root.appendChild(this.container);
      
      // Load data if authenticated
      if (this.config.isAuthenticated) {
        console.log('[RewardsWidget] User authenticated, loading data...');
        this.loadCustomerData();
      }
    }
    
    /**
     * Render the widget based on current state
     */
    render() {
      // Clear container
      this.container.innerHTML = '';
      
      if (this.state.isOpen) {
        this.renderPanel();
      } else {
        this.renderButton();
      }
    }
    
    /**
     * Render minimized button
     */
    renderButton() {
      const button = document.createElement('button');
      button.className = 'rewards-widget-button';
      button.setAttribute('aria-label', 'Open rewards panel');
      button.innerHTML = '🎁 <span>Rewards</span>';
      button.onclick = () => this.open();
      
      this.container.appendChild(button);
      this.container.setAttribute('data-state', 'closed');
    }
    
    /**
     * Render expanded panel
     */
    renderPanel() {
      const panel = document.createElement('div');
      panel.className = 'rewards-widget-panel';
      
      // Header
      const header = document.createElement('div');
      header.className = 'rewards-widget-header';
      
      const title = document.createElement('h3');
      title.textContent = 'Your Rewards';
      header.appendChild(title);
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'rewards-widget-close';
      closeBtn.setAttribute('aria-label', 'Close rewards panel');
      closeBtn.textContent = '×';
      closeBtn.onclick = () => this.close();
      header.appendChild(closeBtn);
      
      panel.appendChild(header);
      
      // Content
      const content = document.createElement('div');
      content.className = 'rewards-widget-content';
      
      if (!this.config.isAuthenticated) {
        content.appendChild(this.renderGuestContent());
      } else if (this.state.isLoading) {
        content.appendChild(this.renderLoadingContent());
      } else if (this.state.error) {
        content.appendChild(this.renderErrorContent());
      } else if (this.state.data) {
        content.appendChild(this.renderCustomerContent());
      } else {
        content.appendChild(this.renderLoadingContent());
      }
      
      panel.appendChild(content);
      this.container.appendChild(panel);
      this.container.setAttribute('data-state', 'open');
    }
    
    /**
     * Render guest (not logged in) content
     */
    renderGuestContent() {
      const div = document.createElement('div');
      div.className = 'rewards-guest';
      
      const icon = document.createElement('div');
      icon.className = 'rewards-icon';
      icon.textContent = '🎁';
      div.appendChild(icon);
      
      const message = document.createElement('p');
      message.textContent = 'Sign in to view your rewards and start earning cashback!';
      div.appendChild(message);
      
      const buttons = document.createElement('div');
      buttons.className = 'rewards-buttons';
      
      const loginBtn = document.createElement('a');
      loginBtn.href = '/account/login';
      loginBtn.className = 'rewards-btn rewards-btn-secondary';
      loginBtn.textContent = 'Sign In';
      buttons.appendChild(loginBtn);
      
      const registerBtn = document.createElement('a');
      registerBtn.href = '/account/register';
      registerBtn.className = 'rewards-btn rewards-btn-primary';
      registerBtn.textContent = 'Join Now';
      buttons.appendChild(registerBtn);
      
      div.appendChild(buttons);
      
      return div;
    }
    
    /**
     * Render loading state
     */
    renderLoadingContent() {
      const div = document.createElement('div');
      div.className = 'rewards-loading';
      
      const spinner = document.createElement('div');
      spinner.className = 'rewards-spinner';
      div.appendChild(spinner);
      
      const text = document.createElement('p');
      text.textContent = 'Loading your rewards...';
      div.appendChild(text);
      
      return div;
    }
    
    /**
     * Render error state
     */
    renderErrorContent() {
      const div = document.createElement('div');
      div.className = 'rewards-error';
      
      const message = document.createElement('p');
      message.textContent = this.state.error || 'Unable to load rewards. Please try again.';
      div.appendChild(message);
      
      const retryBtn = document.createElement('button');
      retryBtn.className = 'rewards-btn rewards-btn-secondary';
      retryBtn.textContent = 'Try Again';
      retryBtn.onclick = () => this.loadCustomerData();
      div.appendChild(retryBtn);
      
      return div;
    }
    
    /**
     * Render customer content (enrolled or not enrolled)
     */
    renderCustomerContent() {
      const data = this.state.data;
      
      // Check if customer is enrolled
      if (!data.enrolled) {
        return this.renderNotEnrolledContent();
      }
      
      // Customer is enrolled, show their data
      return this.renderEnrolledContent();
    }
    
    /**
     * Render not enrolled content
     */
    renderNotEnrolledContent() {
      const div = document.createElement('div');
      div.className = 'rewards-not-enrolled';
      
      const icon = document.createElement('div');
      icon.className = 'rewards-icon';
      icon.textContent = '🎁';
      div.appendChild(icon);
      
      const message = document.createElement('p');
      message.className = 'rewards-message';
      message.textContent = 'You\'re not enrolled in our rewards program yet!';
      div.appendChild(message);
      
      const benefits = document.createElement('ul');
      benefits.className = 'rewards-benefits';
      
      const benefitTexts = [
        'Earn cashback on every purchase',
        'Unlock exclusive member tiers',
        'Get personalized rewards'
      ];
      
      benefitTexts.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        benefits.appendChild(li);
      });
      
      div.appendChild(benefits);
      
      const enrollBtn = document.createElement('button');
      enrollBtn.className = 'rewards-btn rewards-btn-primary';
      enrollBtn.textContent = 'Start Earning Rewards';
      enrollBtn.onclick = () => {
        // Could trigger enrollment flow or redirect
        window.location.href = '/account';
      };
      div.appendChild(enrollBtn);
      
      return div;
    }
    
    /**
     * Render enrolled customer content
     */
    renderEnrolledContent() {
      const data = this.state.data.memberData;
      const div = document.createElement('div');
      div.className = 'rewards-enrolled';
      
      // Store Credit Balance
      const balanceCard = document.createElement('div');
      balanceCard.className = 'rewards-balance-card';
      
      const balanceLabel = document.createElement('div');
      balanceLabel.className = 'rewards-balance-label';
      balanceLabel.textContent = '💰 YOUR STORE CREDIT 💰';
      balanceCard.appendChild(balanceLabel);
      
      const balanceAmount = document.createElement('div');
      balanceAmount.className = 'rewards-balance-amount';
      balanceAmount.textContent = data.storeCredit || '$0.00';
      balanceCard.appendChild(balanceAmount);
      
      div.appendChild(balanceCard);
      
      // Tier Badge
      const tierBadge = document.createElement('div');
      tierBadge.className = 'rewards-tier-badge';
      
      const tierIcon = document.createElement('span');
      tierIcon.className = 'rewards-tier-icon';
      tierIcon.textContent = '👤';
      tierBadge.appendChild(tierIcon);
      
      const tierName = document.createElement('span');
      tierName.className = 'rewards-tier-name';
      tierName.textContent = data.tierName || 'Member';
      tierBadge.appendChild(tierName);
      
      if (data.cashbackRate > 0) {
        const cashback = document.createElement('span');
        cashback.className = 'rewards-tier-cashback';
        cashback.textContent = ` (${data.cashbackRate}% cashback)`;
        tierBadge.appendChild(cashback);
      }
      
      div.appendChild(tierBadge);
      
      // Progress to next tier (if applicable)
      if (data.nextTier && data.progressToNextTier !== undefined) {
        const progressSection = document.createElement('div');
        progressSection.className = 'rewards-progress-section';
        
        const progressLabel = document.createElement('div');
        progressLabel.className = 'rewards-progress-label';
        progressLabel.textContent = `Progress to ${data.nextTier}`;
        progressSection.appendChild(progressLabel);
        
        const progressBar = document.createElement('div');
        progressBar.className = 'rewards-progress-bar';
        
        const progressFill = document.createElement('div');
        progressFill.className = 'rewards-progress-fill';
        progressFill.style.width = `${Math.min(100, data.progressToNextTier || 0)}%`;
        progressBar.appendChild(progressFill);
        
        progressSection.appendChild(progressBar);
        
        if (data.remainingToNextTier) {
          const remaining = document.createElement('div');
          remaining.className = 'rewards-progress-remaining';
          remaining.textContent = `${data.remainingToNextTier} to reach next tier`;
          progressSection.appendChild(remaining);
        }
        
        div.appendChild(progressSection);
      }
      
      // Stats Grid
      const stats = document.createElement('div');
      stats.className = 'rewards-stats';
      
      // Lifetime Earned
      const earnedStat = document.createElement('div');
      earnedStat.className = 'rewards-stat';
      
      const earnedValue = document.createElement('div');
      earnedValue.className = 'rewards-stat-value';
      earnedValue.textContent = data.lifetimeEarned || '$0.00';
      earnedStat.appendChild(earnedValue);
      
      const earnedLabel = document.createElement('div');
      earnedLabel.className = 'rewards-stat-label';
      earnedLabel.textContent = '✅ EARNED (NEW!)';
      earnedStat.appendChild(earnedLabel);
      
      stats.appendChild(earnedStat);
      
      // Lifetime Spent
      const spentStat = document.createElement('div');
      spentStat.className = 'rewards-stat';
      
      const spentValue = document.createElement('div');
      spentValue.className = 'rewards-stat-value';
      spentValue.textContent = data.lifetimeSpent || '$0.00';
      spentStat.appendChild(spentValue);
      
      const spentLabel = document.createElement('div');
      spentLabel.className = 'rewards-stat-label';
      spentLabel.textContent = '💸 SPENT (NEW!)';
      spentStat.appendChild(spentLabel);
      
      stats.appendChild(spentStat);
      
      div.appendChild(stats);
      
      // View Dashboard Button - UPDATED TEXT FOR TESTING
      const dashboardBtn = document.createElement('a');
      dashboardBtn.href = '/account';
      dashboardBtn.className = 'rewards-btn rewards-btn-primary';
      dashboardBtn.textContent = '🚀 CLICK HERE - NEW VERSION LOADED! 🚀';
      div.appendChild(dashboardBtn);
      
      return div;
    }
    
    /**
     * Load customer data from API
     */
    async loadCustomerData() {
      console.log('[RewardsWidget] Loading customer data...');
      
      // Set loading state
      this.state.isLoading = true;
      this.state.error = null;
      
      // Update UI if panel is open
      if (this.state.isOpen) {
        this.render();
      }
      
      try {
        // Make API request through Shopify App Proxy
        const response = await fetch(this.apiEndpoint, {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        // Parse response
        const data = await response.json();
        
        console.log('[RewardsWidget] API Response:', data);
        
        // Check for errors
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        // Check if login is required
        if (data.requiresLogin) {
          console.log('[RewardsWidget] Login required');
          this.config.isAuthenticated = false;
          this.state.isLoading = false;
          this.render();
          return;
        }
        
        // Store data
        this.state.data = data;
        this.state.isLoading = false;
        
        console.log('[RewardsWidget] Data loaded successfully');
        
        // Update UI if panel is open
        if (this.state.isOpen) {
          this.render();
        }
        
      } catch (error) {
        console.error('[RewardsWidget] Error loading data:', error);
        
        this.state.error = error.message || 'Unable to load rewards';
        this.state.isLoading = false;
        
        // Update UI if panel is open
        if (this.state.isOpen) {
          this.render();
        }
      }
    }
    
    /**
     * Open the widget panel
     */
    open() {
      console.log('[RewardsWidget] Opening panel');
      this.state.isOpen = true;
      this.render();
      
      // Load data if authenticated and not already loaded
      if (this.config.isAuthenticated && !this.state.data && !this.state.isLoading) {
        this.loadCustomerData();
      }
    }
    
    /**
     * Close the widget panel
     */
    close() {
      console.log('[RewardsWidget] Closing panel');
      this.state.isOpen = false;
      this.render();
    }
  }
  
  // Initialize widget when config is ready
  if (window.RewardsProConfig) {
    console.log('[RewardsWidget] Config found, initializing immediately');
    window.RewardsWidget = new RewardsWidget();
  } else {
    // Wait for config to be set
    console.log('[RewardsWidget] Waiting for config...');
    let configCheckInterval = setInterval(() => {
      if (window.RewardsProConfig) {
        clearInterval(configCheckInterval);
        console.log('[RewardsWidget] Config found, initializing');
        window.RewardsWidget = new RewardsWidget();
      }
    }, 100);
    
    // Stop checking after 10 seconds
    setTimeout(() => {
      clearInterval(configCheckInterval);
      console.warn('[RewardsWidget] Config not found after 10 seconds');
    }, 10000);
  }
})();