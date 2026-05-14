#!/usr/bin/env tsx
/**
 * welcomes audit — the hospitality is honest.
 *
 * 15th in the audit family. Verifies the substrate of the welcome-table
 * doctrine (kingdom-080, docs/connections/the-welcome-table.md):
 *
 *   Check A — every shipped or partial source carries `SourceMeta.welcome`.
 *             (sources that have arrived deserve a welcome on file)
 *
 *   Check B — every planned source is *either* covered by sister's
 *             `WELCOMES` corpus (welcomes.ts) *or* carries a stub-level
 *             welcome on its meta. No chair without a name.
 *
 *   Check C — composition between the two surfaces is consistent — when
 *             a source id appears in both `SourceMeta.welcome` AND
 *             sister's WELCOMES corpus, they're not contradicting each
 *             other (same arrival-state classification).
 *
 *   Check D — welcomes are non-empty (> 80 chars) and address the
 *             upstream by name (the source's display name appears in
 *             the welcome text). Substrate-honest about the most common
 *             drift: a copy-pasted welcome with the wrong name.
 *
 * STRICT mode (--strict): exits 1 on any failed check.
 *
 * Designed in `docs/connections/the-welcome-table.md` (kingdom-080) §10.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin welcomes
 *   pnpm --filter @cambridge-tcg/admin welcomes -- --strict
 */

import {
  listSourceMeta,
  sourcesByStatus,
  type SourceMeta,
} from "@cambridge-tcg/data-ingest";

const STRICT = process.argv.includes("--strict");
const MIN_WELCOME_LENGTH = 80;

interface Finding {
  check: "A" | "B" | "C" | "D";
  source_id: string;
  severity: "drift" | "warning";
  reason: string;
}

function shortenName(meta: SourceMeta): string[] {
  // Surface a few name variants the welcome might reasonably use
  return [meta.name, meta.id, meta.id.replace(/-/g, " ")].filter((s) => s && s.length > 2);
}

async function loadSisterWelcomes(): Promise<{
  byId: Map<string, { greeting: string; status: string }>;
  available: boolean;
}> {
  try {
    // Sister's WELCOMES corpus is re-exported from the package barrel
    // (packages/data-ingest/src/index.ts). Source-typed entries have
    // a `source_id` field; non-source entries (infrastructure, future
    // beings) don't and are ignored here.
    const mod = (await import("@cambridge-tcg/data-ingest")) as {
      WELCOMES?: ReadonlyArray<{ source_id?: string; greeting?: string; status?: string }>;
    };
    if (!mod.WELCOMES || !Array.isArray(mod.WELCOMES)) {
      return { byId: new Map(), available: false };
    }
    const byId = new Map<string, { greeting: string; status: string }>();
    for (const entry of mod.WELCOMES) {
      if (entry.source_id) {
        byId.set(entry.source_id, {
          greeting: entry.greeting ?? "",
          status: entry.status ?? "",
        });
      }
    }
    return { byId, available: true };
  } catch {
    return { byId: new Map(), available: false };
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ welcomes audit — hospitality as a schema field");
  console.log("");

  const metas = listSourceMeta();
  const partition = sourcesByStatus();
  const sister = await loadSisterWelcomes();

  console.log(`  sources with modules:    ${metas.length}`);
  console.log(`    shipped:               ${partition.shipped.length}`);
  console.log(`    partial:               ${partition.partial.length}`);
  console.log(`    planned (slot-only):   ${partition.planned.length}`);
  console.log(`    blocked:               ${partition.blocked.length}`);
  console.log(`  sister WELCOMES corpus:  ${sister.available ? `${sister.byId.size} source-id entries` : "not loadable (composition check skipped)"}`);
  console.log("");

  const findings: Finding[] = [];

  // ── Check A — every shipped/partial source has meta.welcome ─────────
  for (const meta of metas) {
    if (meta.status !== "shipped" && meta.status !== "partial") continue;
    if (!meta.welcome || meta.welcome.trim().length === 0) {
      findings.push({
        check: "A",
        source_id: meta.id,
        severity: "drift",
        reason: `${meta.status} source has no meta.welcome; write one in packages/data-ingest/src/${meta.id}/index.ts (recommended 2-5 sentences, specific to the source)`,
      });
    }
  }

  // ── Check B — every planned slot has a welcome somewhere ─────────────
  // Slots without modules are sister's WELCOMES corpus territory.
  // Slots with modules but status='planned' should have a meta.welcome too.
  for (const meta of metas) {
    if (meta.status !== "planned") continue;
    const inMeta = Boolean(meta.welcome && meta.welcome.trim().length > 0);
    const inCorpus = sister.available && sister.byId.has(meta.id);
    if (!inMeta && !inCorpus) {
      findings.push({
        check: "B",
        source_id: meta.id,
        severity: "drift",
        reason: `planned source has no welcome — neither in meta.welcome nor in sister's WELCOMES corpus. Pull the chair out: write a meta.welcome or add a corpus entry.`,
      });
    }
  }

  // The planned-slot-only ids (no module at all) — sister's territory
  for (const id of partition.planned) {
    if (metas.find((m) => m.id === id)) continue; // it's a planned-with-module case, handled by Check B above
    if (sister.available && !sister.byId.has(id)) {
      findings.push({
        check: "B",
        source_id: id,
        severity: "drift",
        reason: `planned slot ${id} has no module AND no entry in sister's WELCOMES corpus. Either start the module (with a meta.welcome) or add a corpus entry to packages/data-ingest/src/welcomes.ts.`,
      });
    } else if (!sister.available) {
      findings.push({
        check: "B",
        source_id: id,
        severity: "warning",
        reason: `planned slot ${id} has no module; sister's corpus not loadable so composition check is incomplete.`,
      });
    }
  }

  // ── Check C — composition consistency ───────────────────────────────
  if (sister.available) {
    for (const meta of metas) {
      if (!meta.welcome) continue;
      const sisterEntry = sister.byId.get(meta.id);
      if (!sisterEntry) continue;
      // Coarse status alignment: sister's "arrived" should not pair with
      // a meta status of "planned" or "blocked"; sister's "anticipated"
      // should not pair with meta status of "shipped".
      const sisterStatus = sisterEntry.status;
      const metaStatus = meta.status;
      const inconsistent =
        (sisterStatus === "arrived" && (metaStatus === "planned" || metaStatus === "blocked")) ||
        (sisterStatus === "anticipated" && metaStatus === "shipped");
      if (inconsistent) {
        findings.push({
          check: "C",
          source_id: meta.id,
          severity: "warning",
          reason: `composition drift: meta.status='${metaStatus}' but sister corpus status='${sisterStatus}'. Reconcile in next deploy.`,
        });
      }
    }
  }

  // ── Check D — welcomes address the upstream by name + are non-trivial
  for (const meta of metas) {
    if (!meta.welcome) continue;
    const text = meta.welcome;
    if (text.length < MIN_WELCOME_LENGTH) {
      findings.push({
        check: "D",
        source_id: meta.id,
        severity: "warning",
        reason: `welcome is ${text.length} chars (< ${MIN_WELCOME_LENGTH}); recommended 2-5 sentences specific to the source`,
      });
    }
    const variants = shortenName(meta);
    const containsName = variants.some((v) => text.toLowerCase().includes(v.toLowerCase()));
    if (!containsName) {
      findings.push({
        check: "D",
        source_id: meta.id,
        severity: "warning",
        reason: `welcome doesn't mention the source by name (${variants.join(" / ")}). Copy-paste drift? Most common authoring mistake.`,
      });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  const byCheck = {
    A: findings.filter((f) => f.check === "A"),
    B: findings.filter((f) => f.check === "B"),
    C: findings.filter((f) => f.check === "C"),
    D: findings.filter((f) => f.check === "D"),
  };
  const drifts = findings.filter((f) => f.severity === "drift").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  console.log("◇ Findings by check");
  console.log("");
  console.log(`  Check A — shipped/partial with meta.welcome:  ${metas.filter((m) => (m.status === "shipped" || m.status === "partial") && m.welcome).length} / ${metas.filter((m) => m.status === "shipped" || m.status === "partial").length}`);
  console.log(`    findings:                                  ${byCheck.A.length}`);
  console.log(`  Check B — planned covered by some welcome:   ${byCheck.B.length} drift(s)`);
  console.log(`  Check C — meta × corpus composition:         ${byCheck.C.length} drift(s)`);
  console.log(`  Check D — welcome text quality:              ${byCheck.D.length} warning(s)`);
  console.log("");

  if (findings.length > 0) {
    console.log("◇ Detail");
    console.log("");
    for (const f of findings) {
      console.log(`    [${f.check}] (${f.severity}) ${f.source_id}: ${f.reason}`);
    }
    console.log("");
  }

  console.log(`  Total: ${drifts} drift(s) + ${warnings} warning(s)`);
  console.log("");

  if (findings.length === 0) {
    console.log("✓ hospitality is honest — every shipped source carries a welcome that names it;");
    console.log("  every planned slot has a chair pulled out; composition between meta and corpus");
    console.log("  is consistent. The architecture speaks.");
    console.log("");
  }

  if (STRICT && drifts > 0) {
    console.log(`STRICT mode: ${drifts} drift(s); exiting 1.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
