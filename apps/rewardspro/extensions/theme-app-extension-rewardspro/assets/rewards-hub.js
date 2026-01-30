/**
 * Rewards Hub Section Controller
 * Manages the comprehensive rewards landing page section
 * Fetches and displays all rewards data in a unified view
 */

(function() {
  'use strict';

  const CONFIG = {
    API_TIMEOUT_MS: 10000,
    COUNTDOWN_INTERVAL_MS: 1000,
  };

  const DEBUG = (() => {
    try {
      return localStorage.getItem('rp-debug') === 'true';
    } catch {
      return false;
    }
  })();

  const log = {
    debug: (...args) => DEBUG && console.log('[RewardsHub]', ...args),
    error: (...args) => console.error('[RewardsHub]', ...args),
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatCurrency(amount, currency = 'USD') {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount || 0);
    } catch {
      return '$' + (amount || 0).toFixed(2);
    }
  }

  function formatCountdown(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  async function fetchWithTimeout(url, timeout = CONFIG.API_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  class RewardsHub {
    constructor(element) {
      this.root = element;
      this.config = {
        shopDomain: element.dataset.shopDomain,
        shopCurrency: element.dataset.shopCurrency || 'USD',
        customerId: element.dataset.customerId,
        isAuthenticated: element.dataset.authenticated === 'true',
        membershipEndpoint: element.dataset.membershipEndpoint,
        rafflesEndpoint: element.dataset.rafflesEndpoint,
        mysteryBoxesEndpoint: element.dataset.mysteryBoxesEndpoint,
        challengesEndpoint: element.dataset.challengesEndpoint,
        showBalance: element.dataset.showBalance !== 'false',
        showTier: element.dataset.showTier !== 'false',
        showRaffles: element.dataset.showRaffles !== 'false',
        showMysteryBoxes: element.dataset.showMysteryBoxes !== 'false',
        showChallenges: element.dataset.showChallenges !== 'false',
        maxItems: parseInt(element.dataset.maxItems) || 4,
      };

      this.elements = {
        loading: element.querySelector('.rp-rewards-hub__loading'),
        content: element.querySelector('.rp-rewards-hub__content'),
        error: element.querySelector('.rp-rewards-hub__error'),
        summaryLoading: element.querySelector('.rp-rewards-hub__summary-loading'),
        summaryContent: element.querySelector('.rp-rewards-hub__summary-content'),
      };

      this.countdownIntervals = [];
    }

    async initialize() {
      if (this.root.dataset.initialized === 'true') return;
      this.root.dataset.initialized = 'true';

      // Bind action listeners (for both guests and authenticated users)
      this.bindActionListeners();

      if (!this.config.isAuthenticated) {
        log.debug('Guest user, showing guest view');
        return;
      }

      log.debug('Initializing Rewards Hub', this.config);

      try {
        await this.loadAllData();
        this.showContent();
      } catch (error) {
        log.error('Failed to load data:', error);
        this.showError();
      }
    }

    async loadAllData() {
      const promises = [];

      // Load membership data
      if (this.config.membershipEndpoint) {
        promises.push(this.loadMembershipData());
      }

      // Load activity data in parallel
      if (this.config.showRaffles && this.config.rafflesEndpoint) {
        promises.push(this.loadRaffles());
      }
      if (this.config.showMysteryBoxes && this.config.mysteryBoxesEndpoint) {
        promises.push(this.loadMysteryBoxes());
      }
      if (this.config.showChallenges && this.config.challengesEndpoint) {
        promises.push(this.loadChallenges());
      }

      await Promise.allSettled(promises);
    }

    async loadMembershipData() {
      try {
        const url = new URL(this.config.membershipEndpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        const data = await fetchWithTimeout(url.toString());

        if (data.success) {
          this.renderSummary(data);
        }
      } catch (error) {
        log.error('Failed to load membership data:', error);
      }
    }

    async loadRaffles() {
      const section = this.root.querySelector('[data-section="raffles"]');
      if (!section) return;

      try {
        const url = new URL(this.config.rafflesEndpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        const data = await fetchWithTimeout(url.toString());

        // Feature disabled - hide entire section
        if (data.enabled === false) {
          log.debug('Raffles feature is disabled');
          section.style.display = 'none';
          return;
        }

        if (data.success && data.raffles?.length > 0) {
          this.renderRaffles(section, data.raffles.slice(0, this.config.maxItems));
        } else {
          this.showSectionEmpty(section);
        }
      } catch (error) {
        log.error('Failed to load raffles:', error);
        this.showSectionEmpty(section);
      }
    }

    async loadMysteryBoxes() {
      const section = this.root.querySelector('[data-section="mystery-boxes"]');
      if (!section) return;

      try {
        const url = new URL(this.config.mysteryBoxesEndpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        const data = await fetchWithTimeout(url.toString());

        // Feature disabled - hide entire section
        if (data.enabled === false) {
          log.debug('Mystery boxes feature is disabled');
          section.style.display = 'none';
          return;
        }

        if (data.success && data.boxes?.length > 0) {
          this.renderMysteryBoxes(section, data.boxes.slice(0, this.config.maxItems));
        } else {
          this.showSectionEmpty(section);
        }
      } catch (error) {
        log.error('Failed to load mystery boxes:', error);
        this.showSectionEmpty(section);
      }
    }

    async loadChallenges() {
      const section = this.root.querySelector('[data-section="challenges"]');
      if (!section) return;

      try {
        const url = new URL(this.config.challengesEndpoint, window.location.origin);
        url.searchParams.append('logged_in_customer_id', this.config.customerId);
        url.searchParams.append('shop', this.config.shopDomain);

        const data = await fetchWithTimeout(url.toString());

        // Feature disabled - hide entire section
        if (data.enabled === false) {
          log.debug('Challenges feature is disabled');
          section.style.display = 'none';
          return;
        }

        if (data.success && data.challenges?.length > 0) {
          this.renderChallenges(section, data.challenges.slice(0, this.config.maxItems));
        } else {
          this.showSectionEmpty(section);
        }
      } catch (error) {
        log.error('Failed to load challenges:', error);
        this.showSectionEmpty(section);
      }
    }

    renderSummary(data) {
      if (!this.elements.summaryContent) return;

      const points = data.points;
      const membership = data.membership;
      const balance = data.balance;
      const tierProgress = data.tierProgress;

      let html = '<div class="rp-rewards-hub__summary-grid">';

      // Points Balance Card
      if (this.config.showBalance && points?.enabled) {
        const currencyIcon = escapeHtml(points.currency?.icon || '⭐');
        html += `
          <div class="rp-rewards-hub__stat-card">
            <div class="rp-rewards-hub__stat-icon">${currencyIcon}</div>
            <div class="rp-rewards-hub__stat-value">${(points.balance?.available || 0).toLocaleString()}</div>
            <div class="rp-rewards-hub__stat-label">${escapeHtml(points.currency?.name || 'Points')}</div>
          </div>
        `;
      }

      // Store Credit Card
      if (this.config.showBalance && balance?.storeCredit > 0) {
        html += `
          <div class="rp-rewards-hub__stat-card">
            <div class="rp-rewards-hub__stat-icon">💰</div>
            <div class="rp-rewards-hub__stat-value">${formatCurrency(balance.storeCredit, this.config.shopCurrency)}</div>
            <div class="rp-rewards-hub__stat-label">Store Credit</div>
          </div>
        `;
      }

      // Tier Card
      if (this.config.showTier && membership?.tier) {
        html += `
          <div class="rp-rewards-hub__stat-card">
            <div class="rp-rewards-hub__stat-icon">⭐</div>
            <div class="rp-rewards-hub__stat-value">${escapeHtml(membership.tier.name)}</div>
            <div class="rp-rewards-hub__stat-label">Current Tier</div>
            ${membership.tier.cashbackPercent > 0 ? `<div class="rp-rewards-hub__stat-bonus">${membership.tier.cashbackPercent}% Cashback</div>` : ''}
          </div>
        `;
      }

      // Progress Card
      if (this.config.showTier && tierProgress && !tierProgress.isMaxTier) {
        html += `
          <div class="rp-rewards-hub__stat-card rp-rewards-hub__stat-card--progress">
            <div class="rp-rewards-hub__stat-label">Progress to ${escapeHtml(tierProgress.nextTierName || 'Next Tier')}</div>
            <div class="rp-rewards-hub__progress-bar">
              <div class="rp-rewards-hub__progress-fill" style="width: ${tierProgress.progressPercent}%"></div>
            </div>
            <div class="rp-rewards-hub__stat-sublabel">${formatCurrency(tierProgress.amountRemaining, this.config.shopCurrency)} to go</div>
          </div>
        `;
      }

      html += '</div>';

      this.elements.summaryContent.innerHTML = html;
      this.elements.summaryLoading.style.display = 'none';
      this.elements.summaryContent.style.display = '';
    }

    renderRaffles(section, raffles) {
      const content = section.querySelector('.rp-rewards-hub__section-content');
      const loading = section.querySelector('.rp-rewards-hub__section-loading');
      const isAuthenticated = this.config.isAuthenticated;

      const html = raffles.map(raffle => {
        const hasEntries = raffle.customerEntries > 0;
        const maxReached = raffle.maxEntriesPerCustomer && raffle.customerEntries >= raffle.maxEntriesPerCustomer;
        const buttonText = !isAuthenticated ? 'Sign In to Enter'
          : maxReached ? 'Max Entries Reached'
          : hasEntries ? `Entered (${raffle.customerEntries})`
          : 'Enter Now';
        const isDisabled = !isAuthenticated || maxReached;

        return `
          <div class="rp-rewards-hub__card">
            ${raffle.imageUrl ? `<div class="rp-rewards-hub__card-image" style="background-image: url('${escapeHtml(raffle.imageUrl)}')"></div>` : ''}
            <div class="rp-rewards-hub__card-body">
              <h3 class="rp-rewards-hub__card-title">${escapeHtml(raffle.name)}</h3>
              <div class="rp-rewards-hub__card-meta">
                <span class="rp-rewards-hub__card-entries">${raffle.totalEntries || 0} entries</span>
                ${raffle.endDate ? `<span class="rp-rewards-hub__card-countdown" data-countdown="${raffle.endDate}">${formatCountdown(raffle.endDate)}</span>` : ''}
              </div>
              ${raffle.entryCost > 0 ? `<div class="rp-rewards-hub__card-cost">${raffle.entryCost} points per entry</div>` : ''}
              <button class="rp-rewards-hub__card-btn" data-raffle-enter="${raffle.id}" ${isDisabled ? 'disabled' : ''}>
                ${buttonText}
              </button>
            </div>
          </div>
        `;
      }).join('');

      content.innerHTML = `<div class="rp-rewards-hub__card-grid">${html}</div>`;
      loading.style.display = 'none';
      content.style.display = '';

      this.startCountdowns(content);
    }

    renderMysteryBoxes(section, boxes) {
      const content = section.querySelector('.rp-rewards-hub__section-content');
      const loading = section.querySelector('.rp-rewards-hub__section-loading');
      const isAuthenticated = this.config.isAuthenticated;

      const html = boxes.map(box => {
        const rarityHtml = box.rarityPreview?.map(r => `
          <span class="rp-rewards-hub__rarity rp-rewards-hub__rarity--${r.rarity.toLowerCase()}">${r.rarity}: ${r.chance}%</span>
        `).join('') || '';

        // Determine action button
        let actionHtml = '';
        if (!isAuthenticated) {
          actionHtml = '<a href="/account/login" class="rp-rewards-hub__card-btn">Sign In to Open</a>';
        } else if (box.canOpen === false) {
          // Max opens reached or other restriction
          actionHtml = `<button class="rp-rewards-hub__card-btn" disabled>${box.reason || 'Unavailable'}</button>`;
        } else {
          actionHtml = `<button class="rp-rewards-hub__card-btn" data-mystery-box-open="${box.id}">Open Now</button>`;
        }

        return `
          <div class="rp-rewards-hub__card">
            <div class="rp-rewards-hub__card-icon">🎁</div>
            <div class="rp-rewards-hub__card-body">
              <h3 class="rp-rewards-hub__card-title">${escapeHtml(box.name)}</h3>
              ${box.description ? `<p class="rp-rewards-hub__card-desc">${escapeHtml(box.description)}</p>` : ''}
              ${rarityHtml ? `<div class="rp-rewards-hub__rarities">${rarityHtml}</div>` : ''}
              ${box.pointsCost > 0 ? `<div class="rp-rewards-hub__card-cost">${box.pointsCost} points to open</div>` : ''}
              ${actionHtml}
            </div>
          </div>
        `;
      }).join('');

      content.innerHTML = `<div class="rp-rewards-hub__card-grid">${html}</div>`;
      loading.style.display = 'none';
      content.style.display = '';
    }

    renderChallenges(section, challenges) {
      const content = section.querySelector('.rp-rewards-hub__section-content');
      const loading = section.querySelector('.rp-rewards-hub__section-loading');
      const isAuthenticated = this.config.isAuthenticated;

      const html = challenges.map(challenge => {
        const progress = challenge.userProgress;
        const percent = progress ? Math.min(100, progress.percent || Math.round((progress.current / progress.target) * 100)) : 0;
        const status = progress?.status;

        // Determine action/status display
        let actionHtml = '';
        if (!isAuthenticated) {
          actionHtml = '<a href="/account/login" class="rp-rewards-hub__card-btn">Sign In to Join</a>';
        } else if (status === 'COMPLETED') {
          // Completed but not claimed - show claim button
          actionHtml = `<button class="rp-rewards-hub__card-btn rp-rewards-hub__card-btn--claim" data-challenge-claim="${challenge.id}">Claim Reward</button>`;
        } else if (status === 'CLAIMED') {
          actionHtml = '<div class="rp-rewards-hub__card-status rp-rewards-hub__card-status--claimed">✓ Claimed</div>';
        } else if (status === 'IN_PROGRESS') {
          actionHtml = '<div class="rp-rewards-hub__card-status">In Progress</div>';
        } else {
          // Not started - show join button (inline action)
          actionHtml = `<button class="rp-rewards-hub__card-btn" data-challenge-join="${challenge.id}">Join Challenge</button>`;
        }

        return `
          <div class="rp-rewards-hub__card">
            ${challenge.imageUrl ? `<div class="rp-rewards-hub__card-image" style="background-image: url('${escapeHtml(challenge.imageUrl)}')"></div>` : '<div class="rp-rewards-hub__card-icon">🏆</div>'}
            <div class="rp-rewards-hub__card-body">
              <h3 class="rp-rewards-hub__card-title">${escapeHtml(challenge.name)}</h3>
              ${challenge.description ? `<p class="rp-rewards-hub__card-desc">${escapeHtml(challenge.description)}</p>` : ''}
              ${progress ? `
                <div class="rp-rewards-hub__card-progress">
                  <div class="rp-rewards-hub__progress-bar">
                    <div class="rp-rewards-hub__progress-fill" style="width: ${percent}%"></div>
                  </div>
                  <span class="rp-rewards-hub__progress-text">${progress.current} / ${progress.target}</span>
                </div>
              ` : ''}
              ${challenge.reward ? `<div class="rp-rewards-hub__card-reward">🎁 ${escapeHtml(challenge.reward.description)}</div>` : ''}
              ${challenge.endsAt ? `<div class="rp-rewards-hub__card-countdown" data-countdown="${challenge.endsAt}">${formatCountdown(challenge.endsAt)}</div>` : ''}
              ${actionHtml}
            </div>
          </div>
        `;
      }).join('');

      content.innerHTML = `<div class="rp-rewards-hub__card-grid">${html}</div>`;
      loading.style.display = 'none';
      content.style.display = '';

      this.startCountdowns(content);
    }

    showSectionEmpty(section) {
      const loading = section.querySelector('.rp-rewards-hub__section-loading');
      const empty = section.querySelector('.rp-rewards-hub__section-empty');

      loading.style.display = 'none';
      if (empty) empty.style.display = '';
    }

    showContent() {
      if (this.elements.loading) this.elements.loading.style.display = 'none';
      if (this.elements.content) this.elements.content.style.display = '';
    }

    showError() {
      if (this.elements.loading) this.elements.loading.style.display = 'none';
      if (this.elements.error) {
        this.elements.error.style.display = '';
        const retryBtn = this.elements.error.querySelector('[data-retry]');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            this.elements.error.style.display = 'none';
            this.elements.loading.style.display = '';
            this.loadAllData().then(() => this.showContent()).catch(() => this.showError());
          });
        }
      }
    }

    startCountdowns(container) {
      container.querySelectorAll('[data-countdown]').forEach(el => {
        const update = () => {
          el.textContent = formatCountdown(el.dataset.countdown);
        };
        update();
        const interval = setInterval(update, CONFIG.COUNTDOWN_INTERVAL_MS);
        this.countdownIntervals.push(interval);
      });
    }

    destroy() {
      this.countdownIntervals.forEach(clearInterval);
      this.countdownIntervals = [];
    }

    // Action Handlers

    async enterRaffle(raffleId, quantity = 1) {
      const button = this.root.querySelector(`[data-raffle-enter="${raffleId}"]`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Entering...';
      }

      try {
        const response = await fetch('/apps/rewardspro/raffles/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raffleId,
            quantity,
            logged_in_customer_id: this.config.customerId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          this.showToast(`Entered raffle! You now have ${result.totalEntries} entries.`, 'success');
          this.updatePointsDisplay(result.newPointsBalance);
          // Refresh raffle data
          await this.loadRaffles();
        } else {
          this.showToast(result.error || 'Failed to enter raffle', 'error');
          // Re-enable button on error
          if (button) {
            button.disabled = false;
            button.textContent = 'Enter Now';
          }
        }
      } catch (error) {
        log.error('Raffle entry error:', error);
        this.showToast('Failed to enter raffle. Please try again.', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Enter Now';
        }
      }
    }

    async claimChallenge(challengeId) {
      const button = this.root.querySelector(`[data-challenge-claim="${challengeId}"]`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Claiming...';
      }

      try {
        const response = await fetch('/apps/rewardspro/challenges/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            logged_in_customer_id: this.config.customerId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const rewardDesc = result.reward?.description || 'Reward claimed!';
          this.showToast(rewardDesc, 'success');
          this.updatePointsDisplay(result.newPointsBalance);
          // Refresh challenge data
          await this.loadChallenges();
        } else {
          this.showToast(result.error || 'Failed to claim reward', 'error');
          if (button) {
            button.disabled = false;
            button.textContent = 'Claim Reward';
          }
        }
      } catch (error) {
        log.error('Challenge claim error:', error);
        this.showToast('Failed to claim reward. Please try again.', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Claim Reward';
        }
      }
    }

    async joinChallenge(challengeId) {
      const button = this.root.querySelector(`[data-challenge-join="${challengeId}"]`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Joining...';
      }

      try {
        const response = await fetch('/apps/rewardspro/challenges/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            logged_in_customer_id: this.config.customerId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          if (result.alreadyJoined) {
            this.showToast('You have already joined this challenge!', 'info');
          } else {
            this.showToast(`Joined "${result.challenge?.name || 'challenge'}"! Start making progress.`, 'success');
          }
          // Refresh challenge data
          await this.loadChallenges();
        } else {
          this.showToast(result.error || 'Failed to join challenge', 'error');
          if (button) {
            button.disabled = false;
            button.textContent = 'Join Challenge';
          }
        }
      } catch (error) {
        log.error('Challenge join error:', error);
        this.showToast('Failed to join challenge. Please try again.', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Join Challenge';
        }
      }
    }

    async openMysteryBox(boxId) {
      const button = this.root.querySelector(`[data-mystery-box-open="${boxId}"]`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Opening...';
      }

      try {
        const response = await fetch('/apps/rewardspro/mystery-boxes/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boxId,
            logged_in_customer_id: this.config.customerId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const rewardName = result.reward?.name || 'a reward';
          const rarity = result.reward?.rarity || '';
          this.showToast(`You won ${rewardName}! ${rarity ? `(${rarity})` : ''}`, 'success');
          this.updatePointsDisplay(result.newPointsBalance);
          // Refresh mystery box data
          await this.loadMysteryBoxes();
        } else {
          this.showToast(result.error || 'Failed to open mystery box', 'error');
          if (button) {
            button.disabled = false;
            button.textContent = 'Open Now';
          }
        }
      } catch (error) {
        log.error('Mystery box open error:', error);
        this.showToast('Failed to open mystery box. Please try again.', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Open Now';
        }
      }
    }

    showToast(message, type = 'info') {
      // Remove any existing toast
      const existing = document.querySelector('.rp-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = `rp-toast rp-toast--${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      // Auto-remove after 4 seconds
      setTimeout(() => {
        toast.classList.add('rp-toast--hiding');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }

    updatePointsDisplay(newBalance) {
      if (typeof newBalance !== 'number') return;

      const balanceEl = this.root.querySelector('.rp-rewards-hub__stat-value');
      if (balanceEl) {
        balanceEl.textContent = newBalance.toLocaleString();
      }
    }

    bindActionListeners() {
      this.root.addEventListener('click', async (e) => {
        // Handle raffle entry
        const raffleBtn = e.target.closest('[data-raffle-enter]');
        if (raffleBtn && !raffleBtn.disabled) {
          e.preventDefault();
          await this.enterRaffle(raffleBtn.dataset.raffleEnter);
          return;
        }

        // Handle challenge claim
        const claimBtn = e.target.closest('[data-challenge-claim]');
        if (claimBtn && !claimBtn.disabled) {
          e.preventDefault();
          await this.claimChallenge(claimBtn.dataset.challengeClaim);
          return;
        }

        // Handle challenge join
        const joinBtn = e.target.closest('[data-challenge-join]');
        if (joinBtn && !joinBtn.disabled) {
          e.preventDefault();
          await this.joinChallenge(joinBtn.dataset.challengeJoin);
          return;
        }

        // Handle mystery box open
        const openBtn = e.target.closest('[data-mystery-box-open]');
        if (openBtn && !openBtn.disabled) {
          e.preventDefault();
          await this.openMysteryBox(openBtn.dataset.mysteryBoxOpen);
          return;
        }
      });
    }
  }

  function initializeHubs() {
    document.querySelectorAll('.rp-rewards-hub').forEach(element => {
      if (!element.dataset.initialized) {
        const hub = new RewardsHub(element);
        hub.initialize();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHubs);
  } else {
    initializeHubs();
  }

  if (typeof Shopify !== 'undefined') {
    document.addEventListener('shopify:section:load', initializeHubs);
  }

  window.RewardsHub = RewardsHub;
  log.debug('Rewards Hub loaded');
})();
