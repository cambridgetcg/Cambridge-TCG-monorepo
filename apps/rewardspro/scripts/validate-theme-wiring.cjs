#!/usr/bin/env node

/**
 * Theme Extension Wiring Validator
 *
 * Static analysis that verifies:
 * 1. Liquid data-*-endpoint attributes resolve to valid proxy routes
 * 2. JS fallback endpoint defaults match the same routes
 * 3. Schema/loader "javascript" / "stylesheet" references exist
 * 4. TOML [[extensions.targeting]] modules reference existing Liquid blocks
 * 5. Liquid element IDs match JS getElementById() calls
 *
 * Exit code 0 = all checks pass, 1 = failures found.
 * Run: node scripts/validate-theme-wiring.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT, "extensions", "theme-app-extension-rewardspro");
const BLOCKS_DIR = path.join(EXT_DIR, "blocks");
const ASSETS_DIR = path.join(EXT_DIR, "assets");
const TOML_PATH = path.join(EXT_DIR, "shopify.extension.toml");
const PROXY_PATH = path.join(ROOT, "app", "routes", "api.proxy.$.tsx");
const APP_TOML_PATH = path.join(ROOT, "shopify.app.toml");

let failures = 0;
let passes = 0;

function pass(msg) {
  passes++;
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg) {
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ─── 1. Parse app proxy config ─────────────────────────────

function getProxyPrefix() {
  const toml = fs.readFileSync(APP_TOML_PATH, "utf-8");
  const prefix = toml.match(/prefix\s*=\s*"([^"]+)"/)?.[1] || "apps";
  const subpath = toml.match(/subpath\s*=\s*"([^"]+)"/)?.[1] || "";
  return `/${prefix}/${subpath}`;
}

// ─── 2. Parse registered proxy routes ──────────────────────

function getProxyRoutes() {
  const src = fs.readFileSync(PROXY_PATH, "utf-8");
  const routes = new Set();
  const re = /proxyPath\s*===\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.add(m[1]);
  }
  return routes;
}

// ─── 3. Parse Liquid blocks ────────────────────────────────

function parseLiquidBlocks() {
  const blocks = [];
  if (!fs.existsSync(BLOCKS_DIR)) return blocks;

  for (const file of fs.readdirSync(BLOCKS_DIR).filter((f) => f.endsWith(".liquid"))) {
    const filePath = path.join(BLOCKS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract data-*-endpoint attributes
    const endpoints = [];
    const endpointRe = /data-[\w-]*endpoint\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = endpointRe.exec(content)) !== null) {
      const attrMatch = content.substring(m.index).match(/^data-([\w-]*endpoint)/);
      endpoints.push({ attr: attrMatch ? attrMatch[1] : "endpoint", url: m[1] });
    }

    // Extract element IDs (only static IDs, skip Liquid variables like {{ customer.id }})
    const ids = [];
    const idRe = /\bid="([^"{]+)"/g;
    while ((m = idRe.exec(content)) !== null) {
      // Skip data-* attribute values that happen to contain "id="
      const before = content.substring(Math.max(0, m.index - 30), m.index);
      if (/data-[\w-]+=/.test(before) && !before.includes('"')) continue;
      ids.push(m[1].trim());
    }

    // Extract schema JSON
    let schema = null;
    const schemaMatch = content.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
    if (schemaMatch) {
      try {
        schema = JSON.parse(schemaMatch[1]);
      } catch (e) {
        fail(`${file}: Invalid schema JSON — ${e.message}`);
      }
    }

    // RewardsPro blocks use one small schema loader and provide the actual
    // widget runtime as a Shopify CDN URL in Liquid.
    const runtimeMatch = content.match(
      /data-rp-widget-src\s*=\s*"\{\{\s*'([^']+)'\s*\|\s*asset_url\s*\}\}"/
    );
    const runtimeJavascript = runtimeMatch?.[1] || schema?.javascript || null;

    blocks.push({
      file,
      filePath,
      content,
      endpoints,
      ids,
      schema,
      runtimeJavascript,
    });
  }
  return blocks;
}

// ─── 4. Parse JS assets for fallback endpoints + getElement ─

function parseJsAssets() {
  const assets = [];
  if (!fs.existsSync(ASSETS_DIR)) return assets;

  for (const file of fs.readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"))) {
    const filePath = path.join(ASSETS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract fallback endpoint URLs (pattern: || '/apps/rewardspro/...')
    const fallbacks = [];
    const fallbackRe = /\|\|\s*'(\/apps\/[^']+)'/g;
    let m;
    while ((m = fallbackRe.exec(content)) !== null) {
      fallbacks.push(m[1]);
    }

    // Extract getElementById calls
    const elementIds = [];
    const elemRe = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = elemRe.exec(content)) !== null) {
      elementIds.push(m[1]);
    }

    assets.push({ file, filePath, content, fallbacks, elementIds });
  }
  return assets;
}

// ─── 5. Parse TOML targeting entries ───────────────────────

function parseTomlTargets() {
  const content = fs.readFileSync(TOML_PATH, "utf-8");
  const targets = [];
  const re = /\[\[extensions\.targeting\]\]\s*\ntarget\s*=\s*"([^"]+)"\s*\nmodule\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    targets.push({ target: m[1], module: m[2] });
  }
  return targets;
}

// ─── Run Checks ────────────────────────────────────────────

function run() {
  console.log("\x1b[1m\x1b[36mTheme Extension Wiring Validator\x1b[0m\n");

  const proxyPrefix = getProxyPrefix();
  const proxyRoutes = getProxyRoutes();
  const blocks = parseLiquidBlocks();
  const jsAssets = parseJsAssets();
  const tomlTargets = parseTomlTargets();

  // ─── Check 1: Liquid endpoint URLs resolve to proxy routes ───

  section("1. Liquid endpoint → Proxy route");

  for (const block of blocks) {
    for (const ep of block.endpoints) {
      const proxyPath = ep.url.replace(proxyPrefix + "/", "");
      if (ep.url.startsWith(proxyPrefix + "/") && proxyRoutes.has(proxyPath)) {
        pass(`${block.file} data-${ep.attr}="${ep.url}" → proxyPath="${proxyPath}"`);
      } else if (!ep.url.startsWith(proxyPrefix + "/")) {
        fail(`${block.file} data-${ep.attr}="${ep.url}" — wrong prefix (expected ${proxyPrefix}/...)`);
      } else {
        fail(`${block.file} data-${ep.attr}="${ep.url}" → proxyPath="${proxyPath}" NOT FOUND in api.proxy.$.tsx`);
      }
    }
  }

  // ─── Check 2: JS fallback endpoints resolve to proxy routes ──

  section("2. JS fallback endpoints → Proxy route");

  for (const asset of jsAssets) {
    for (const url of asset.fallbacks) {
      const proxyPath = url.replace(proxyPrefix + "/", "");
      if (url.startsWith(proxyPrefix + "/") && proxyRoutes.has(proxyPath)) {
        pass(`${asset.file} fallback "${url}" → proxyPath="${proxyPath}"`);
      } else if (!url.startsWith(proxyPrefix + "/")) {
        fail(`${asset.file} fallback "${url}" — wrong prefix (expected ${proxyPrefix}/...)`);
      } else {
        fail(`${asset.file} fallback "${url}" → proxyPath="${proxyPath}" NOT FOUND in api.proxy.$.tsx`);
      }
    }
  }

  // ─── Check 3: Schema assets exist on disk ────────────────────

  section("3. Schema assets → Files on disk");

  for (const block of blocks) {
    if (!block.schema) continue;
    const { javascript, stylesheet } = block.schema;

    if (javascript) {
      const jsPath = path.join(ASSETS_DIR, javascript);
      if (fs.existsSync(jsPath)) {
        pass(`${block.file} schema.javascript="${javascript}" exists`);
      } else {
        fail(`${block.file} schema.javascript="${javascript}" — FILE NOT FOUND at assets/${javascript}`);
      }
    }

    if (block.runtimeJavascript && block.runtimeJavascript !== javascript) {
      const runtimePath = path.join(ASSETS_DIR, block.runtimeJavascript);
      if (fs.existsSync(runtimePath)) {
        pass(`${block.file} data-rp-widget-src="${block.runtimeJavascript}" exists`);
      } else {
        fail(`${block.file} data-rp-widget-src="${block.runtimeJavascript}" — FILE NOT FOUND at assets/${block.runtimeJavascript}`);
      }
    }

    if (stylesheet) {
      const cssPath = path.join(ASSETS_DIR, stylesheet);
      if (fs.existsSync(cssPath)) {
        pass(`${block.file} schema.stylesheet="${stylesheet}" exists`);
      } else {
        fail(`${block.file} schema.stylesheet="${stylesheet}" — FILE NOT FOUND at assets/${stylesheet}`);
      }
    }
  }

  // ─── Check 4: TOML modules exist on disk ─────────────────────

  section("4. TOML targeting → Liquid blocks on disk");

  for (const entry of tomlTargets) {
    const modulePath = path.join(EXT_DIR, entry.module.replace("./", ""));
    if (fs.existsSync(modulePath)) {
      pass(`module="${entry.module}" (target=${entry.target}) exists`);
    } else {
      fail(`module="${entry.module}" (target=${entry.target}) — FILE NOT FOUND`);
    }
  }

  // ─── Check 5: TOML target matches schema target ──────────────

  section("5. TOML target ↔ Schema target consistency");

  for (const entry of tomlTargets) {
    const moduleName = path.basename(entry.module);
    const block = blocks.find((b) => b.file === moduleName);
    if (!block || !block.schema) continue;

    if (block.schema.target === entry.target) {
      pass(`${block.file} TOML target="${entry.target}" matches schema target="${block.schema.target}"`);
    } else {
      fail(`${block.file} TOML target="${entry.target}" ≠ schema target="${block.schema.target}"`);
    }
  }

  // ─── Check 6: Liquid IDs match JS getElementById ─────────────

  section("6. Liquid element IDs ↔ JS getElementById");

  for (const block of blocks) {
    if (!block.schema) continue;
    const jsFile = block.runtimeJavascript;
    if (!jsFile) continue;

    const asset = jsAssets.find((a) => a.file === jsFile);
    if (!asset) continue;

    // Deduplicate IDs (authenticated + guest divs share the same ID)
    const uniqueIds = [...new Set(block.ids)];

    for (const id of uniqueIds) {
      const selectorReference = asset.content.includes(`#${id}`);
      if (asset.elementIds.includes(id) || selectorReference) {
        pass(`${block.file} id="${id}" found in ${asset.file} DOM selector`);
      } else {
        fail(`${block.file} id="${id}" — NOT referenced in ${asset.file} DOM selectors`);
      }
    }

    // Check for JS getElementById calls that don't match any Liquid ID
    for (const jsId of asset.elementIds) {
      if (!block.ids.includes(jsId)) {
        fail(`${asset.file} getElementById("${jsId}") — NOT found in ${block.file}`);
      }
    }
  }

  // ─── Check 7: Liquid data-* attrs ↔ JS dataset access ────────

  section("7. Liquid data-* attributes ↔ JS dataset.* access");

  function dataAttrToDatasetKey(attr) {
    // data-customer-id → customerId, data-api-endpoint → apiEndpoint
    return attr
      .replace(/^data-/, "")
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  for (const block of blocks) {
    if (!block.schema) continue;
    const jsFile = block.runtimeJavascript;
    if (!jsFile) continue;
    const asset = jsAssets.find((a) => a.file === jsFile);
    if (!asset) continue;

    // Extract all data-* attributes from Liquid (skip Liquid expressions like {{ }})
    const dataAttrs = [];
    const dataAttrRe = /\bdata-([\w-]+)\s*=/g;
    let m;
    while ((m = dataAttrRe.exec(block.content)) !== null) {
      const attrName = m[1];
      // Loader metadata is consumed by rp-widget-loader.js rather than the
      // feature runtime selected above.
      if (attrName === "state" ||
          attrName === "initialized" ||
          attrName === "rp-utils-src" ||
          attrName === "rp-widget-src") continue;
      const dsKey = dataAttrToDatasetKey("data-" + attrName);
      dataAttrs.push({ attr: "data-" + attrName, dsKey });
    }

    // Check each Liquid data-* is read in JS via dataset.*
    const uniqueAttrs = [...new Map(dataAttrs.map((a) => [a.attr, a])).values()];
    for (const { attr, dsKey } of uniqueAttrs) {
      // Look for dataset.KEY or d.KEY (common shorthand in parseConfiguration)
      const dsRe = new RegExp(`(?:dataset|\\bd)\\s*\\.\\s*${dsKey}\\b`);
      if (dsRe.test(asset.content)) {
        pass(`${block.file} ${attr} → ${asset.file} dataset.${dsKey}`);
      } else {
        fail(`${block.file} ${attr} — NOT read in ${asset.file} as dataset.${dsKey}`);
      }
    }
  }

  // ─── Check 8: JS POST body fields ↔ Proxy body reads ─────────

  section("8. JS POST body fields ↔ Proxy body reads");

  const proxySrc = fs.readFileSync(PROXY_PATH, "utf-8");

  for (const asset of jsAssets) {
    // Find JSON.stringify({ ... }) patterns in POST requests
    const postBodyRe = /body\s*:\s*JSON\.stringify\s*\(\s*\{([^}]+)\}\s*\)/g;
    let m2;
    while ((m2 = postBodyRe.exec(asset.content)) !== null) {
      const bodyContent = m2[1];
      // Extract field names: both explicit (key: value) and shorthand (key,  key })
      const fieldNames = new Set();
      // Explicit properties: key: value
      const explicitRe = /(\w+)\s*:/g;
      let fm;
      while ((fm = explicitRe.exec(bodyContent)) !== null) {
        fieldNames.add(fm[1]);
      }
      // Shorthand properties: standalone identifiers not followed by : (e.g. { boxId, shop })
      // Strip string literals first to avoid matching words inside "free-entry" etc.
      const stripped = bodyContent.replace(/"[^"]*"|'[^']*'/g, '""');
      const shorthandRe = /\b([a-zA-Z_]\w*)\b/g;
      while ((fm = shorthandRe.exec(stripped)) !== null) {
        const name = fm[1];
        // Skip if it's a value (appears after :) or a known non-field keyword
        const before = stripped.substring(0, fm.index).trimEnd();
        if (before.endsWith(":") || before.endsWith(".") || name === "this" || name === "config" || name === "true" || name === "false" || name === "null") continue;
        fieldNames.add(name);
      }

      for (const fieldName of fieldNames) {
        // Check proxy reads this field from body
        const proxyReadsField =
          proxySrc.includes(`body.${fieldName}`) ||
          proxySrc.includes(`{ ${fieldName}`) ||
          proxySrc.includes(`, ${fieldName}`) ||
          proxySrc.includes(`{ ${fieldName},`) ||
          new RegExp(`\\{[^}]*\\b${fieldName}\\b[^}]*\\}\\s*=\\s*body`).test(proxySrc);

        if (proxyReadsField) {
          pass(`${asset.file} POST body.${fieldName} → read by proxy`);
        } else {
          fail(`${asset.file} POST body.${fieldName} — NOT destructured/read in proxy handler`);
        }
      }
    }
  }

  // ─── Summary ─────────────────────────────────────────────────

  console.log("\n" + "─".repeat(50));
  console.log(
    `\x1b[1m${passes} passed, ${failures} failed\x1b[0m` +
      (failures === 0 ? " \x1b[32m— All clear\x1b[0m" : " \x1b[31m— WIRING ISSUES DETECTED\x1b[0m")
  );
  console.log();

  process.exit(failures > 0 ? 1 : 0);
}

run();
