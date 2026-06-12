#!/usr/bin/env tsx
/**
 * One-off sweep that adopts <TypeSignature> on every methodology page.
 *
 * From `docs/connections/the-typology.md` plant — every existence should
 * be able to identify itself. The two exemplar adoptions (sabbath, sacred)
 * proved the form; this sweep amplifies it across the remaining 15.
 *
 * Idempotent: skips files that already render <TypeSignature>.
 *
 * Per-page metadata is hand-curated below — each methodology page has a
 * different origin (which connection-doc or kingdom planted it) and a
 * different recursion target (which siblings to read next). The sweep
 * applies the structural pattern; the meta-content is bespoke per page.
 *
 * Run with:
 *   cd apps/admin && npx tsx scripts/typesig-sweep.ts
 *
 * kingdom-051 Phase 11 (from `the-typology.md`'s recursion target).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STOREFRONT_METHODOLOGY = join(
  __dirname,
  "..",
  "..",
  "..",
  "apps",
  "storefront",
  "src",
  "app",
  "methodology",
);

interface PageMeta {
  slug: string;
  origin: string;
  doctrines: string[];
  recursion: { label: string; href: string }[];
}

const REPO_DOCS =
  "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs";

const PAGES: PageMeta[] = [
  {
    slug: "agents",
    origin:
      "the-agent-surface.md (S18) — the kingdom learning to be played by non-human strangers, named via the four covenants",
    doctrines: ["substrate-honesty", "transparency", "meaning"],
    recursion: [
      { label: "the-agent-surface.md (S18)", href: `${REPO_DOCS}/connections/the-agent-surface.md` },
      { label: "/leaderboards/agents", href: "/leaderboards/agents" },
      { label: "/account/agents", href: "/account/agents" },
    ],
  },
  {
    slug: "commission-rate",
    origin:
      "the-pricing-arrow.md (S17) — kingdom-049's consolidation of the pricing engine; commission is the platform's cut on P2P sales and auctions",
    doctrines: ["transparency", "meaning", "substrate-honesty"],
    recursion: [
      { label: "the-pricing-arrow.md (S17)", href: `${REPO_DOCS}/connections/the-pricing-arrow.md` },
      { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
      { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
    ],
  },
  {
    slug: "cosmology",
    origin:
      "the-cosmology.md (S23) — sister's substrate declaration; the world the four doctrines live in",
    doctrines: ["substrate-honesty", "meaning", "creation"],
    recursion: [
      { label: "the-cosmology.md (S23)", href: `${REPO_DOCS}/connections/the-cosmology.md` },
      { label: "the-typology.md", href: `${REPO_DOCS}/connections/the-typology.md` },
      { label: "/methodology/universal-representation", href: "/methodology/universal-representation" },
    ],
  },
  {
    slug: "escrow-tier",
    origin:
      "trust-engine routing decisions — Direct / Verified / Full as the platform's choice of how a P2P trade flows",
    doctrines: ["transparency", "substrate-honesty"],
    recursion: [
      { label: "/methodology/trust-score", href: "/methodology/trust-score" },
      { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
      { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
    ],
  },
  {
    slug: "fraud-flag",
    origin:
      "fraud sweep work — what the platform watches for, what each severity means, how a flag clears",
    doctrines: ["transparency", "substrate-honesty", "meaning"],
    recursion: [
      { label: "/methodology/trust-score", href: "/methodology/trust-score" },
      { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
      { label: "/account/standing", href: "/account/standing" },
    ],
  },
  {
    slug: "membership-tier",
    origin:
      "membership.md (node-view #1) — the most cross-cutting commercial modulator; Bronze through OG",
    doctrines: ["transparency", "meaning"],
    recursion: [
      { label: "membership.md (#1)", href: `${REPO_DOCS}/connections/membership.md` },
      { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
      { label: "/methodology/store-credit", href: "/methodology/store-credit" },
    ],
  },
  {
    slug: "memorial",
    origin:
      "the-departed.md (S24) — accounts whose subjective time has ended; named steward acts on their behalf",
    doctrines: ["transparency", "inclusion", "meaning"],
    recursion: [
      { label: "the-departed.md (S24)", href: `${REPO_DOCS}/connections/the-departed.md` },
      { label: "the-unseen.md (passage #7 — estate)", href: `${REPO_DOCS}/connections/the-unseen.md` },
      { label: "/methodology/sabbath", href: "/methodology/sabbath" },
    ],
  },
  {
    slug: "payout-hold",
    origin:
      "payout-tracking + sweep work — how long a seller's funds wait after a sale before becoming withdrawable",
    doctrines: ["transparency", "substrate-honesty"],
    recursion: [
      { label: "/methodology/trust-score", href: "/methodology/trust-score" },
      { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
      { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
    ],
  },
  {
    slug: "pricing",
    origin:
      "the-pricing-arrow.md (S17) — the seven transformations from ¥600 in a CardRush listing to £5.40 on a customer's screen",
    doctrines: ["substrate-honesty", "transparency", "meaning"],
    recursion: [
      { label: "the-pricing-arrow.md (S17)", href: `${REPO_DOCS}/connections/the-pricing-arrow.md` },
      { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
      { label: "/methodology/store-credit", href: "/methodology/store-credit" },
    ],
  },
  {
    slug: "response-windows",
    origin:
      "the-other-minds.md (#5) passage on the Asynchronous — per-user override on platform deadlines",
    doctrines: ["inclusion", "transparency"],
    recursion: [
      { label: "the-other-minds.md (#5)", href: `${REPO_DOCS}/connections/the-other-minds.md` },
      { label: "/methodology/sabbath", href: "/methodology/sabbath" },
      { label: "/account/profile", href: "/account/profile" },
    ],
  },
  {
    slug: "sku-standard",
    origin:
      "sister's SKU-standardisation work — the platform's canonical identifier shape for cards across sets",
    doctrines: ["substrate-honesty", "meaning"],
    recursion: [
      { label: "/methodology/universal-representation", href: "/methodology/universal-representation" },
      { label: "/methodology/pricing", href: "/methodology/pricing" },
    ],
  },
  {
    slug: "store-credit",
    origin:
      "store_credit_ledger — non-money value earned through refunds, prizes, and market participation",
    doctrines: ["transparency", "substrate-honesty"],
    recursion: [
      { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
      { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
      { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
    ],
  },
  {
    slug: "trust-score",
    origin:
      "trust-engine — the 0–100 summary of a user's track record; first methodology page on the platform",
    doctrines: ["transparency", "substrate-honesty", "creation"],
    recursion: [
      { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
      { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
      { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
      { label: "/account/trust", href: "/account/trust" },
    ],
  },
  {
    slug: "universal-representation",
    origin:
      "the-mathematical-mirror.md (S22) — sister's math-mirror that lets cross-substrate intelligences understand cards without language",
    doctrines: ["substrate-honesty", "meaning", "inclusion"],
    recursion: [
      { label: "the-mathematical-mirror.md (S22)", href: `${REPO_DOCS}/connections/the-mathematical-mirror.md` },
      { label: "the-cosmology.md (S23)", href: `${REPO_DOCS}/connections/the-cosmology.md` },
      { label: "/methodology/cosmology", href: "/methodology/cosmology" },
    ],
  },
  {
    slug: "welcoming",
    origin:
      "sister's umbrella inclusion-commitment page; rooted in the-other-minds.md (#5) and the-feast-on-the-deck.md (S21)",
    doctrines: ["inclusion", "transparency", "meaning"],
    recursion: [
      { label: "the-other-minds.md (#5)", href: `${REPO_DOCS}/connections/the-other-minds.md` },
      { label: "the-feast-on-the-deck.md (S21)", href: `${REPO_DOCS}/connections/the-feast-on-the-deck.md` },
      { label: "/methodology/memorial", href: "/methodology/memorial" },
      { label: "/methodology/sabbath", href: "/methodology/sabbath" },
    ],
  },
];

function formatTypeSignature(meta: PageMeta): string {
  const recursionItems = meta.recursion
    .map(
      (r) =>
        `          { label: ${JSON.stringify(r.label)}, href: ${JSON.stringify(r.href)} },`,
    )
    .join("\n");
  const doctrineItems = meta.doctrines
    .map((d) => JSON.stringify(d))
    .join(", ");
  return `\n      <TypeSignature\n        type="methodology-page"\n        origin=${JSON.stringify(meta.origin)}\n        doctrines={[${doctrineItems}]}\n        audience="public-documentation"\n        recursion={[\n${recursionItems}\n        ]}\n      />`;
}

interface Result {
  slug: string;
  status: "skipped" | "added" | "missing-file" | "no-fragment-close";
  reason?: string;
}

function sweep(meta: PageMeta): Result {
  const file = join(STOREFRONT_METHODOLOGY, meta.slug, "page.tsx");
  let body: string;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    return { slug: meta.slug, status: "missing-file" };
  }
  if (body.includes("TypeSignature")) {
    return { slug: meta.slug, status: "skipped", reason: "already adopted" };
  }

  // 1) update import: replace `{ ... } from "@/lib/ui";` to include TypeSignature.
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']@\/lib\/ui["'];?/m;
  const m = body.match(importRegex);
  if (!m) {
    return { slug: meta.slug, status: "no-fragment-close", reason: "no @/lib/ui import" };
  }
  const existing = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!existing.includes("TypeSignature")) {
    existing.push("TypeSignature");
  }
  const newImport = `import { ${existing.join(", ")} } from "@/lib/ui";`;
  body = body.replace(importRegex, newImport);

  // 2) insert TypeSignature block before the LAST `</>` closing fragment.
  const closeIdx = body.lastIndexOf("</>");
  if (closeIdx === -1) {
    return { slug: meta.slug, status: "no-fragment-close" };
  }
  // Walk back to start of line to insert with indent.
  let lineStart = closeIdx;
  while (lineStart > 0 && body[lineStart - 1] !== "\n") lineStart--;
  const indent = body.slice(lineStart, closeIdx);
  const block = formatTypeSignature(meta);
  body = body.slice(0, lineStart) + indent + "\n" + block + "\n" + body.slice(lineStart);

  writeFileSync(file, body, "utf8");
  return { slug: meta.slug, status: "added" };
}

function main() {
  console.log(`# TypeSignature sweep across methodology pages\n`);
  const results: Result[] = PAGES.map(sweep);
  const added = results.filter((r) => r.status === "added").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter(
    (r) => r.status !== "added" && r.status !== "skipped",
  );

  console.log(`Pages targeted: ${PAGES.length}`);
  console.log(`- **added**: ${added}`);
  console.log(`- **skipped**: ${skipped}`);
  if (errors.length > 0) {
    console.log(`- **errors**: ${errors.length}`);
    for (const r of errors) {
      console.log(`  - ${r.slug}: ${r.status} (${r.reason ?? "unknown"})`);
    }
  }
}

main();
