/**
 * RewardsPro Widget - Security-Hardened Implementation
 * No innerHTML usage - All DOM manipulation through secure APIs
 * HMAC-verified app proxy communication
 */

(function() {
  'use strict';

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
      this.locale = this.config.shop?.locale || 'en';
      this.translations = null;
      
      // Bind methods
      this.handleMinimize = this.handleMinimize.bind(this);
      this.handleMaximize = this.handleMaximize.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleRetry = this.handleRetry.bind(this);
      
      this.init();
    }

    // Secure DOM element creation
    createElement(tag, props = {}, children = []) {
      const element = document.createElement(tag);
      
      // Set properties (excluding innerHTML)
      Object.keys(props).forEach(key => {
        if (key === 'className') {
          element.className = props[key];
        } else if (key === 'textContent') {
          element.textContent = props[key];
        } else if (key.startsWith('data-')) {
          element.setAttribute(key, props[key]);
        } else if (key.startsWith('aria-')) {
          element.setAttribute(key, props[key]);
        } else if (key === 'role') {
          element.setAttribute('role', props[key]);
        } else if (key === 'type') {
          element.type = props[key];
        } else if (key === 'href') {
          element.href = props[key];
        } else if (key === 'style') {
          Object.assign(element.style, props[key]);
        } else if (key === 'onclick') {
          element.addEventListener('click', props[key]);
        }
      });
      
      // Append children
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        }
      });
      
      return element;
    }

    // Initialize widget
    init() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }

    // Setup widget
    async setup() {
      const root = document.getElementById('rewardspro-widget-root');
      if (!root) {
        console.warn('RewardsPro: Widget root element not found');
        return;
      }

      // Load translations
      await this.loadTranslations();

      // Check stored state
      if (this.config.settings?.rememberState) {
        const stored = this.getStoredState();
        if (stored !== null) {
          this.state.isMinimized = stored;
        } else {
          this.state.isMinimized = this.config.settings?.startMinimized || false;
        }
      } else {
        this.state.isMinimized = this.config.settings?.startMinimized || false;
      }

      // Create widget container
      this.container = this.createElement('div', {
        className: 'rp-widget-container',
        role: 'region',
        'aria-label': this.t('widget.title') || 'Rewards Widget'
      });

      // Render initial state
      if (this.state.isMinimized) {
        this.renderMinimized();
      } else {
        this.renderExpanded();
        // Only load data if authenticated
        if (this.config.isAuthenticated) {
          this.loadData();
        }
      }

      // Append to root
      root.appendChild(this.container);

      // Setup event listeners
      this.attachEventListeners();

      // Auto-hide if configured
      const autoHideDelay = this.config.settings?.autoHideDelay;
      if (autoHideDelay > 0 && !this.state.isMinimized) {
        setTimeout(() => this.handleMinimize(), autoHideDelay * 1000);
      }
    }

    // Load translations
    async loadTranslations() {
      try {
        const supportedLocales = ['en', 'fr', 'es', 'de'];
        let localeCode = this.locale.toLowerCase().split('-')[0];
        
        if (!supportedLocales.includes(localeCode)) {
          localeCode = 'en';
        }

        const translationUrl = `/apps/rewardspro/locales/${localeCode}.json`;
        
        const response = await fetch(translationUrl, {
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          this.translations = await response.json();
        } else {
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

    // Default translations
    getDefaultTranslations() {
      return {
        widget: {
          title: this.config.content?.title || 'Rewards Center',
          close: 'Close rewards widget',
          open: 'Open rewards widget',
          loading: 'Loading your rewards...',
          error: {
            title: 'Unable to load rewards data',
            retry: 'Try Again'
          },
          guest: {
            message: this.config.content?.guestMessage || 'Join our rewards program and earn cashback on every purchase!',
            benefits: {
              cashback: 'Earn cashback on every order',
              tiers: 'Unlock exclusive member tiers',
              rewards: 'Get personalized rewards'
            },
            signin: this.config.content?.signInText || 'Sign In',
            register: this.config.content?.registerText || 'Join Now'
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
      // Clear container
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }

      const button = this.createElement('button', {
        className: 'rp-widget-toggle rp-widget-minimized',
        'aria-label': this.t('widget.open'),
        'aria-expanded': 'false',
        type: 'button',
        onclick: this.handleMaximize
      });

      const iconSpan = this.createElement('span', {
        className: 'rp-widget-icon'
      });

      // Add icon based on style
      const iconStyle = this.config.settings?.iconStyle || 'emoji';
      if (iconStyle === 'svg') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'rp-icon-svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z');
        path.setAttribute('fill', 'currentColor');
        
        svg.appendChild(path);
        iconSpan.appendChild(svg);
      } else if (iconStyle === 'text') {
        iconSpan.textContent = 'R';
      } else {
        iconSpan.textContent = '🎁';
      }

      button.appendChild(iconSpan);
      this.container.appendChild(button);
    }

    // Render expanded state
    renderExpanded() {
      // Clear container
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }

      const panel = this.createElement('div', {
        className: 'rp-widget-panel',
        role: 'dialog',
        'aria-label': this.t('widget.title')
      });

      // Header
      const header = this.createElement('div', {
        className: 'rp-widget-header'
      });

      const title = this.createElement('h3', {
        className: 'rp-widget-title',
        textContent: this.t('widget.title')
      });

      const closeButton = this.createElement('button', {
        className: 'rp-widget-close',
        'aria-label': this.t('widget.close'),
        type: 'button',
        onclick: this.handleMinimize
      }, ['×']);

      header.appendChild(title);
      header.appendChild(closeButton);

      // Content
      const content = this.createElement('div', {
        className: 'rp-widget-content',
        role: 'main'
      });

      // Render appropriate content
      if (!this.config.isAuthenticated) {
        content.appendChild(this.createGuestContent());
      } else if (this.state.isLoading) {
        content.appendChild(this.createLoadingContent());
      } else if (this.state.error) {
        content.appendChild(this.createErrorContent());
      } else if (this.state.data) {
        content.appendChild(this.createMemberContent());
      } else {
        content.appendChild(this.createLoadingContent());
      }

      panel.appendChild(header);
      panel.appendChild(content);
      this.container.appendChild(panel);

      // Focus management
      this.manageFocus();
    }

    // Create not enrolled content (for logged-in but not enrolled customers)
    createNotEnrolledContent() {
      const container = this.createElement('div', {
        className: 'rp-not-enrolled'
      });

      // Icon
      container.appendChild(this.createElement('div', {
        className: 'rp-not-enrolled-icon',
        textContent: '🎁'
      }));

      // Message
      const message = this.state.data?.message || 'Join our rewards program to start earning cashback!';
      container.appendChild(this.createElement('p', {
        className: 'rp-not-enrolled-message',
        textContent: message
      }));

      // Benefits list
      if (this.state.data?.benefits && this.state.data.benefits.length > 0) {
        const benefitsList = this.createElement('ul', {
          className: 'rp-benefits-list'
        });
        
        this.state.data.benefits.forEach(benefit => {
          const li = this.createElement('li', {
            textContent: benefit
          });
          benefitsList.appendChild(li);
        });
        
        container.appendChild(benefitsList);
      }

      // Join button
      const joinBtn = this.createElement('button', {
        className: 'rp-button rp-button-primary',
        textContent: 'Join Rewards Program',
        onclick: () => {
          // You could add enrollment logic here or redirect to enrollment page
          window.location.href = this.config.urls?.account || '/account';
        }
      });
      container.appendChild(joinBtn);

      return container;
    }

    // Create guest content
    createGuestContent() {
      const container = this.createElement('div', {
        className: 'rp-guest-prompt'
      });

      // Icon
      container.appendChild(this.createElement('div', {
        className: 'rp-guest-icon',
        textContent: '🎁'
      }));

      // Message
      container.appendChild(this.createElement('p', {
        className: 'rp-guest-message',
        textContent: this.t('widget.guest.message')
      }));

      // Benefits
      const benefits = this.createElement('div', {
        className: 'rp-guest-benefits'
      });

      const benefitItems = [
        { icon: '💰', text: 'widget.guest.benefits.cashback' },
        { icon: '⭐', text: 'widget.guest.benefits.tiers' },
        { icon: '🎯', text: 'widget.guest.benefits.rewards' }
      ];

      benefitItems.forEach(item => {
        const benefit = this.createElement('div', {
          className: 'rp-benefit'
        });
        
        benefit.appendChild(this.createElement('span', {
          className: 'rp-benefit-icon',
          textContent: item.icon
        }));
        
        benefit.appendChild(this.createElement('span', {
          textContent: this.t(item.text)
        }));
        
        benefits.appendChild(benefit);
      });

      container.appendChild(benefits);

      // Buttons
      const buttonGroup = this.createElement('div', {
        className: 'rp-button-group'
      });

      buttonGroup.appendChild(this.createElement('a', {
        href: this.config.urls?.login || '/account/login',
        className: 'rp-button rp-button-primary',
        textContent: this.t('widget.guest.signin')
      }));

      buttonGroup.appendChild(this.createElement('a', {
        href: this.config.urls?.register || '/account/register',
        className: 'rp-button rp-button-secondary',
        textContent: this.t('widget.guest.register')
      }));

      container.appendChild(buttonGroup);

      return container;
    }

    // Create loading content
    createLoadingContent() {
      const container = this.createElement('div', {
        className: 'rp-loading',
        role: 'status',
        'aria-live': 'polite'
      });

      container.appendChild(this.createElement('div', {
        className: 'rp-spinner',
        'aria-hidden': 'true'
      }));

      container.appendChild(this.createElement('p', {
        textContent: this.t('widget.loading')
      }));

      return container;
    }

    // Create error content
    createErrorContent() {
      const container = this.createElement('div', {
        className: 'rp-error',
        role: 'alert'
      });

      container.appendChild(this.createElement('div', {
        className: 'rp-error-icon',
        textContent: '⚠️'
      }));

      container.appendChild(this.createElement('p', {
        textContent: this.t('widget.error.title')
      }));

      container.appendChild(this.createElement('button', {
        className: 'rp-button rp-retry-button',
        type: 'button',
        textContent: this.t('widget.error.retry'),
        onclick: this.handleRetry
      }));

      return container;
    }

    // Create member content
    createMemberContent() {
      const data = this.state.data;
      
      // If not enrolled, show enrollment prompt
      if (data && data.enrolled === false) {
        return this.createNotEnrolledContent();
      }
      
      const container = this.createElement('div', {
        className: 'rp-rewards-info'
      });

      // Store Credit Balance
      const balanceSection = this.createElement('div', {
        className: 'rp-balance-section'
      });

      const balance = this.createElement('div', {
        className: 'rp-balance'
      });

      balance.appendChild(this.createElement('div', {
        className: 'rp-balance-label',
        textContent: this.t('widget.member.balance.label') || 'Store Credit Balance'
      }));

      balance.appendChild(this.createElement('div', {
        className: 'rp-balance-amount',
        textContent: data.formattedCredit || '$0.00'
      }));

      balanceSection.appendChild(balance);
      container.appendChild(balanceSection);

      // Tier Information
      const tierSection = this.createElement('div', {
        className: 'rp-tier-section'
      });

      const tierBadge = this.createElement('div', {
        className: 'rp-tier-badge'
      });

      const tierName = data.tierName || 'No Tier';
      const isNoTier = tierName === 'No Tier';

      tierBadge.appendChild(this.createElement('span', {
        className: 'rp-tier-icon',
        textContent: this.getTierIcon(tierName)
      }));

      tierBadge.appendChild(this.createElement('span', {
        className: 'rp-tier-name',
        textContent: isNoTier ? tierName : this.t('widget.member.tier.current', { tier: tierName })
      }));

      tierSection.appendChild(tierBadge);

      // Cashback rate
      if (data.cashbackRate > 0) {
        tierSection.appendChild(this.createElement('div', {
          className: 'rp-cashback-rate',
          textContent: this.t('widget.member.tier.cashback', { rate: data.cashbackRate })
        }));
      } else if (isNoTier) {
        tierSection.appendChild(this.createElement('div', {
          className: 'rp-no-tier-message',
          textContent: 'Start shopping to earn rewards and unlock tiers!'
        }));
      }

      container.appendChild(tierSection);

      // Progress to next tier
      if (data.nextTier) {
        const progressSection = this.createElement('div', {
          className: 'rp-progress-section'
        });

        const progressHeader = this.createElement('div', {
          className: 'rp-progress-header'
        });

        progressHeader.appendChild(this.createElement('span', {
          textContent: this.t('widget.member.tier.progress', { nextTier: data.nextTier })
        }));

        progressHeader.appendChild(this.createElement('span', {
          className: 'rp-progress-amount',
          textContent: this.t('widget.member.tier.remaining', { amount: data.progressAmount || '' })
        }));

        progressSection.appendChild(progressHeader);

        const progressBar = this.createElement('div', {
          className: 'rp-progress-bar'
        });

        const progressFill = this.createElement('div', {
          className: 'rp-progress-fill',
          style: { width: `${Math.min(100, data.progressPercent || 0)}%` },
          role: 'progressbar',
          'aria-valuenow': String(data.progressPercent || 0),
          'aria-valuemin': '0',
          'aria-valuemax': '100'
        });

        progressBar.appendChild(progressFill);
        progressSection.appendChild(progressBar);
        container.appendChild(progressSection);
      }

      // Stats Grid
      const stats = this.createElement('div', {
        className: 'rp-stats'
      });

      if (data.lifetimeEarned) {
        const stat = this.createElement('div', {
          className: 'rp-stat'
        });
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-value',
          textContent: data.lifetimeEarned
        }));
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-label',
          textContent: this.t('widget.member.stats.earned.label') || 'Lifetime Earned'
        }));
        stats.appendChild(stat);
      }

      if (data.lifetimeSpent) {
        const stat = this.createElement('div', {
          className: 'rp-stat'
        });
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-value',
          textContent: data.lifetimeSpent
        }));
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-label',
          textContent: this.t('widget.member.stats.spent.label') || 'Total Spent'
        }));
        stats.appendChild(stat);
      }

      if (data.availableRewards) {
        const stat = this.createElement('div', {
          className: 'rp-stat'
        });
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-value',
          textContent: String(data.availableRewards)
        }));
        stat.appendChild(this.createElement('span', {
          className: 'rp-stat-label',
          textContent: this.t('widget.member.stats.rewards.label') || 'Available Rewards'
        }));
        stats.appendChild(stat);
      }

      container.appendChild(stats);

      // Action Buttons
      const actions = this.createElement('div', {
        className: 'rp-actions'
      });

      actions.appendChild(this.createElement('a', {
        href: this.config.urls?.account || '/account',
        className: 'rp-button rp-button-primary',
        textContent: this.t('widget.member.actions.dashboard') || 'View Full Dashboard'
      }));

      container.appendChild(actions);

      return container;
    }

    // Load member data
    async loadData() {
      if (this.state.isLoading) return;
      
      this.setState({ isLoading: true, error: null });
      this.updateContent();

      try {
        // Use the secure membership API endpoint
        const apiUrl = new URL(
          this.config.urls?.membershipApi || '/apps/rewardspro/membership',
          window.location.origin
        );
        
        console.log('RewardsPro: Loading data from', apiUrl.toString());
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

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
          this.config.isAuthenticated = false;
          this.setState({ isLoading: false });
          this.renderExpanded();
          return;
        }

        // Check if customer is enrolled
        if (data.enrolled === false) {
          console.log('RewardsPro: Customer not enrolled in rewards program');
          // Store the not enrolled state
          this.setState({ 
            data: {
              enrolled: false,
              message: data.message || 'Join our rewards program!',
              benefits: data.benefits || []
            },
            isLoading: false,
            error: null
          });
          this.updateContent();
          return;
        }

        // Success - Handle the nested memberData structure from API
        const memberData = data.memberData || {};
        const processedData = {
          enrolled: true,
          ...data,
          formattedCredit: memberData.storeCredit || '$0.00',
          tierName: memberData.tierName || 'No Tier',
          cashbackRate: memberData.cashbackRate || 0,
          lifetimeEarned: memberData.lifetimeEarned || '$0.00',
          lifetimeSpent: memberData.lifetimeSpent || '$0.00',
          progressToNextTier: memberData.progressToNextTier || 0,
          remainingToNextTier: memberData.remainingToNextTier || null,
          nextTier: memberData.nextTier || null,
          availableRewards: memberData.availableRewards || 0
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
        // Clear content
        while (contentArea.firstChild) {
          contentArea.removeChild(contentArea.firstChild);
        }

        // Add new content
        if (!this.config.isAuthenticated) {
          contentArea.appendChild(this.createGuestContent());
        } else if (this.state.isLoading) {
          contentArea.appendChild(this.createLoadingContent());
        } else if (this.state.error) {
          contentArea.appendChild(this.createErrorContent());
        } else if (this.state.data) {
          contentArea.appendChild(this.createMemberContent());
        }
      }
    }

    // Event Handlers
    handleMinimize() {
      this.setState({ isMinimized: true });
      if (this.config.settings?.rememberState) {
        this.storeState(true);
      }
      this.renderMinimized();
      this.announceToScreenReader(this.t('widget.accessibility.minimized'));
    }

    handleMaximize() {
      this.setState({ isMinimized: false });
      if (this.config.settings?.rememberState) {
        this.storeState(false);
      }
      this.renderExpanded();
      if (this.config.isAuthenticated && !this.state.data) {
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
      document.addEventListener('keydown', this.handleKeydown);

      window.addEventListener('beforeunload', () => {
        document.removeEventListener('keydown', this.handleKeydown);
      });
    }

    // Focus management for accessibility
    manageFocus() {
      const panel = this.container.querySelector('.rp-widget-panel');
      if (!panel) return;

      this.previousFocus = document.activeElement;

      const focusableElements = panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length > 0) {
        focusableElements[0].focus();

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

    getTierIcon(tierName) {
      const name = tierName.toLowerCase();
      if (name === 'no tier') return '👤';
      if (name.includes('vip') || name.includes('diamond')) return '💎';
      if (name.includes('gold')) return '🏆';
      if (name.includes('silver')) return '🥈';
      if (name.includes('bronze')) return '🥉';
      return '⭐';
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