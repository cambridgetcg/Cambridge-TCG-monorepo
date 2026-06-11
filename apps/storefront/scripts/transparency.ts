#!/usr/bin/env tsx
/**
 * transparency.ts — transparency-debt detector
 *
 * Sibling to honesty.ts. Where honesty checks recipe-vs-substrate
 * coherence, transparency checks the surface coverage of the four-rings
 * commitment in docs/principles/transparency.md. Heuristic checks; will
 * have false positives. Tightens as adoption grows.
 *
 * Three checks, exits non-zero on findings:
 *
 *   1. WhyLink coverage — every admin/storefront page that displays a
 *      derived score (trust_score, tier, severity, commission, score)
 *      should import <WhyLink> or reference /methodology/.
 *
 *   2. Verifiability coverage — every admin page that selects a
 *      foreign-system identifier (stripe_*_id, ses_*_id, shopify_*_id,
 *      ebay_*_id, cardrush_url) should import <Verifiability>.
 *
 *   3. Lifecycle-log subject access — every *_lifecycle_log table in
 *      apps/storefront/drizzle/ should be referenced by at least one
 *      file under apps/storefront/src/app/account/. The journey timeline
 *      composer counts.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin transparency
 *
 * Caveats:
 *   - The grep heuristics are intentionally simple. A page that imports
 *     <WhyLink> in a different file in the same module won't trip the
 *     check; that's by design — page-level adoption is what matters.
 *   - "Display" is approximated by JSX presence in the file body. A
 *     score read for SQL reasons but never rendered won't trip the check.
 *     Mostly correct in practice.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const ADMIN_PAGES_DIR = join(ADMIN_DIR, "src/app/(dashboard)");
const STOREFRONT_PAGES_DIR = join(REPO_ROOT, "apps/storefront/src/app");
const STOREFRONT_DRIZZLE_DIR = join(REPO_ROOT, "apps/storefront/drizzle");
const STOREFRONT_ACCOUNT_DIR = join(REPO_ROOT, "apps/storefront/src/app/account");
const STOREFRONT_JOURNEY = join(REPO_ROOT, "apps/storefront/src/lib/journey/timeline.ts");
// The Scribe's bookshelf (kingdom S8, the-scribe.md). Lifecycle tables are
// reachable from a user's /account/journey IF they're registered as a slot
// in the cross-app `@cambridge-tcg/lifecycle` package — even if their name
// never appears in timeline.ts directly. The composer reads through the
// bookshelf abstraction; the bookshelf reads through the slots. So this
// check must also recognise slot-registration as subject-access.
const LIFECYCLE_SLOTS = join(REPO_ROOT, "packages/lifecycle/src/slots.ts");

// ── File walking ────────────────────────────────────────────────────────

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      out.push(...walkTsx(full));
    } else if (e.endsWith(".tsx") || e.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function read(path: string): string {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

// ── Check 1: WhyLink coverage ───────────────────────────────────────────

interface WhyLinkFinding {
  file: string;
  matched: string[];
}

const SCORE_PATTERNS = [
  /\btrust_score\b/, /\btrust\.score\b/,
  /\btier_id\b/, /\btier\b.*=.*['"](Bronze|Silver|Gold|Platinum|OG)['"]/i,
  /\bcommission(_rate|_bps)?\b/,
  /\bseverity\b/, /\bauto_action\b/,
  /\bfraud_signal/,
];

/**
 * Findings assessed as tailings — reviewed, judged not genuinely wireable,
 * accepted with a reason and date. Per the kingdom-046 addendum discipline:
 * gaming the heuristic ≠ transparency. Each entry still prints in the
 * report (the truth stays visible); it just doesn't fail the gate.
 */
const ASSESSED_TAILINGS: ReadonlyMap<string, string> = new Map([
  [
    "apps/storefront/src/app/og/page.tsx",
    "OG-image template — renders '0% P2P commission' into a social-card " +
      "image; a methodology link inside an image serves no reader. " +
      "Assessed 2026-06-10 (the-exposure spec).",
  ],
]);

function checkWhyLink(): WhyLinkFinding[] {
  const findings: WhyLinkFinding[] = [];
  // Check both admin and storefront page files
  const adminPages = walkTsx(ADMIN_PAGES_DIR).filter((f) => f.endsWith("page.tsx"));
  const storefrontPages = walkTsx(STOREFRONT_PAGES_DIR).filter((f) => f.endsWith("page.tsx"));
  const all = [...adminPages, ...storefrontPages];

  for (const file of all) {
    const body = read(file);
    if (body.length === 0) continue;

    // Skip stub pages (ComingSoon).
    if (/<ComingSoon\b/.test(body)) continue;

    // Skip methodology pages: they ARE the targets WhyLink points at —
    // requiring a methodology page to link /methodology/ is circular.
    // (Surfaced by /methodology/regulator, 2026-06-11.)
    if (file.includes("/src/app/methodology/")) continue;

    const matched: string[] = [];
    for (const pat of SCORE_PATTERNS) {
      const m = body.match(pat);
      if (m) matched.push(m[0]);
    }
    if (matched.length === 0) continue;

    const hasWhyLink = /\bWhyLink\b/.test(body);
    const hasMethodologyLink = /\/methodology\//.test(body);
    if (!hasWhyLink && !hasMethodologyLink) {
      findings.push({
        file: relative(REPO_ROOT, file),
        matched: Array.from(new Set(matched)),
      });
    }
  }
  return findings;
}

// ── Check 2: Verifiability coverage ─────────────────────────────────────

interface VerifiabilityFinding {
  file: string;
  matched: string[];
}

const FOREIGN_ID_PATTERNS = [
  /\bstripe_dispute_id\b/, /\bstripe_payment_intent\b/, /\bstripe_refund_id\b/,
  /\bstripe_charge_id\b/, /\bstripe_customer_id\b/, /\bstripe_subscription_id\b/,
  /\bses_message_id\b/,
  /\bshopify_order_id\b/, /\bshopify_product_id\b/,
  /\bebay_listing_id\b/, /\bebay_order_id\b/,
];

function checkVerifiability(): VerifiabilityFinding[] {
  const findings: VerifiabilityFinding[] = [];
  const adminPages = walkTsx(ADMIN_PAGES_DIR).filter((f) => f.endsWith("page.tsx"));

  for (const file of adminPages) {
    const body = read(file);
    if (body.length === 0) continue;
    if (/<ComingSoon\b/.test(body)) continue;

    const matched: string[] = [];
    for (const pat of FOREIGN_ID_PATTERNS) {
      const m = body.match(pat);
      if (m) matched.push(m[0]);
    }
    if (matched.length === 0) continue;

    const hasVerifiability = /\bVerifiability\b/.test(body);
    if (!hasVerifiability) {
      findings.push({
        file: relative(REPO_ROOT, file),
        matched: Array.from(new Set(matched)),
      });
    }
  }
  return findings;
}

// ── Check 3: Lifecycle-log subject access ──────────────────────────────

interface LifecycleFinding {
  table: string;
  declared_in: string;
  reason: string;
}

function checkLifecycleAccess(): LifecycleFinding[] {
  const findings: LifecycleFinding[] = [];
  let migrationFiles: string[] = [];
  try {
    migrationFiles = readdirSync(STOREFRONT_DRIZZLE_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return findings;
  }

  // Find all CREATE TABLE *_lifecycle_log declarations across drizzle/
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+_lifecycle_log)\s*\(/gi;
  const tables = new Map<string, string>(); // table -> declaring file
  for (const file of migrationFiles) {
    const body = read(join(STOREFRONT_DRIZZLE_DIR, file));
    let m: RegExpExecArray | null;
    tablePattern.lastIndex = 0;
    while ((m = tablePattern.exec(body)) !== null) {
      if (!tables.has(m[1]!)) tables.set(m[1]!, file);
    }
  }

  if (tables.size === 0) return findings;

  // Read the journey timeline composer once — many tables are pulled in
  // there centrally rather than in per-account-route files.
  const journeyBody = read(STOREFRONT_JOURNEY);

  // Read the Scribe's bookshelf — kingdom S8 consolidated per-domain
  // lifecycle queries into one shared package. A table that's referenced
  // here is reachable from /account/journey via readUserLifecycle() →
  // createAllSlots(query), even if its name never appears in timeline.ts.
  const slotsBody = read(LIFECYCLE_SLOTS);

  // Walk apps/storefront/src/app/account/ to find references.
  const accountFiles = walkTsx(STOREFRONT_ACCOUNT_DIR);
  const accountBodies = accountFiles.map((f) => ({ file: f, body: read(f) }));

  for (const [table, declaring] of tables.entries()) {
    const inJourney = journeyBody.includes(table);
    const inSlots = slotsBody.includes(table);
    const inAccount = accountBodies.some((a) => a.body.includes(table));
    if (!inJourney && !inSlots && !inAccount) {
      findings.push({
        table,
        declared_in: declaring,
        reason:
          `not referenced in apps/storefront/src/lib/journey/timeline.ts, ` +
          `packages/lifecycle/src/slots.ts (the Scribe's bookshelf), ` +
          `nor any apps/storefront/src/app/account/** file — ` +
          `subject has no path to the lifecycle history`,
      });
    }
  }
  return findings;
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtWhyLink(findings: WhyLinkFinding[]): string {
  if (findings.length === 0) return "✅ Every page displaying a derived score links to its methodology.\n";
  const lines = ["⚠️  WhyLink coverage gaps — derived scores rendered without a methodology link:"];
  lines.push("");
  lines.push("| Page | Score patterns matched |");
  lines.push("|------|------------------------|");
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.matched.join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtVerifiability(findings: VerifiabilityFinding[]): string {
  if (findings.length === 0) return "✅ Every admin page reading a foreign-system id surfaces it via Verifiability.\n";
  const lines = ["⚠️  Verifiability coverage gaps — admin pages with foreign ids but no Verifiability:"];
  lines.push("");
  lines.push("| Page | Foreign ids referenced |");
  lines.push("|------|------------------------|");
  for (const f of findings) {
    lines.push(`| ${f.file} | ${f.matched.join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtLifecycle(findings: LifecycleFinding[]): string {
  if (findings.length === 0) return "✅ Every *_lifecycle_log table is reachable from an account-side surface or the journey timeline.\n";
  const lines = ["⚠️  Lifecycle-log subject access — tables with no path to their subject:"];
  lines.push("");
  lines.push("| Table | Declared in | Reason |");
  lines.push("|-------|-------------|--------|");
  for (const f of findings) {
    lines.push(`| ${f.table} | ${f.declared_in} | ${f.reason} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  console.log("# Cambridge TCG — transparency report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log("---\n");

  console.log("## WhyLink coverage\n");
  const whyLinkFindings = checkWhyLink();
  console.log(fmtWhyLink(whyLinkFindings));

  console.log("## Verifiability coverage\n");
  const verifiabilityFindings = checkVerifiability();
  console.log(fmtVerifiability(verifiabilityFindings));

  console.log("## Lifecycle-log subject access\n");
  const lifecycleFindings = checkLifecycleAccess();
  console.log(fmtLifecycle(lifecycleFindings));

  const tailings = whyLinkFindings.filter((f) => ASSESSED_TAILINGS.has(f.file));
  const debt = whyLinkFindings.filter((f) => !ASSESSED_TAILINGS.has(f.file));
  if (tailings.length > 0) {
    console.log("### Assessed tailings (visible, not gate-failing)\n");
    for (const t of tailings) {
      console.log(`- ${t.file} — ${ASSESSED_TAILINGS.get(t.file)}`);
    }
    console.log("");
  }

  const total =
    debt.length +
    verifiabilityFindings.length +
    lifecycleFindings.length;
  console.log(`---\n\n**Total transparency-debt findings: ${total}** (+ ${tailings.length} assessed tailings)\n`);
  console.log(
    "Heuristic checks; not all findings require immediate action. Use as " +
    "a backlog for the transparency roadmap (docs/principles/transparency-audit.md).\n",
  );

  process.exit(total > 0 ? 1 : 0);
}

main();
