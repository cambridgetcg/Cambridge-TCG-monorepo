/**
 * RewardsPro storefront widget (spec 5). Builds the widget inside each root
 * membership_widget.liquid prints, from its data attributes, with
 * textContent only.
 *
 * Signed in: one GET to the app proxy (the root's endpoint plus the cart's
 * currency), with an 8 s limit and no retry. Shopify adds the signed shop
 * and buyer itself, so nothing of the buyer's is sent from here. Anything
 * but a membership answer leaves the widget hidden.
 * Guest: the rate Liquid printed from the app's widget metafield; no
 * request at all. Cashback switched off shows nothing.
 */
(function () {
  "use strict";

  var TIMEOUT_MS = 8000;
  var LOGIN_DEFAULT = "/account/login";
  var made = 0;

  /** A locale string Liquid passed as data-t-<name>, with its {placeholders} filled. */
  function copy(root, name, values) {
    var text = root.getAttribute("data-t-" + name) || "";
    return text.replace(/\{(\w+)\}/g, function (all, key) {
      return values && values[key] !== undefined ? values[key] : all;
    });
  }

  function filled(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function locale(root) {
    return root.getAttribute("data-locale") || document.documentElement.lang || undefined;
  }

  function percent(root, value) {
    try {
      return new Intl.NumberFormat(locale(root), { maximumFractionDigits: 2 }).format(value);
    } catch (e) {
      return String(value);
    }
  }

  function money(root, amount, currency) {
    try {
      return new Intl.NumberFormat(locale(root), { style: "currency", currency: currency }).format(amount);
    } catch (e) {
      return currency ? amount + " " + currency : String(amount);
    }
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** The button that opens the panel, and the panel; the root shows them. */
  function show(root, value, lines) {
    var id = "rw-panel-" + ++made;
    var button = el("button", "rw-button");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    var dot = el("span", "rw-dot");
    dot.setAttribute("aria-hidden", "true");
    button.appendChild(dot);
    button.appendChild(el("span", null, copy(root, "button")));
    if (value) button.appendChild(el("span", "rw-value", value));

    var panel = el("div", "rw-panel");
    panel.id = id;
    panel.hidden = true;
    lines.forEach(function (line) {
      panel.appendChild(line);
    });

    function toggle(open) {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }
    button.addEventListener("click", function () {
      toggle(panel.hidden);
    });
    root.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        toggle(false);
        button.focus();
      }
    });

    root.replaceChildren(button, panel);
    root.hidden = false;
  }

  function progressLines(root, data) {
    var p = data.tierProgress;
    var currency = data.settings && data.settings.currency;
    if (!p) return [];
    if (p.isMaxTier) return [el("p", "rw-line", copy(root, "top"))];
    if (!p.nextTierName || !isNumber(p.amountRemaining) || !isNumber(p.progressPercent)) return [];

    var done = Math.max(0, Math.min(100, Math.round(p.progressPercent)));
    var bar = el("div", "rw-track");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-label", copy(root, "progress", { tier: p.nextTierName }));
    var fill = el("div", "rw-fill");
    fill.style.width = done + "%";
    bar.appendChild(fill);
    return [el("p", "rw-line", copy(root, "to-next", { amount: money(root, p.amountRemaining, currency), tier: p.nextTierName })), bar];
  }

  function member(root, data) {
    var tier = data.membership && data.membership.tier;
    var balance = data.balance || {};
    if (!tier || typeof tier.name !== "string") return;

    var lines = [el("p", "rw-label", copy(root, "tier")), el("p", "rw-title", tier.name)];
    if (data.running !== false && isNumber(tier.cashbackPercent)) {
      lines.push(el("p", "rw-line", copy(root, "earn", { percent: percent(root, tier.cashbackPercent) })));
    }

    var amount = null;
    if (isNumber(balance.storeCredit)) {
      amount = money(root, balance.storeCredit, balance.currency);
      var box = el("p", "rw-balance");
      box.appendChild(el("span", "rw-label", copy(root, "balance")));
      box.appendChild(el("span", "rw-amount", amount));
      lines.push(box);
    } else {
      lines.push(el("p", "rw-balance rw-line", copy(root, "balance-unknown")));
    }

    lines = lines.concat(progressLines(root, data));
    if (data.settings && data.settings.customerAccountsVersion === "NEW_CUSTOMER_ACCOUNTS") {
      lines.push(el("p", "rw-note", copy(root, "spend")));
    }
    show(root, amount, lines);
  }

  function safeLink(url) {
    return url && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : null;
  }

  function guest(root) {
    if (root.getAttribute("data-running") === "false") return;
    var lines = [el("p", "rw-title", filled(root.getAttribute("data-message")) || copy(root, "guest-message"))];

    var rate = filled(root.getAttribute("data-base-percent"));
    var base = rate === null ? NaN : Number(rate);
    if (root.getAttribute("data-running") === "true" && isFinite(base) && base > 0) {
      lines.push(el("p", "rw-line", copy(root, "guest-earn", { percent: percent(root, base) })));
    }

    var asked = filled(root.getAttribute("data-cta-url"));
    var link = el("a", "rw-cta", filled(root.getAttribute("data-cta-text")) || copy(root, "guest-cta"));
    link.href = (asked !== LOGIN_DEFAULT && safeLink(asked)) || safeLink(root.getAttribute("data-login-url")) || LOGIN_DEFAULT;
    lines.push(link);
    show(root, null, lines);
  }

  function signedIn(root) {
    var endpoint = root.getAttribute("data-endpoint");
    if (!endpoint || typeof fetch !== "function" || typeof AbortController !== "function") return;
    var currency = root.getAttribute("data-currency") || "";
    var url = /^[A-Za-z]{3}$/.test(currency) ? endpoint + "?currency=" + encodeURIComponent(currency) : endpoint;

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);
    fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (data && data.success === true) member(root, data);
      })
      .catch(function () {
        // Hidden is the answer to a slow or failed request; no retry
      })
      .then(function () {
        clearTimeout(timer);
      });
  }

  function start(root) {
    if (root.hasAttribute("data-rw-started")) return;
    root.setAttribute("data-rw-started", "");
    if (root.getAttribute("data-state") === "customer") signedIn(root);
    else guest(root);
  }

  function scan() {
    var roots = document.querySelectorAll("[data-rewards-widget]");
    for (var i = 0; i < roots.length; i += 1) start(roots[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
