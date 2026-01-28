/**
 * RewardsPro Activity Teasers - Dynamic Discovery Widgets
 * Handles raffle, mystery box, challenge, and rewards hub CTA teasers
 * Fetches real-time data from app proxy API endpoints
 *
 * Security: CSS injection protection via sanitized values
 * Performance: Shared utilities, debounced countdowns
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION CONSTANTS
  // ============================================
  const CONFIG = {
    API_TIMEOUT_MS: 8000,
    COUNTDOWN_INTERVAL_MS: 1000,
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000
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
    debug: (...args) => DEBUG && console.log('[ActivityTeasers]', ...args),
    warn: (...args) => console.warn('[ActivityTeasers]', ...args),
    error: (...args) => console.error('[ActivityTeasers]', ...args)
  };

  // ============================================
  // SHARED UTILITIES
  // ============================================

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  /**
   * Format countdown time remaining
   */
  function formatCountdown(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;

    if (diff <= 0) {
      return { expired: true, text: 'Ended' };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      return { expired: false, text: `${days}d ${hours}h remaining` };
    } else if (hours > 0) {
      return { expired: false, text: `${hours}h ${minutes}m remaining` };
    } else if (minutes > 0) {
      return { expired: false, text: `${minutes}m ${seconds}s remaining` };
    } else {
      return { expired: false, text: `${seconds}s remaining` };
    }
  }

  /**
   * Format currency value
   */
  function formatCurrency(amount, currency = 'USD') {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      }).format(amount || 0);
    } catch {
      return '$' + (amount || 0).toFixed(2);
    }
  }

  /**
   * Fetch with timeout and retry
   */
  async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeout);

      if (retries > 0 && error.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
        return fetchWithRetry(url, options, retries - 1);
      }

      throw error;
    }
  }

  // ============================================
  // BASE TEASER CLASS
  // ============================================

  class BaseTeaser {
    constructor(element) {
      this.root = element;
      this.blockId = element.dataset.blockId;
      this.shopDomain = element.dataset.shopDomain;
      this.apiEndpoint = element.dataset.apiEndpoint;
      this.isAuthenticated = element.dataset.authenticated === 'true';
      this.customerId = element.dataset.customerId;

      this.elements = {
        loading: element.querySelector('[class$="__loading"]'),
        content: element.querySelector('[class$="__content"]'),
        empty: element.querySelector('[class$="__empty"]'),
        error: element.querySelector('[class$="__error"]')
      };

      this.state = {
        data: null,
        isLoading: true,
        error: null
      };

      this.countdownIntervals = [];
    }

    /**
     * Initialize the teaser
     */
    async initialize() {
      if (this.root.dataset.initialized === 'true') {
        return;
      }
      this.root.dataset.initialized = 'true';

      log.debug(`Initializing ${this.constructor.name}`, { blockId: this.blockId });

      this.showLoading();
      await this.fetchData();
    }

    /**
     * Build API URL
     */
    buildApiUrl() {
      const url = new URL(this.apiEndpoint, window.location.origin);
      url.searchParams.append('shop', this.shopDomain);
      if (this.customerId) {
        url.searchParams.append('logged_in_customer_id', this.customerId);
      }
      return url.toString();
    }

    /**
     * Fetch data from API
     */
    async fetchData() {
      try {
        const url = this.buildApiUrl();
        log.debug(`Fetching: ${url}`);

        const data = await fetchWithRetry(url);
        this.state.data = data;
        this.state.error = null;

        this.render();
      } catch (error) {
        log.error(`Fetch error: ${error.message}`);
        this.state.error = error.message;
        this.showError();
      } finally {
        this.state.isLoading = false;
      }
    }

    /**
     * Show loading state
     */
    showLoading() {
      this.hideAll();
      if (this.elements.loading) {
        this.elements.loading.style.display = '';
      }
    }

    /**
     * Show error state
     */
    showError() {
      this.hideAll();
      if (this.elements.error) {
        this.elements.error.style.display = '';
      }
    }

    /**
     * Show empty state
     */
    showEmpty() {
      this.hideAll();
      if (this.elements.empty) {
        this.elements.empty.style.display = '';
      }
    }

    /**
     * Show content
     */
    showContent() {
      this.hideAll();
      if (this.elements.content) {
        this.elements.content.style.display = '';
      }
    }

    /**
     * Hide all state containers
     */
    hideAll() {
      Object.values(this.elements).forEach(el => {
        if (el) el.style.display = 'none';
      });
    }

    /**
     * Render content - override in subclasses
     */
    render() {
      throw new Error('render() must be implemented by subclass');
    }

    /**
     * Start countdown timer
     */
    startCountdown(element, endDate) {
      const update = () => {
        const countdown = formatCountdown(endDate);
        element.textContent = countdown.text;
        if (countdown.expired) {
          element.classList.add('rp-teaser__countdown--expired');
        }
      };

      update();
      const interval = setInterval(update, CONFIG.COUNTDOWN_INTERVAL_MS);
      this.countdownIntervals.push(interval);
    }

    /**
     * Clean up intervals
     */
    destroy() {
      this.countdownIntervals.forEach(clearInterval);
      this.countdownIntervals = [];
    }
  }

  // ============================================
  // RAFFLE TEASER
  // ============================================

  class RaffleTeaser extends BaseTeaser {
    constructor(element) {
      super(element);
      this.displayMode = element.dataset.displayMode || 'featured';
      this.showEntryCount = element.dataset.showEntryCount !== 'false';
      this.showCountdown = element.dataset.showCountdown !== 'false';
      this.ctaText = element.dataset.ctaText || 'Enter Now';
      this.ctaUrl = element.dataset.ctaUrl || '/account';
      this.guestCtaText = element.dataset.guestCtaText || 'Sign In to Enter';
      this.guestCtaUrl = element.dataset.guestCtaUrl || '/account/login';
      this.maxDisplay = parseInt(element.dataset.maxDisplay) || 1;
    }

    render() {
      const data = this.state.data;

      if (!data?.raffles || data.raffles.length === 0) {
        this.showEmpty();
        return;
      }

      // Filter and limit raffles
      let raffles = data.raffles.filter(r => r.status === 'ACTIVE');
      if (this.displayMode === 'featured') {
        raffles = raffles.slice(0, 1);
      } else {
        raffles = raffles.slice(0, this.maxDisplay);
      }

      if (raffles.length === 0) {
        this.showEmpty();
        return;
      }

      // Build HTML
      const html = raffles.map(raffle => this.renderRaffleCard(raffle)).join('');
      this.elements.content.innerHTML = html;
      this.showContent();

      // Start countdowns
      if (this.showCountdown) {
        this.elements.content.querySelectorAll('[data-countdown]').forEach(el => {
          this.startCountdown(el, el.dataset.countdown);
        });
      }
    }

    renderRaffleCard(raffle) {
      const ctaText = this.isAuthenticated ? this.ctaText : this.guestCtaText;
      const ctaUrl = this.isAuthenticated ? this.ctaUrl : this.guestCtaUrl;

      return `
        <div class="rp-teaser__card rp-raffle-card">
          ${raffle.imageUrl ? `<div class="rp-teaser__image" style="background-image: url('${escapeHtml(raffle.imageUrl)}')"></div>` : ''}
          <div class="rp-teaser__body">
            <h4 class="rp-teaser__title">${escapeHtml(raffle.name)}</h4>
            ${raffle.prize ? `<p class="rp-teaser__subtitle">${escapeHtml(raffle.prize)}</p>` : ''}
            <div class="rp-teaser__meta">
              ${this.showEntryCount ? `
                <span class="rp-teaser__entry-count">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  ${raffle.totalEntries || 0} entries
                </span>
              ` : ''}
              ${this.showCountdown && raffle.endDate ? `
                <span class="rp-teaser__countdown" data-countdown="${raffle.endDate}">
                  Loading...
                </span>
              ` : ''}
            </div>
            <a href="${escapeHtml(ctaUrl)}" class="rp-teaser__cta">
              ${escapeHtml(ctaText)}
            </a>
          </div>
        </div>
      `;
    }
  }

  // ============================================
  // MYSTERY BOX TEASER
  // ============================================

  class MysteryBoxTeaser extends BaseTeaser {
    constructor(element) {
      super(element);
      this.displayMode = element.dataset.displayMode || 'featured';
      this.showRarity = element.dataset.showRarity !== 'false';
      this.showCost = element.dataset.showCost !== 'false';
      this.ctaText = element.dataset.ctaText || 'Open Now';
      this.ctaUrl = element.dataset.ctaUrl || '/account';
      this.guestCtaText = element.dataset.guestCtaText || 'Sign In to Open';
      this.guestCtaUrl = element.dataset.guestCtaUrl || '/account/login';
      this.maxDisplay = parseInt(element.dataset.maxDisplay) || 1;
    }

    render() {
      const data = this.state.data;

      if (!data?.boxes || data.boxes.length === 0) {
        this.showEmpty();
        return;
      }

      // Filter active boxes
      let boxes = data.boxes.filter(b => b.isActive);
      if (this.displayMode === 'featured') {
        boxes = boxes.slice(0, 1);
      } else {
        boxes = boxes.slice(0, this.maxDisplay);
      }

      if (boxes.length === 0) {
        this.showEmpty();
        return;
      }

      // Build HTML
      const html = boxes.map(box => this.renderBoxCard(box)).join('');
      this.elements.content.innerHTML = html;
      this.showContent();
    }

    renderBoxCard(box) {
      const ctaText = this.isAuthenticated ? this.ctaText : this.guestCtaText;
      const ctaUrl = this.isAuthenticated ? this.ctaUrl : this.guestCtaUrl;

      // Build rarity preview
      let rarityHtml = '';
      if (this.showRarity && box.rarityPreview) {
        rarityHtml = `
          <div class="rp-teaser__rarity">
            ${box.rarityPreview.map(r => `
              <span class="rp-teaser__rarity-item rp-rarity--${r.rarity.toLowerCase()}">
                ${escapeHtml(r.rarity)}: ${r.chance}%
              </span>
            `).join('')}
          </div>
        `;
      }

      return `
        <div class="rp-teaser__card rp-mystery-box-card">
          <div class="rp-teaser__icon-container">
            <span class="rp-teaser__icon">🎁</span>
          </div>
          <div class="rp-teaser__body">
            <h4 class="rp-teaser__title">${escapeHtml(box.name)}</h4>
            ${box.description ? `<p class="rp-teaser__subtitle">${escapeHtml(box.description)}</p>` : ''}
            ${rarityHtml}
            ${this.showCost && box.pointsCost ? `
              <div class="rp-teaser__cost">
                <span class="rp-teaser__cost-value">${box.pointsCost.toLocaleString()} points</span>
                to open
              </div>
            ` : ''}
            <a href="${escapeHtml(ctaUrl)}" class="rp-teaser__cta">
              ${escapeHtml(ctaText)}
            </a>
          </div>
        </div>
      `;
    }
  }

  // ============================================
  // CHALLENGE TEASER
  // ============================================

  class ChallengeTeaser extends BaseTeaser {
    constructor(element) {
      super(element);
      this.displayMode = element.dataset.displayMode || 'featured';
      this.showProgress = element.dataset.showProgress !== 'false';
      this.showReward = element.dataset.showReward !== 'false';
      this.showCountdown = element.dataset.showCountdown !== 'false';
      this.ctaText = element.dataset.ctaText || 'View Challenge';
      this.ctaUrl = element.dataset.ctaUrl || '/account';
      this.guestCtaText = element.dataset.guestCtaText || 'Sign In to Join';
      this.guestCtaUrl = element.dataset.guestCtaUrl || '/account/login';
      this.maxDisplay = parseInt(element.dataset.maxDisplay) || 1;
    }

    render() {
      const data = this.state.data;

      if (!data?.challenges || data.challenges.length === 0) {
        this.showEmpty();
        return;
      }

      // Filter based on display mode
      let challenges = data.challenges.filter(c => c.status === 'ACTIVE');

      if (this.displayMode === 'featured') {
        challenges = challenges.slice(0, 1);
      } else if (this.displayMode === 'in_progress' && this.isAuthenticated) {
        challenges = challenges.filter(c => c.userProgress && c.userProgress.current > 0);
      }

      challenges = challenges.slice(0, this.maxDisplay);

      if (challenges.length === 0) {
        this.showEmpty();
        return;
      }

      // Build HTML
      const html = challenges.map(challenge => this.renderChallengeCard(challenge)).join('');
      this.elements.content.innerHTML = html;
      this.showContent();

      // Start countdowns
      if (this.showCountdown) {
        this.elements.content.querySelectorAll('[data-countdown]').forEach(el => {
          this.startCountdown(el, el.dataset.countdown);
        });
      }
    }

    renderChallengeCard(challenge) {
      const ctaText = this.isAuthenticated ? this.ctaText : this.guestCtaText;
      const ctaUrl = this.isAuthenticated ? this.ctaUrl : this.guestCtaUrl;

      // Progress bar
      let progressHtml = '';
      if (this.showProgress && challenge.userProgress && this.isAuthenticated) {
        const percent = Math.min(100, Math.round((challenge.userProgress.current / challenge.userProgress.target) * 100));
        progressHtml = `
          <div class="rp-teaser__progress">
            <div class="rp-teaser__progress-bar">
              <div class="rp-teaser__progress-fill" style="width: ${percent}%"></div>
            </div>
            <span class="rp-teaser__progress-text">
              ${challenge.userProgress.current} / ${challenge.userProgress.target}
            </span>
          </div>
        `;
      }

      // Reward display
      let rewardHtml = '';
      if (this.showReward && challenge.reward) {
        rewardHtml = `
          <div class="rp-teaser__reward">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="8" r="7"/>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
            </svg>
            ${escapeHtml(challenge.reward.description || challenge.reward.points + ' points')}
          </div>
        `;
      }

      return `
        <div class="rp-teaser__card rp-challenge-card">
          <div class="rp-teaser__icon-container">
            <span class="rp-teaser__icon">🏆</span>
          </div>
          <div class="rp-teaser__body">
            <h4 class="rp-teaser__title">${escapeHtml(challenge.name)}</h4>
            ${challenge.description ? `<p class="rp-teaser__subtitle">${escapeHtml(challenge.description)}</p>` : ''}
            ${progressHtml}
            ${rewardHtml}
            ${this.showCountdown && challenge.endDate ? `
              <span class="rp-teaser__countdown" data-countdown="${challenge.endDate}">
                Loading...
              </span>
            ` : ''}
            <a href="${escapeHtml(ctaUrl)}" class="rp-teaser__cta">
              ${escapeHtml(ctaText)}
            </a>
          </div>
        </div>
      `;
    }
  }

  // ============================================
  // REWARDS HUB CTA TEASER
  // ============================================

  class RewardsHubCta extends BaseTeaser {
    constructor(element) {
      super(element);
      this.layout = element.dataset.layout || 'horizontal';
      this.showPoints = element.dataset.showPoints !== 'false';
      this.showTier = element.dataset.showTier !== 'false';
      this.showActivities = element.dataset.showActivities !== 'false';
    }

    render() {
      const data = this.state.data;

      if (!data) {
        // For guest users or when no API data, show static content
        this.showContent();
        return;
      }

      // Render authenticated summary
      if (this.isAuthenticated && data.customer) {
        this.renderAuthenticatedSummary(data);
      } else {
        this.renderGuestHighlights(data);
      }

      this.showContent();
    }

    renderAuthenticatedSummary(data) {
      const summary = this.elements.content.querySelector('.rp-rewards-hub-cta__summary');
      if (!summary) return;

      let html = '';

      if (this.showPoints && data.customer.pointsBalance !== undefined) {
        html += `
          <div class="rp-cta-stat">
            <span class="rp-cta-stat__value">${data.customer.pointsBalance.toLocaleString()}</span>
            <span class="rp-cta-stat__label">Points</span>
          </div>
        `;
      }

      if (this.showTier && data.customer.tierName) {
        html += `
          <div class="rp-cta-stat">
            <span class="rp-cta-stat__value">${escapeHtml(data.customer.tierName)}</span>
            <span class="rp-cta-stat__label">Tier</span>
          </div>
        `;
      }

      if (this.showActivities) {
        const activities = [];
        if (data.activeRaffles) activities.push(`${data.activeRaffles} raffle${data.activeRaffles !== 1 ? 's' : ''}`);
        if (data.activeChallenges) activities.push(`${data.activeChallenges} challenge${data.activeChallenges !== 1 ? 's' : ''}`);

        if (activities.length > 0) {
          html += `
            <div class="rp-cta-stat rp-cta-stat--activities">
              <span class="rp-cta-stat__value">${activities.join(', ')}</span>
              <span class="rp-cta-stat__label">Active</span>
            </div>
          `;
        }
      }

      summary.innerHTML = html;
    }

    renderGuestHighlights(data) {
      const highlights = this.elements.content.querySelector('.rp-rewards-hub-cta__highlights');
      if (!highlights) return;

      let html = '';

      if (data.activeRaffles > 0) {
        html += `
          <span class="rp-cta-highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${data.activeRaffles} Active Raffle${data.activeRaffles !== 1 ? 's' : ''}
          </span>
        `;
      }

      if (data.activeChallenges > 0) {
        html += `
          <span class="rp-cta-highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="8" r="7"/>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
            </svg>
            ${data.activeChallenges} Active Challenge${data.activeChallenges !== 1 ? 's' : ''}
          </span>
        `;
      }

      if (data.mysteryBoxesAvailable > 0) {
        html += `
          <span class="rp-cta-highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M20 12v10H4V12"/>
              <path d="M2 7h20v5H2z"/>
              <path d="M12 22V7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
            Mystery Boxes Available
          </span>
        `;
      }

      highlights.innerHTML = html;
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  const TEASER_CLASSES = {
    'rp-raffle-teaser': RaffleTeaser,
    'rp-mystery-box-teaser': MysteryBoxTeaser,
    'rp-challenge-teaser': ChallengeTeaser,
    'rp-rewards-hub-cta': RewardsHubCta
  };

  function initializeTeasers() {
    Object.entries(TEASER_CLASSES).forEach(([className, TeaserClass]) => {
      document.querySelectorAll(`.${className}`).forEach(element => {
        if (!element.dataset.initialized) {
          const teaser = new TeaserClass(element);
          teaser.initialize();
        }
      });
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTeasers);
  } else {
    initializeTeasers();
  }

  // Re-initialize on Shopify theme editor events
  if (typeof Shopify !== 'undefined') {
    document.addEventListener('shopify:section:load', initializeTeasers);
    document.addEventListener('shopify:section:reorder', initializeTeasers);
  }

  // Expose for external use
  window.RewardsProTeasers = {
    RaffleTeaser,
    MysteryBoxTeaser,
    ChallengeTeaser,
    RewardsHubCta,
    initializeTeasers
  };

  log.debug('Activity Teasers loaded');
})();
