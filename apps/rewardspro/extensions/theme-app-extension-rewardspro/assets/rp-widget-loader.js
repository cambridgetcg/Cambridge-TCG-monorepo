/** Ordered, viewport-aware loader for RewardsPro storefront widgets. */
(function () {
  'use strict';

  var ROOT_RULES = [
    { selector: '#membership-widget-root', runtime: 'membership-widget.js' },
    { selector: '#missions-widget-root', runtime: 'missions-widget.js' },
    { selector: '.rp-missions-section-root', runtime: 'missions-widget.js' },
    { selector: '.rp-mb-root', runtime: 'mystery-boxes-widget.js' },
    { selector: '.rp-raffles-root', runtime: 'raffles.js' },
    { selector: '.rp-giftcards-root', runtime: 'gift-cards.js' }
  ];
  var ROOT_SELECTOR = ROOT_RULES.map(function (rule) {
    return rule.selector + '[data-rp-utils-src][data-rp-widget-src]';
  }).join(',');
  var GLOBAL_NAME = 'RewardsProWidgetLoader';
  var currentScript = document.currentScript;
  var loaderUrl = currentScript && currentScript.src
    ? new URL(currentScript.src, document.baseURI)
    : null;
  var loaderDirectory = loaderUrl
    ? loaderUrl.pathname.substring(0, loaderUrl.pathname.lastIndexOf('/') + 1)
    : null;

  if (window[GLOBAL_NAME] && typeof window[GLOBAL_NAME].scan === 'function') {
    window[GLOBAL_NAME].scan(document);
    return;
  }

  var scriptPromises = Object.create(null);
  var observedRoots = typeof WeakSet === 'function' ? new WeakSet() : null;
  var observer = null;

  function forgetScript(url) {
    delete scriptPromises[url];
    var scripts = document.querySelectorAll('script[data-rp-loader-src]');
    for (var i = 0; i < scripts.length; i += 1) {
      if (scripts[i].dataset.rpLoaderSrc === url) scripts[i].remove();
    }
  }

  function expectedRuntime(root) {
    for (var i = 0; i < ROOT_RULES.length; i += 1) {
      if (root.matches(ROOT_RULES[i].selector)) return ROOT_RULES[i].runtime;
    }
    return null;
  }

  function trustedAssetUrl(rawUrl, expectedFile) {
    if (!loaderUrl || !loaderDirectory) {
      throw new Error('Unable to establish the RewardsPro asset origin');
    }

    var candidate = new URL(rawUrl, document.baseURI);
    var candidateDirectory = candidate.pathname.substring(
      0,
      candidate.pathname.lastIndexOf('/') + 1
    );
    var candidateFile = decodeURIComponent(
      candidate.pathname.substring(candidate.pathname.lastIndexOf('/') + 1)
    );

    if ((candidate.protocol !== 'https:' && candidate.protocol !== 'http:') ||
        candidate.origin !== loaderUrl.origin ||
        candidateDirectory !== loaderDirectory ||
        candidateFile !== expectedFile) {
      throw new Error('Refused untrusted RewardsPro asset: ' + candidate.href);
    }

    return candidate.href;
  }

  function loadScript(url, expectedFile) {
    var normalized;
    try {
      normalized = trustedAssetUrl(url, expectedFile);
    } catch (error) {
      return Promise.reject(error);
    }
    if (scriptPromises[normalized]) return scriptPromises[normalized];

    scriptPromises[normalized] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = normalized;
      script.async = true;
      script.dataset.rpLoaderSrc = normalized;

      script.addEventListener('load', function () {
        resolve();
      }, { once: true });

      script.addEventListener('error', function () {
        forgetScript(normalized);
        reject(new Error('Unable to load RewardsPro asset: ' + normalized));
      }, { once: true });

      (document.head || document.documentElement).appendChild(script);
    });

    return scriptPromises[normalized];
  }

  function reportFailure(root, error) {
    root.dataset.rpLoaderState = 'error';
    root.removeAttribute('aria-busy');
    console.error('[RewardsProLoader]', error);

    var existing = root.querySelector('.rp-loader-error');
    if (!existing) {
      var message = document.createElement('div');
      message.className = 'rp-loader-error rp-empty-state';
      message.setAttribute('role', 'status');
      message.innerHTML =
        '<p class="rp-empty-state__message">Rewards are taking a moment to load.</p>' +
        '<button class="rp-btn-link" type="button" data-rp-loader-retry>Try again</button>';
      root.appendChild(message);
    }

    try {
      root.dispatchEvent(new CustomEvent('rewardspro:load-error', {
        bubbles: true,
        detail: { message: error && error.message ? error.message : String(error) }
      }));
    } catch (_) {
      // The visible state and console diagnostic remain available.
    }
  }

  function loadRoot(root) {
    if (!root || !root.dataset) return Promise.resolve();
    if (root.dataset.rpLoaderState === 'loading' ||
        root.dataset.rpLoaderState === 'ready') {
      return Promise.resolve();
    }

    var utilsUrl = root.dataset.rpUtilsSrc;
    var widgetUrl = root.dataset.rpWidgetSrc;
    var runtime = expectedRuntime(root);
    if (!utilsUrl || !widgetUrl || !runtime) return Promise.resolve();

    root.dataset.rpLoaderState = 'loading';
    root.setAttribute('aria-busy', 'true');
    var previousError = root.querySelector('.rp-loader-error');
    if (previousError) previousError.remove();

    var utilsReady = window.RPUtils && window.RPUtils.VERSION
      ? Promise.resolve()
      : loadScript(utilsUrl, 'rp-utils.js').then(function () {
          if (!window.RPUtils || !window.RPUtils.VERSION) {
            forgetScript(trustedAssetUrl(utilsUrl, 'rp-utils.js'));
            throw new Error('rp-utils.js loaded without exposing window.RPUtils');
          }
        });

    return utilsReady
      .then(function () {
        return loadScript(widgetUrl, runtime);
      })
      .then(function () {
        if (!root.isConnected) {
          root.dataset.rpLoaderState = 'idle';
          root.removeAttribute('aria-busy');
          return;
        }
        root.dataset.rpLoaderState = 'ready';
        root.removeAttribute('aria-busy');
        root.dispatchEvent(new CustomEvent('rewardspro:widget-ready', {
          bubbles: true,
          detail: { src: trustedAssetUrl(widgetUrl, runtime) }
        }));
      })
      .catch(function (error) {
        reportFailure(root, error);
      });
  }

  function getObserver() {
    if (observer) return observer;
    if (typeof window.IntersectionObserver !== 'function') return null;

    observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting && entry.intersectionRatio <= 0) return;
        observer.unobserve(entry.target);
        loadRoot(entry.target);
      });
    }, { rootMargin: '300px 0px' });

    return observer;
  }

  function register(root) {
    if (!root || root.dataset.rpLoaderState === 'ready') return;
    if (observedRoots && observedRoots.has(root) &&
        root.dataset.rpLoaderState !== 'error' &&
        root.dataset.rpLoaderState !== 'idle') return;
    if (observedRoots) observedRoots.add(root);

    var viewportObserver = getObserver();
    if (viewportObserver) {
      viewportObserver.observe(root);
    } else {
      loadRoot(root);
    }
  }

  function scan(scope) {
    var rootScope = scope && scope.querySelectorAll ? scope : document;

    if (rootScope.nodeType === 1 &&
        rootScope.matches &&
        rootScope.matches(ROOT_SELECTOR)) {
      register(rootScope);
    }

    var roots = rootScope.querySelectorAll(ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i += 1) register(roots[i]);
  }

  function loadFromInteraction(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var root = target.closest(ROOT_SELECTOR);
    if (!root) return;
    if (target.matches && target.matches('[data-rp-loader-retry]')) {
      event.preventDefault();
    }
    if (observer) observer.unobserve(root);
    loadRoot(root);
  }

  window[GLOBAL_NAME] = {
    loadRoot: loadRoot,
    scan: scan
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scan(document);
    }, { once: true });
  } else {
    scan(document);
  }

  document.addEventListener('pointerdown', loadFromInteraction, true);
  document.addEventListener('click', loadFromInteraction, true);
  document.addEventListener('focusin', loadFromInteraction, true);
  document.addEventListener('keydown', loadFromInteraction, true);

  document.addEventListener('shopify:section:load', function (event) {
    scan(event.target);
  });
  document.addEventListener('shopify:section:reorder', function (event) {
    scan(event.target || document);
  });
  document.addEventListener('shopify:section:unload', function (event) {
    var scope = event.target;
    if (!scope || !scope.querySelectorAll) return;
    if (observer && scope.matches && scope.matches(ROOT_SELECTOR)) {
      observer.unobserve(scope);
    }
    var roots = scope.querySelectorAll(ROOT_SELECTOR);
    for (var i = 0; observer && i < roots.length; i += 1) {
      observer.unobserve(roots[i]);
    }
  });
})();
