// @ts-check
/**
 * RewardsPro Missions Widget
 * Gamified missions UI with XP, streaks, combos, and celebrations
 *
 * Security: HTML escaping on all dynamic content
 * Performance: LocalStorage caching with shop-specific keys
 * Accessibility: Keyboard handlers on interactive elements, ARIA attributes
 */

/**
 * @typedef {Object} ProxyErrorResponse
 * @property {false} success
 * @property {string} error - Machine-readable error message
 * @property {string} message - Human-readable error message
 */

/**
 * @typedef {Object} ProxySuccessResponse
 * @property {true} success
 * @property {string} [message]
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION CONSTANTS
  // ============================================
  const CONFIG = {
    API_TIMEOUT_MS: 10000,
    API_MAX_RETRIES: 3,
    API_RETRY_BASE_MS: 1000,
    API_RETRY_MAX_MS: 10000,
    DEFAULT_CACHE_DURATION_S: 30,
    CACHE_VERSION: 1,
    CELEBRATION_DURATION_MS: 4000,
    CONFETTI_PARTICLE_COUNT: 60
  };

  // ============================================
  // DEBUG UTILITY
  // Enable via: localStorage.setItem('rp-missions-debug', 'true')
  // ============================================
  const DEBUG = (() => {
    try {
      return localStorage.getItem('rp-missions-debug') === 'true';
    } catch {
      return false;
    }
  })();

  const log = {
    debug: (...args) => DEBUG && console.log('[MissionsWidget]', ...args),
    info: (...args) => DEBUG && console.log('[MissionsWidget]', ...args),
    warn: (...args) => console.warn('[MissionsWidget]', ...args),
    error: (...args) => console.error('[MissionsWidget]', ...args)
  };

  // ============================================
  // SECURITY UTILITIES
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
   * Validate numeric value within range
   */
  function sanitizeNumber(value, defaultValue, min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = Infinity;
    const num = parseFloat(value);
    if (isNaN(num) || num < min || num > max) return defaultValue;
    return num;
  }

  // ============================================
  // RARITY CONFIGURATION
  // ============================================
  const RARITY_CONFIG = {
    COMMON:    { label: 'Common',    cssClass: 'rp-missions-rarity--common',    accent: '#9ca3af' },
    UNCOMMON:  { label: 'Uncommon',  cssClass: 'rp-missions-rarity--uncommon',  accent: '#22c55e' },
    RARE:      { label: 'Rare',      cssClass: 'rp-missions-rarity--rare',      accent: '#3b82f6' },
    EPIC:      { label: 'Epic',      cssClass: 'rp-missions-rarity--epic',      accent: '#a855f7' },
    LEGENDARY: { label: 'Legendary', cssClass: 'rp-missions-rarity--legendary', accent: '#f59e0b' }
  };

  // Streak emoji from streak count (mirrors STREAK_TIERS in mission-streak.server.ts)
  // player.streakEmoji is deprecated (always ""), so we derive client-side from streak count
  function getStreakEmoji(streakDays) {
    if (streakDays >= 30) return '\uD83D\uDC8E'; // 💎 Legendary
    if (streakDays >= 14) return '\u26A1';        // ⚡ Blazing
    if (streakDays >= 7)  return '\uD83D\uDD25';  // 🔥 On Fire
    if (streakDays >= 3)  return '\u2B50';         // ⭐ Star Streak
    if (streakDays >= 1)  return '\u2728';         // ✨ Building
    return '';
  }

  const CADENCES = ['daily', 'weekly', 'monthly', 'special'];

  // ============================================
  // MISSIONS WIDGET CLASS
  // ============================================

  class MissionsWidget {
    constructor(rootElement) {
      this.root = rootElement;
      this.config = this.parseConfiguration();
      this.state = {
        isLoading: false,
        data: null,
        error: null,
        activeTab: this.config.defaultTab,
        claimingId: null
      };

      // Prevent double initialization
      if (this.root.dataset.initialized === 'true') {
        return;
      }
      this.root.dataset.initialized = 'true';
    }

    /**
     * Parse all configuration from data attributes
     */
    parseConfiguration() {
      const dataset = this.root.dataset;

      return {
        isAuthenticated: dataset.state === 'authenticated',

        customerId: dataset.customerId || null,
        shopDomain: dataset.shopDomain || '',

        api: {
          endpoint: dataset.apiEndpoint || '/apps/rewardspro/missions',
          claimEndpoint: dataset.claimEndpoint || '/apps/rewardspro/challenges/claim',
          eventsAckEndpoint: dataset.eventsAckEndpoint || '/apps/rewardspro/missions/events/ack',
          cacheDuration: parseInt(dataset.cacheDuration) || CONFIG.DEFAULT_CACHE_DURATION_S
        },

        defaultTab: dataset.defaultTab || 'daily',

        guest: {
          message: dataset.message || '',
          ctaText: dataset.ctaText || 'Sign In',
          ctaUrl: dataset.ctaUrl || '/account/login'
        }
      };
    }

    /**
     * Initialize widget
     */
    async init() {
      log.info('Initializing', {
        authenticated: this.config.isAuthenticated,
        customerId: this.config.customerId
      });

      if (!this.config.isAuthenticated) {
        this.renderGuest();
        return;
      }

      // Check cache first
      const cachedData = this.getCachedData();
      if (cachedData) {
        log.debug('Using cached data');
        this.state.data = cachedData;
        this.render();
      } else {
        this.renderLoading();
      }

      // Fetch fresh data
      await this.fetchMissionsData();
    }

    // ============================================
    // API METHODS
    // ============================================

    /**
     * Fetch with exponential backoff retry
     */
    async fetchWithRetry(url, options, attempt) {
      if (attempt === undefined) attempt = 0;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        return response;
      } catch (error) {
        if (error.name === 'AbortError' || attempt >= CONFIG.API_MAX_RETRIES - 1) {
          throw error;
        }

        const delay = Math.min(
          CONFIG.API_RETRY_BASE_MS * Math.pow(2, attempt),
          CONFIG.API_RETRY_MAX_MS
        );

        log.debug('Retry ' + (attempt + 1) + '/' + CONFIG.API_MAX_RETRIES + ' after ' + delay + 'ms');
        await new Promise(function(resolve) { setTimeout(resolve, delay); });

        return this.fetchWithRetry(url, options, attempt + 1);
      }
    }

    /**
     * GET /missions — full missions + player stats
     */
    async fetchMissionsData() {
      if (!this.config.customerId) {
        log.error('Missing customer ID');
        this.renderError('Configuration error');
        return;
      }

      this.state.isLoading = true;

      try {
        const url = new URL(this.config.api.endpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        log.debug('Fetching missions from:', url.toString());

        const response = await this.fetchWithRetry(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();
        log.debug('Missions response', { success: data.success, enabled: data.enabled });

        if (!data.success) {
          throw new Error(data.error || data.message || 'Failed to load missions');
        }

        // Missions disabled — show nothing
        if (data.enabled === false) {
          this.root.style.display = 'none';
          return;
        }

        this.state.data = data;
        this.state.error = null;

        // Cache fresh data
        this.cacheData(data);

        // Render full widget
        this.render();

        // Process pending celebration events
        if (data.pendingEvents && data.pendingEvents.length > 0) {
          this.processCelebrations(data.pendingEvents);
        }

      } catch (error) {
        log.error('Fetch error:', error.message);

        // Try cached data on error
        const cachedData = this.getCachedData();
        if (cachedData) {
          log.debug('Using stale cache after error');
          this.state.data = cachedData;
          this.render();
        } else {
          this.renderError(error.name === 'AbortError' ? 'Request timed out' : 'Failed to load missions');
        }
      } finally {
        this.state.isLoading = false;
      }
    }

    /**
     * POST /challenges/claim — claim a completed mission reward
     */
    async claimReward(missionId) {
      if (this.state.claimingId) return; // Prevent double-claim
      this.state.claimingId = missionId;

      // Update button state
      const btn = this.root.querySelector('[data-claim-id="' + missionId + '"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Claiming...';
        btn.classList.add('rp-missions-btn--loading');
      }

      try {
        const url = new URL(this.config.api.claimEndpoint, window.location.origin);

        const response = await this.fetchWithRetry(url.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            challengeId: missionId,
            logged_in_customer_id: this.config.customerId
          })
        });

        /** @type {ProxySuccessResponse | ProxyErrorResponse} */
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || data.message || 'Failed to claim reward');
        }

        log.debug('Reward claimed', data.reward);

        // Clear cache so next fetch is fresh
        this.clearCache();

        // Refresh missions data
        await this.fetchMissionsData();

      } catch (error) {
        log.error('Claim error:', error.message);

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Claim Reward';
          btn.classList.remove('rp-missions-btn--loading');
        }

        this.showToast('Failed to claim reward. Please try again.');
      } finally {
        this.state.claimingId = null;
      }
    }

    /**
     * POST /missions/events/ack — acknowledge displayed events
     */
    async ackEvents(eventIds) {
      if (!eventIds || eventIds.length === 0) return;

      try {
        const url = new URL(this.config.api.eventsAckEndpoint, window.location.origin);

        await this.fetchWithRetry(url.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            eventIds: eventIds,
            logged_in_customer_id: this.config.customerId
          })
        });

        log.debug('Events acknowledged:', eventIds.length);
      } catch (error) {
        log.warn('Failed to acknowledge events:', error.message);
      }
    }

    // ============================================
    // CACHE METHODS
    // ============================================

    getCachedData() {
      if (!this.config.customerId) return null;

      try {
        var key = 'rp-missions-' + this.config.shopDomain + '-' + this.config.customerId;
        var cached = localStorage.getItem(key);
        if (!cached) return null;

        var parsed = JSON.parse(cached);
        if (parsed.version !== CONFIG.CACHE_VERSION) {
          this.clearCache();
          return null;
        }

        var age = (Date.now() - parsed.timestamp) / 1000;
        if (age < this.config.api.cacheDuration) {
          log.debug('Cache hit (age: ' + Math.round(age) + 's)');
          return parsed.data;
        }

        log.debug('Cache expired (age: ' + Math.round(age) + 's)');
        return null;
      } catch (error) {
        log.error('Cache read error:', error.message);
        try {
          localStorage.removeItem('rp-missions-' + this.config.shopDomain + '-' + this.config.customerId);
        } catch (e) {}
        return null;
      }
    }

    cacheData(data) {
      if (!this.config.customerId) return;

      try {
        var key = 'rp-missions-' + this.config.shopDomain + '-' + this.config.customerId;
        localStorage.setItem(key, JSON.stringify({
          data: data,
          timestamp: Date.now(),
          version: CONFIG.CACHE_VERSION
        }));
        log.debug('Data cached');
      } catch (error) {
        log.error('Cache write error:', error.message);
      }
    }

    clearCache() {
      if (!this.config.customerId) return;

      try {
        var key = 'rp-missions-' + this.config.shopDomain + '-' + this.config.customerId;
        localStorage.removeItem(key);
        log.debug('Cache cleared');
      } catch (error) {
        log.error('Cache clear error:', error.message);
      }
    }

    // ============================================
    // RENDER METHODS
    // ============================================

    /**
     * Main render dispatcher
     */
    render() {
      if (!this.state.data) {
        this.renderLoading();
        return;
      }

      var data = this.state.data;
      var player = data.player;
      var missions = data.missions || { daily: [], weekly: [], monthly: [], special: [] };

      var html = '<div class="rp-missions-widget">';

      // Player stats header
      html += this.renderPlayerStats(player);

      // Cadence tabs + mission cards
      html += this.renderTabs(missions);

      html += '</div>';

      this.root.innerHTML = html;
      this.attachEventListeners();
    }

    /**
     * Player stats header — level, XP bar, streak, combo
     */
    renderPlayerStats(player) {
      if (!player) return '';

      var level = sanitizeNumber(player.level, 1, 1, 9999);
      var xpPercent = sanitizeNumber(player.xpProgressPercent, 0, 0, 100);
      var xpProgress = sanitizeNumber(player.xpProgress, 0, 0, Infinity);
      var xpToNext = sanitizeNumber(player.xpToNextLevel, 0, 0, Infinity);
      var streak = sanitizeNumber(player.streak, 0, 0, 9999);
      // player.streakEmoji is deprecated (always ""), derive from streak count instead
      var streakEmoji = getStreakEmoji(streak);
      var streakBonus = sanitizeNumber(player.streakBonus, 0, 0, 1000);
      var comboCount = sanitizeNumber(player.todayComboCount, 0, 0, 999);
      var comboBonus = sanitizeNumber(player.comboBonus, 0, 0, 1000);
      var totalCompleted = sanitizeNumber(player.totalCompleted, 0, 0, Infinity);

      var html = '<div class="rp-missions-stats">';

      // Level + XP bar
      html += '<div class="rp-missions-stats__level">';
      html += '<div class="rp-missions-stats__level-badge">';
      html += '<span class="rp-missions-stats__level-num">' + level + '</span>';
      html += '</div>';
      html += '<div class="rp-missions-stats__xp">';
      html += '<div class="rp-missions-stats__xp-label">Level ' + level + '</div>';
      html += '<div class="rp-missions-stats__xp-bar">';
      html += '<div class="rp-missions-stats__xp-fill" style="width: ' + xpPercent + '%"></div>';
      html += '</div>';
      html += '<div class="rp-missions-stats__xp-text">' + xpProgress + ' / ' + xpToNext + ' XP</div>';
      html += '</div>';
      html += '</div>';

      // Streak + Combo row
      html += '<div class="rp-missions-stats__bonuses">';

      if (streak > 0) {
        html += '<div class="rp-missions-stats__streak">';
        html += '<span class="rp-missions-stats__streak-emoji">' + streakEmoji + '</span>';
        html += '<span class="rp-missions-stats__streak-count">' + streak + ' day streak</span>';
        if (streakBonus > 0) {
          html += '<span class="rp-missions-stats__bonus-badge">+' + streakBonus + '% XP</span>';
        }
        html += '</div>';
      }

      if (comboCount > 0) {
        html += '<div class="rp-missions-stats__combo">';
        html += '<span class="rp-missions-stats__combo-icon">&#x26A1;</span>';
        html += '<span class="rp-missions-stats__combo-count">' + comboCount + 'x combo</span>';
        if (comboBonus > 0) {
          html += '<span class="rp-missions-stats__bonus-badge">+' + comboBonus + '% XP</span>';
        }
        html += '</div>';
      }

      html += '</div>';

      // Total completed
      html += '<div class="rp-missions-stats__total">';
      html += '<span>' + totalCompleted + ' missions completed</span>';
      html += '</div>';

      html += '</div>';
      return html;
    }

    /**
     * Cadence tabs + mission card list
     */
    renderTabs(missions) {
      var activeTab = this.state.activeTab;
      var html = '';

      // Tab bar
      html += '<div class="rp-missions-tabs" role="tablist">';
      for (var i = 0; i < CADENCES.length; i++) {
        var cadence = CADENCES[i];
        var list = missions[cadence] || [];
        var isActive = cadence === activeTab;
        var label = cadence.charAt(0).toUpperCase() + cadence.slice(1);

        html += '<button class="rp-missions-tab' + (isActive ? ' rp-missions-tab--active' : '') + '"';
        html += ' role="tab" aria-selected="' + isActive + '"';
        html += ' data-tab="' + cadence + '"';
        html += ' tabindex="' + (isActive ? '0' : '-1') + '">';
        html += escapeHtml(label);
        if (list.length > 0) {
          html += ' <span class="rp-missions-tab__count">' + list.length + '</span>';
        }
        html += '</button>';
      }
      html += '</div>';

      // Tab panels
      for (var j = 0; j < CADENCES.length; j++) {
        var cad = CADENCES[j];
        var missionList = missions[cad] || [];
        var visible = cad === activeTab;

        html += '<div class="rp-missions-panel' + (visible ? ' rp-missions-panel--active' : '') + '"';
        html += ' role="tabpanel" data-panel="' + cad + '"';
        html += ' ' + (visible ? '' : 'hidden') + '>';

        if (missionList.length === 0) {
          html += '<div class="rp-missions-empty">';
          html += '<span class="rp-missions-empty__icon">&#x1F50D;</span>';
          html += '<p>No ' + escapeHtml(cad) + ' missions right now.</p>';
          html += '<p class="rp-missions-empty__sub">Check back soon!</p>';
          html += '</div>';
        } else {
          html += '<div class="rp-missions-cards">';
          for (var k = 0; k < missionList.length; k++) {
            html += this.renderMissionCard(missionList[k]);
          }
          html += '</div>';
        }

        html += '</div>';
      }

      return html;
    }

    /**
     * Individual mission card
     */
    renderMissionCard(mission) {
      var rarity = RARITY_CONFIG[mission.rarity] || RARITY_CONFIG.COMMON;
      var objective = mission.objective || { type: '', target: 1, current: 0, percent: 0 };
      var percent = sanitizeNumber(objective.percent, 0, 0, 100);
      var status = mission.status || 'AVAILABLE';
      var icon = escapeHtml(mission.iconEmoji || '&#x2B50;');
      var name = escapeHtml(mission.name || 'Mission');
      var desc = escapeHtml(mission.description || '');
      var xp = sanitizeNumber(mission.xpReward, 0, 0, Infinity);
      var rewardDesc = escapeHtml(mission.reward ? mission.reward.description : '');
      var timeRemaining = escapeHtml(mission.timeRemaining || '');

      var html = '<div class="rp-missions-card ' + rarity.cssClass + '">';

      // Card header: icon + name + XP badge
      html += '<div class="rp-missions-card__header">';
      html += '<span class="rp-missions-card__icon">' + icon + '</span>';
      html += '<div class="rp-missions-card__info">';
      html += '<h4 class="rp-missions-card__name">' + name + '</h4>';
      if (desc) {
        html += '<p class="rp-missions-card__desc">' + desc + '</p>';
      }
      html += '</div>';
      html += '<div class="rp-missions-card__xp-badge">+' + xp + ' XP</div>';
      html += '</div>';

      // Progress bar
      html += '<div class="rp-missions-card__progress">';
      html += '<div class="rp-missions-card__progress-bar">';
      html += '<div class="rp-missions-card__progress-fill" style="width: ' + percent + '%"></div>';
      html += '</div>';
      html += '<div class="rp-missions-card__progress-text">';
      html += '<span>' + objective.current + ' / ' + objective.target + '</span>';
      html += '<span>' + percent + '%</span>';
      html += '</div>';
      html += '</div>';

      // Footer: reward + time remaining + CTA
      html += '<div class="rp-missions-card__footer">';

      if (rewardDesc) {
        html += '<span class="rp-missions-card__reward">' + rewardDesc + '</span>';
      }

      if (timeRemaining) {
        html += '<span class="rp-missions-card__time">' + timeRemaining + '</span>';
      }

      // Status CTA
      if (status === 'COMPLETED') {
        html += '<button class="rp-missions-btn rp-missions-btn--claim" data-claim-id="' + escapeHtml(mission.id) + '">';
        html += 'Claim Reward';
        html += '</button>';
      } else if (status === 'CLAIMED') {
        html += '<span class="rp-missions-card__claimed">&#x2713; Completed</span>';
      }

      html += '</div>';

      html += '</div>';
      return html;
    }

    /**
     * Guest state — sign-in prompt
     */
    renderGuest() {
      var message = escapeHtml(this.config.guest.message || 'Complete missions to earn XP and level up!');
      var ctaUrl = escapeHtml(this.config.guest.ctaUrl);
      var ctaText = escapeHtml(this.config.guest.ctaText);

      this.root.innerHTML =
        '<div class="rp-missions-widget rp-missions-widget--guest">' +
          '<div class="rp-missions-guest">' +
            '<span class="rp-missions-guest__icon">&#x1F3AF;</span>' +
            '<h3 class="rp-missions-guest__title">Missions</h3>' +
            '<p class="rp-missions-guest__message">' + message + '</p>' +
            '<a href="' + ctaUrl + '" class="rp-missions-btn rp-missions-btn--primary">' + ctaText + '</a>' +
          '</div>' +
        '</div>';
    }

    /**
     * Loading state — skeleton UI matching real layout
     */
    renderLoading() {
      var cardSkeleton = function(delay) {
        return '<div class="rp-missions-skeleton__card" style="animation-delay:' + delay + 's">' +
          '<div class="rp-missions-skeleton__card-header">' +
            '<div class="rp-missions-skeleton__card-icon"></div>' +
            '<div class="rp-missions-skeleton__card-lines">' +
              '<div class="rp-missions-skeleton__card-line rp-missions-skeleton__card-line--name"></div>' +
              '<div class="rp-missions-skeleton__card-line rp-missions-skeleton__card-line--desc"></div>' +
            '</div>' +
            '<div class="rp-missions-skeleton__card-xp"></div>' +
          '</div>' +
          '<div class="rp-missions-skeleton__card-bar"></div>' +
        '</div>';
      };

      this.root.innerHTML =
        '<div class="rp-missions-widget rp-missions-skeleton">' +
          '<div class="rp-missions-skeleton__stats">' +
            '<div class="rp-missions-skeleton__badge"></div>' +
            '<div class="rp-missions-skeleton__stats-lines">' +
              '<div class="rp-missions-skeleton__stats-line rp-missions-skeleton__stats-line--label"></div>' +
              '<div class="rp-missions-skeleton__stats-line rp-missions-skeleton__stats-line--bar"></div>' +
              '<div class="rp-missions-skeleton__stats-line rp-missions-skeleton__stats-line--xp"></div>' +
            '</div>' +
          '</div>' +
          '<div class="rp-missions-skeleton__tabs">' +
            '<div class="rp-missions-skeleton__tab"></div>' +
            '<div class="rp-missions-skeleton__tab"></div>' +
            '<div class="rp-missions-skeleton__tab"></div>' +
            '<div class="rp-missions-skeleton__tab"></div>' +
          '</div>' +
          '<div class="rp-missions-skeleton__cards">' +
            cardSkeleton(0) +
            cardSkeleton(0.1) +
            cardSkeleton(0.2) +
          '</div>' +
        '</div>';
    }

    /**
     * Error state with retry button
     */
    renderError(message) {
      var escapedMsg = escapeHtml(message || 'Something went wrong');

      this.root.innerHTML =
        '<div class="rp-missions-widget rp-missions-widget--error">' +
          '<div class="rp-missions-error">' +
            '<span class="rp-missions-error__icon">&#x26A0;</span>' +
            '<p>' + escapedMsg + '</p>' +
            '<button class="rp-missions-btn rp-missions-btn--secondary" data-retry>' +
              'Try Again' +
            '</button>' +
          '</div>' +
        '</div>';

      var retryBtn = this.root.querySelector('[data-retry]');
      if (retryBtn) {
        var self = this;
        retryBtn.addEventListener('click', function() {
          self.renderLoading();
          self.fetchMissionsData();
        });
      }
    }

    /**
     * Simple toast notification
     */
    showToast(message) {
      var toast = document.createElement('div');
      toast.className = 'rp-missions-toast';
      toast.textContent = message;
      this.root.appendChild(toast);

      // Trigger reflow then animate in
      toast.offsetHeight; // eslint-disable-line no-unused-expressions
      toast.classList.add('rp-missions-toast--visible');

      setTimeout(function() {
        toast.classList.remove('rp-missions-toast--visible');
        setTimeout(function() {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, 3000);
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    attachEventListeners() {
      var self = this;

      // Tab switching
      var tabs = this.root.querySelectorAll('.rp-missions-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function(e) {
          var cadence = e.currentTarget.getAttribute('data-tab');
          self.handleTabSwitch(cadence);
        });

        // Keyboard: arrow key navigation between tabs
        tabs[i].addEventListener('keydown', function(e) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            var currentIdx = CADENCES.indexOf(e.currentTarget.getAttribute('data-tab'));
            var nextIdx;
            if (e.key === 'ArrowRight') {
              nextIdx = (currentIdx + 1) % CADENCES.length;
            } else {
              nextIdx = (currentIdx - 1 + CADENCES.length) % CADENCES.length;
            }
            self.handleTabSwitch(CADENCES[nextIdx]);
            var nextTab = self.root.querySelector('[data-tab="' + CADENCES[nextIdx] + '"]');
            if (nextTab) nextTab.focus();
          }
        });
      }

      // Claim buttons
      var claimBtns = this.root.querySelectorAll('[data-claim-id]');
      for (var j = 0; j < claimBtns.length; j++) {
        claimBtns[j].addEventListener('click', function(e) {
          var id = e.currentTarget.getAttribute('data-claim-id');
          self.claimReward(id);
        });
      }
    }

    handleTabSwitch(cadence) {
      if (this.state.activeTab === cadence) return;
      this.state.activeTab = cadence;

      // Update tab active states
      var tabs = this.root.querySelectorAll('.rp-missions-tab');
      for (var i = 0; i < tabs.length; i++) {
        var isActive = tabs[i].getAttribute('data-tab') === cadence;
        tabs[i].classList.toggle('rp-missions-tab--active', isActive);
        tabs[i].setAttribute('aria-selected', String(isActive));
        tabs[i].setAttribute('tabindex', isActive ? '0' : '-1');
      }

      // Update panel visibility
      var panels = this.root.querySelectorAll('.rp-missions-panel');
      for (var j = 0; j < panels.length; j++) {
        var isVisible = panels[j].getAttribute('data-panel') === cadence;
        panels[j].classList.toggle('rp-missions-panel--active', isVisible);
        if (isVisible) {
          panels[j].removeAttribute('hidden');
        } else {
          panels[j].setAttribute('hidden', '');
        }
      }
    }

    // ============================================
    // CELEBRATIONS
    // ============================================

    processCelebrations(events) {
      if (!events || events.length === 0) return;

      var self = this;
      var eventIds = [];
      var delay = 0;

      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.id) eventIds.push(event.id);

        // Stagger celebrations
        (function(ev, d) {
          setTimeout(function() { self.renderCelebration(ev); }, d);
        })(event, delay);

        delay += CONFIG.CELEBRATION_DURATION_MS + 500;
      }

      // Acknowledge events after showing all
      if (eventIds.length > 0) {
        setTimeout(function() {
          self.ackEvents(eventIds);
        }, delay);
      }
    }

    renderCelebration(event) {
      var overlay = document.createElement('div');
      overlay.className = 'rp-missions-celebration';

      var content = '<div class="rp-missions-celebration__content">';

      if (event.triggersLevelUp) {
        content += '<div class="rp-missions-celebration__level-up">';
        content += '<span class="rp-missions-celebration__icon">&#x2B50;</span>';
        content += '<h3>Level Up!</h3>';
        if (event.payload && event.payload.newLevel) {
          content += '<p>You reached Level ' + sanitizeNumber(event.payload.newLevel, 1, 1, 9999) + '</p>';
        }
        content += '</div>';
      } else if (event.triggersStreakFire) {
        content += '<div class="rp-missions-celebration__streak">';
        content += '<span class="rp-missions-celebration__icon">&#x1F525;</span>';
        content += '<h3>Streak Bonus!</h3>';
        if (event.payload && event.payload.streakCount) {
          content += '<p>' + sanitizeNumber(event.payload.streakCount, 0, 0, 9999) + ' day streak!</p>';
        }
        content += '</div>';
      } else {
        content += '<div class="rp-missions-celebration__complete">';
        content += '<span class="rp-missions-celebration__icon">&#x1F389;</span>';
        content += '<h3>Mission Complete!</h3>';
        content += '</div>';
      }

      if (event.xpEarned) {
        var xpText = '+' + sanitizeNumber(event.xpEarned, 0, 0, Infinity) + ' XP';
        if (event.bonusXp) {
          xpText += ' (+' + sanitizeNumber(event.bonusXp, 0, 0, Infinity) + ' bonus)';
        }
        content += '<div class="rp-missions-celebration__xp">' + xpText + '</div>';
      }

      content += '</div>';
      overlay.innerHTML = content;

      // Confetti effect
      if (event.triggersConfetti) {
        this.spawnConfetti(overlay);
      }

      document.body.appendChild(overlay);

      // Trigger animation
      requestAnimationFrame(function() {
        overlay.classList.add('rp-missions-celebration--visible');
      });

      // Auto-dismiss
      setTimeout(function() {
        overlay.classList.remove('rp-missions-celebration--visible');
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 500);
      }, CONFIG.CELEBRATION_DURATION_MS);

      // Click to dismiss early
      overlay.addEventListener('click', function() {
        overlay.classList.remove('rp-missions-celebration--visible');
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 500);
      });
    }

    spawnConfetti(container) {
      var colors = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];

      for (var i = 0; i < CONFIG.CONFETTI_PARTICLE_COUNT; i++) {
        var particle = document.createElement('div');
        particle.className = 'rp-missions-confetti';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDelay = Math.random() * 2 + 's';
        particle.style.animationDuration = (2 + Math.random() * 2) + 's';
        container.appendChild(particle);
      }
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function initWidget() {
    var root = document.getElementById('missions-widget-root');
    if (root && !root.dataset.initialized) {
      new MissionsWidget(root).init();
    }
  }

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
