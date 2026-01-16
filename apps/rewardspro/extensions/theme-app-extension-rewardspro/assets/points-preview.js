/**
 * Points Earning Preview
 *
 * Displays estimated points to be earned on product pages
 * Updates dynamically when variant selection changes
 */
(function() {
  'use strict';

  // Cache DOM references and config
  let previewElements = [];
  let widgetData = null;

  /**
   * Initialize all points preview elements on the page
   */
  function init() {
    // Find all points preview elements
    previewElements = Array.from(document.querySelectorAll('.rp-points-preview'));

    if (previewElements.length === 0) {
      console.debug('[Points Preview] No preview elements found');
      return;
    }

    console.debug('[Points Preview] Found', previewElements.length, 'preview elements');

    // Try to get tier multiplier from cached widget data
    tryGetTierMultiplierFromWidget();

    // Calculate initial points for each element
    previewElements.forEach(updatePointsDisplay);

    // Listen for variant changes
    setupVariantChangeListeners();

    // Listen for custom events from membership widget
    window.addEventListener('rewardspro:widget-loaded', handleWidgetLoaded);
  }

  /**
   * Try to get tier multiplier from cached membership widget data
   */
  function tryGetTierMultiplierFromWidget() {
    const shopDomain = previewElements[0]?.dataset.shopDomain;
    if (!shopDomain) return;

    const cacheKey = `rp_widget_data_${shopDomain}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.data) {
          widgetData = parsed.data;
          console.debug('[Points Preview] Got widget data from cache:', {
            tierMultiplier: widgetData.points?.config?.tierMultiplier || 1
          });
        }
      }
    } catch (e) {
      console.debug('[Points Preview] Could not read widget cache');
    }
  }

  /**
   * Handle widget loaded event to update tier multiplier
   */
  function handleWidgetLoaded(event) {
    if (event.detail?.data) {
      widgetData = event.detail.data;
      console.debug('[Points Preview] Widget data received:', {
        tierMultiplier: widgetData.points?.config?.tierMultiplier || 1
      });
      // Recalculate points with new tier multiplier
      previewElements.forEach(updatePointsDisplay);
    }
  }

  /**
   * Calculate points for a given price
   */
  function calculatePoints(priceInCents, element) {
    const pointsPerDollar = parseFloat(element.dataset.pointsPerDollar) || 10;
    const bonusMultiplier = parseFloat(element.dataset.bonusMultiplier) || 1;

    // Get tier multiplier from widget data if available, otherwise from element data
    let tierMultiplier = parseFloat(element.dataset.tierMultiplier) || 1;
    if (widgetData?.points?.config?.tierMultiplier) {
      tierMultiplier = widgetData.points.config.tierMultiplier;
    }

    const priceInDollars = priceInCents / 100;
    const points = Math.floor(priceInDollars * pointsPerDollar * tierMultiplier * bonusMultiplier);

    return points;
  }

  /**
   * Update the points display for a preview element
   */
  function updatePointsDisplay(element, newPrice) {
    const valueElement = element.querySelector('[data-points-value]');
    if (!valueElement) return;

    // Use provided price or fall back to data attribute
    const price = newPrice || parseFloat(element.dataset.productPrice) || 0;
    const points = calculatePoints(price, element);

    // Update display with animation
    valueElement.classList.add('rp-points-updating');
    valueElement.textContent = points.toLocaleString();

    // Remove animation class after transition
    setTimeout(() => {
      valueElement.classList.remove('rp-points-updating');
    }, 300);

    console.debug('[Points Preview] Updated points:', {
      price: price / 100,
      points,
      productId: element.dataset.productId
    });
  }

  /**
   * Set up listeners for variant changes
   * Supports multiple common Shopify theme patterns
   */
  function setupVariantChangeListeners() {
    // Pattern 1: URL hash/query param change (common in many themes)
    let lastUrl = window.location.href;
    const urlObserver = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        handleVariantChange();
      }
    }, 100);

    // Pattern 2: Listen for Shopify's variant:changed event
    document.addEventListener('variant:changed', handleVariantChangeEvent);

    // Pattern 3: Listen for custom shopify variant change event
    document.addEventListener('shopify:variant:change', handleVariantChangeEvent);

    // Pattern 4: Watch for price changes in the DOM
    setupPriceObserver();

    // Pattern 5: Listen for form input changes on variant selectors
    document.querySelectorAll('form[action*="/cart/add"], [data-product-form]').forEach(form => {
      form.addEventListener('change', handleFormChange);
    });

    // Pattern 6: Listen for Shopify's section rendering (for AJAX product pages)
    document.addEventListener('shopify:section:load', handleSectionLoad);
  }

  /**
   * Handle variant change event
   */
  function handleVariantChangeEvent(event) {
    const variant = event.detail?.variant || event.variant;
    if (variant && variant.price) {
      console.debug('[Points Preview] Variant changed:', variant.id, variant.price);
      previewElements.forEach(el => updatePointsDisplay(el, variant.price));
    }
  }

  /**
   * Handle form change (variant selector)
   */
  function handleFormChange(event) {
    // Debounce to avoid multiple rapid updates
    if (handleFormChange.timeout) {
      clearTimeout(handleFormChange.timeout);
    }
    handleFormChange.timeout = setTimeout(() => {
      handleVariantChange();
    }, 50);
  }

  /**
   * Handle section load (AJAX)
   */
  function handleSectionLoad(event) {
    // Re-initialize after section load
    setTimeout(() => {
      previewElements = Array.from(document.querySelectorAll('.rp-points-preview'));
      previewElements.forEach(updatePointsDisplay);
    }, 100);
  }

  /**
   * Handle variant change by reading current price from DOM
   */
  function handleVariantChange() {
    previewElements.forEach(element => {
      const productId = element.dataset.productId;

      // Try to find the current price from various common selectors
      const priceSelectors = [
        `.price--regular[data-product-id="${productId}"]`,
        `[data-product-id="${productId}"] .price`,
        '.product__price',
        '.price__regular',
        '.product-price',
        '[data-regular-price]',
        '.current-price',
        '.product-single__price'
      ];

      for (const selector of priceSelectors) {
        const priceElement = document.querySelector(selector);
        if (priceElement) {
          const priceText = priceElement.textContent || priceElement.dataset.regularPrice || '';
          const price = parsePriceFromText(priceText);
          if (price > 0) {
            element.dataset.productPrice = price.toString();
            updatePointsDisplay(element, price);
            return;
          }
        }
      }

      // Fallback: try to get from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const variantId = urlParams.get('variant');
      if (variantId && window.ShopifyAnalytics?.meta?.product?.variants) {
        const variant = window.ShopifyAnalytics.meta.product.variants.find(
          v => v.id.toString() === variantId
        );
        if (variant) {
          element.dataset.productPrice = variant.price.toString();
          updatePointsDisplay(element, variant.price);
        }
      }
    });
  }

  /**
   * Parse price from text (handles various currency formats)
   */
  function parsePriceFromText(text) {
    // Remove currency symbols and whitespace, keep digits and decimal points
    const cleaned = text.replace(/[^0-9.,]/g, '');

    // Handle both comma and period as decimal separators
    // Assume last separator is decimal if there are multiple
    const parts = cleaned.split(/[.,]/);
    if (parts.length === 1) {
      return parseFloat(parts[0]) * 100; // No decimals, assume whole dollars to cents
    }

    // Last part is cents if it's 1-2 digits
    const lastPart = parts[parts.length - 1];
    if (lastPart.length <= 2) {
      const dollars = parts.slice(0, -1).join('');
      const cents = lastPart.padEnd(2, '0');
      return parseFloat(dollars) * 100 + parseFloat(cents);
    }

    // Otherwise assume it's all in cents
    return parseFloat(parts.join(''));
  }

  /**
   * Set up MutationObserver to watch for price changes
   */
  function setupPriceObserver() {
    const observer = new MutationObserver((mutations) => {
      let priceChanged = false;
      mutations.forEach(mutation => {
        if (mutation.target.classList?.contains('price') ||
            mutation.target.closest?.('.price') ||
            mutation.target.dataset?.regularPrice) {
          priceChanged = true;
        }
      });
      if (priceChanged) {
        handleVariantChange();
      }
    });

    // Observe price containers
    document.querySelectorAll('.product__price, .price, [data-regular-price]').forEach(el => {
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-initialize on Shopify AJAX navigation
  document.addEventListener('page:load', init);
  document.addEventListener('turbo:load', init);
})();
