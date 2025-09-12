/**
 * RewardsPro Widget - Simplified Version with Hardcoded Text
 * Direct implementation without translation complexity
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
        error: null
      };
      
      this.init();
    }

    createElement(tag, props = {}, children = []) {
      const element = document.createElement(tag);
      
      Object.keys(props).forEach(key => {
        if (key === 'className') {
          element.className = props[key];
        } else if (key === 'textContent') {
          element.textContent = props[key];
        } else if (key.startsWith('data-') || key.startsWith('aria-')) {
          element.setAttribute(key, props[key]);
        } else if (key === 'onclick') {
          element.addEventListener('click', props[key]);
        } else if (key === 'style') {
          Object.assign(element.style, props[key]);
        }
      });
      
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        }
      });
      
      return element;
    }

    init() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }

    async setup() {
      const root = document.getElementById('rewardspro-widget-root');
      if (!root) {
        console.warn('RewardsPro: Widget root element not found');
        return;
      }

      this.container = this.createElement('div', {
        className: 'rp-widget-container'
      });

      this.state.isMinimized = this.config.settings?.startMinimized || false;

      if (this.state.isMinimized) {
        this.renderMinimized();
      } else {
        this.renderExpanded();
        if (this.config.isAuthenticated) {
          this.loadData();
        }
      }

      root.appendChild(this.container);
    }

    renderMinimized() {
      this.container.innerHTML = '';
      const button = this.createElement('button', {
        className: 'rp-widget-minimized',
        onclick: () => this.renderExpanded()
      });
      button.appendChild(this.createElement('span', { textContent: '🎁' }));
      this.container.appendChild(button);
    }

    renderExpanded() {
      this.container.innerHTML = '';
      
      const panel = this.createElement('div', {
        className: 'rp-widget-panel'
      });

      // Header
      const header = this.createElement('div', {
        className: 'rp-widget-header'
      });
      
      header.appendChild(this.createElement('h3', {
        className: 'rp-widget-title',
        textContent: 'Your Rewards'
      }));
      
      const closeBtn = this.createElement('button', {
        className: 'rp-close-btn',
        textContent: '×',
        onclick: () => this.renderMinimized()
      });
      header.appendChild(closeBtn);

      // Content
      const content = this.createElement('div', {
        className: 'rp-widget-content'
      });

      if (!this.config.isAuthenticated) {
        content.appendChild(this.createGuestContent());
      } else if (this.state.isLoading) {
        content.appendChild(this.createLoadingContent());
      } else if (this.state.error) {
        content.appendChild(this.createErrorContent());
      } else if (this.state.data) {
        content.appendChild(this.createMemberContent());
      }

      panel.appendChild(header);
      panel.appendChild(content);
      this.container.appendChild(panel);
      
      if (this.config.isAuthenticated && !this.state.data && !this.state.isLoading) {
        this.loadData();
      }
    }

    createGuestContent() {
      const container = this.createElement('div', {
        className: 'rp-guest-prompt'
      });

      container.appendChild(this.createElement('div', {
        className: 'rp-guest-icon',
        textContent: '🎁'
      }));

      container.appendChild(this.createElement('p', {
        className: 'rp-guest-message',
        textContent: 'Join our rewards program and earn cashback on every purchase!'
      }));

      const actions = this.createElement('div', {
        className: 'rp-guest-actions'
      });

      actions.appendChild(this.createElement('a', {
        href: this.config.urls?.login || '/account/login',
        className: 'rp-button rp-button-secondary',
        textContent: 'Sign In'
      }));

      actions.appendChild(this.createElement('a', {
        href: this.config.urls?.register || '/account/register',
        className: 'rp-button rp-button-primary',
        textContent: 'Join Now'
      }));

      container.appendChild(actions);
      return container;
    }

    createLoadingContent() {
      const container = this.createElement('div', {
        className: 'rp-loading'
      });
      
      container.appendChild(this.createElement('div', {
        className: 'rp-spinner'
      }));
      
      container.appendChild(this.createElement('p', {
        textContent: 'Loading your rewards...'
      }));
      
      return container;
    }

    createErrorContent() {
      const container = this.createElement('div', {
        className: 'rp-error'
      });
      
      container.appendChild(this.createElement('p', {
        textContent: this.state.error || 'Unable to load rewards'
      }));
      
      container.appendChild(this.createElement('button', {
        className: 'rp-button rp-button-secondary',
        textContent: 'Try Again',
        onclick: () => this.loadData()
      }));
      
      return container;
    }

    createMemberContent() {
      const data = this.state.data;
      
      if (data && data.enrolled === false) {
        return this.createNotEnrolledContent();
      }
      
      const container = this.createElement('div', {
        className: 'rp-rewards-info'
      });

      // Balance Card
      const balanceCard = this.createElement('div', {
        className: 'rp-balance-card'
      });

      balanceCard.appendChild(this.createElement('div', {
        className: 'rp-balance-label',
        textContent: 'Store Credit Balance'
      }));

      balanceCard.appendChild(this.createElement('div', {
        className: 'rp-balance-amount',
        textContent: data.formattedCredit || '$0.00'
      }));

      container.appendChild(balanceCard);

      // Tier Badge
      if (data.tierName) {
        const tierBadge = this.createElement('div', {
          className: 'rp-tier-badge'
        });
        
        tierBadge.appendChild(this.createElement('span', {
          className: 'rp-tier-icon',
          textContent: '👤'
        }));
        
        tierBadge.appendChild(this.createElement('span', {
          className: 'rp-tier-name',
          textContent: data.tierName
        }));
        
        if (data.cashbackRate > 0) {
          tierBadge.appendChild(this.createElement('span', {
            className: 'rp-tier-cashback',
            textContent: ` (${data.cashbackRate}% cashback)`
          }));
        }
        
        container.appendChild(tierBadge);
      }

      // Progress to next tier
      if (data.nextTier && data.progressToNextTier !== undefined) {
        const progress = this.createElement('div', {
          className: 'rp-tier-progress'
        });
        
        progress.appendChild(this.createElement('div', {
          className: 'rp-progress-label',
          textContent: `Progress to ${data.nextTier}`
        }));
        
        const progressBar = this.createElement('div', {
          className: 'rp-progress-bar'
        });
        
        const progressFill = this.createElement('div', {
          className: 'rp-progress-fill',
          style: { width: `${Math.min(100, data.progressToNextTier)}%` }
        });
        
        progressBar.appendChild(progressFill);
        progress.appendChild(progressBar);
        
        if (data.remainingToNextTier) {
          progress.appendChild(this.createElement('div', {
            className: 'rp-progress-remaining',
            textContent: `${data.remainingToNextTier} to reach next tier`
          }));
        }
        
        container.appendChild(progress);
      }

      // Stats
      const stats = this.createElement('div', {
        className: 'rp-stats'
      });

      const earnedStat = this.createElement('div', {
        className: 'rp-stat'
      });
      earnedStat.appendChild(this.createElement('div', {
        className: 'rp-stat-value',
        textContent: data.lifetimeEarned || '$0.00'
      }));
      earnedStat.appendChild(this.createElement('div', {
        className: 'rp-stat-label',
        textContent: 'Total Earned'
      }));
      stats.appendChild(earnedStat);

      const spentStat = this.createElement('div', {
        className: 'rp-stat'
      });
      spentStat.appendChild(this.createElement('div', {
        className: 'rp-stat-value',
        textContent: data.lifetimeSpent || '$0.00'
      }));
      spentStat.appendChild(this.createElement('div', {
        className: 'rp-stat-label',
        textContent: 'Total Spent'
      }));
      stats.appendChild(spentStat);

      container.appendChild(stats);

      // Action button
      const actions = this.createElement('div', {
        className: 'rp-actions'
      });
      
      actions.appendChild(this.createElement('a', {
        href: this.config.urls?.account || '/account',
        className: 'rp-button rp-button-primary',
        textContent: 'View Dashboard'
      }));
      
      container.appendChild(actions);

      return container;
    }

    createNotEnrolledContent() {
      const container = this.createElement('div', {
        className: 'rp-not-enrolled'
      });

      container.appendChild(this.createElement('div', {
        className: 'rp-not-enrolled-icon',
        textContent: '🎁'
      }));

      container.appendChild(this.createElement('p', {
        className: 'rp-not-enrolled-message',
        textContent: 'Start shopping to earn rewards and unlock tiers!'
      }));

      const benefits = this.createElement('ul', {
        className: 'rp-benefits-list'
      });
      
      ['Earn cashback on every purchase', 'Unlock exclusive member tiers', 'Get personalized rewards'].forEach(benefit => {
        benefits.appendChild(this.createElement('li', {
          textContent: benefit
        }));
      });
      
      container.appendChild(benefits);

      return container;
    }

    async loadData() {
      if (this.state.isLoading) return;
      
      this.state.isLoading = true;
      this.state.error = null;
      this.updateContent();

      try {
        const apiUrl = new URL('/apps/rewardspro/membership', window.location.origin);
        
        console.log('RewardsPro: Loading data from', apiUrl.toString());
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load rewards');
        }

        if (data.requiresLogin) {
          console.log('RewardsPro: Login required');
          this.config.isAuthenticated = false;
          this.state.isLoading = false;
          this.renderExpanded();
          return;
        }

        // Handle enrolled vs not enrolled
        if (data.enrolled === false) {
          console.log('RewardsPro: Customer not enrolled');
          this.state.data = {
            enrolled: false,
            message: data.message || 'Join our rewards program!'
          };
        } else {
          // Process member data
          const memberData = data.memberData || {};
          this.state.data = {
            enrolled: true,
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
          
          console.log('RewardsPro: Data loaded successfully', this.state.data);
        }
        
        this.state.isLoading = false;
        this.updateContent();

      } catch (error) {
        console.error('RewardsPro: Failed to load data', error);
        this.state.error = error.message || 'Unable to connect to rewards service';
        this.state.isLoading = false;
        this.updateContent();
      }
    }

    updateContent() {
      const contentArea = this.container.querySelector('.rp-widget-content');
      if (contentArea) {
        contentArea.innerHTML = '';
        
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
  }

  // Initialize widget when ready
  if (window.RewardsProConfig) {
    window.RewardsProWidget = new RewardsProWidget(window.RewardsProConfig);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.RewardsProConfig) {
        window.RewardsProWidget = new RewardsProWidget(window.RewardsProConfig);
      }
    });
  }
})();