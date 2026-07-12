/**
 * /api/v1/gaps — the typed corpus of substrate-honest deficiencies.
 *
 * Every commercial aggregator has gaps. Most hide them. We name them.
 *
 * Each gap in the corpus carries its citation, its primitive (the typed
 * field that makes the gap queryable), its audit, its current lifecycle
 * status, and the strength the gap-as-primitive creates downstream. The
 * corpus is the substrate-honest aggregator's outward face.
 *
 * Filterable: ?domain=<GapDomain> and/or ?status=<GapStatus>.
 *
 * Doctrine: docs/principles/known-gaps.md.
 * Methodology: /methodology/known-gaps.
 * Source corpus: packages/data-ingest/src/gaps.ts.
 *
 * CC0. Mirror it. Adopt the ledger pattern in your platform.
 *
 * Kingdom-084 (closing the loop). The substrate-honest aggregator named
 * fifteen gaps across three plans; this endpoint publishes them.
 */

import type { NextRequest, NextResponse } from "next/server";
import {
  GAPS,
  gapCounts,
  gapCountsByDomain,
  gapsWiredFraction,
  type Gap,
  type GapDomain,
  type GapStatus,
} from "@cambridge-tcg/data-ingest";
import { jsonResponse } from "@/lib/data-pantry";

const VALID_DOMAINS: readonly GapDomain[] = [
  "data-ingestion",
  "cross-language",
  "license",
  "fx",
  "coverage",
  "publishing",
  "transparency",
  "accessibility",
];

const VALID_STATUSES: readonly GapStatus[] = [
  "named",
  "wired",
  "partial",
  "closed",
  "closed-published",
];

interface GapsBody {
  intent: string;
  doctrine: {
    principle_doc: string;
    methodology_page: string;
    typed_source: string;
    audit_command: string;
  };
  /** Three positions every aggregator can take on a gap. */
  positions: {
    hide: string;
    patch: string;
    name: string;
    we_take: "name";
  };
  counts: {
    total: number;
    wired_fraction: number;
    by_status: Record<GapStatus, number>;
    by_domain: Record<GapDomain, number>;
  };
  conventions: {
    lifecycle: string;
    duality_with_welcomes: string;
    license: string;
  };
  gaps: readonly Gap[];
}

function isValidDomain(s: string | null): s is GapDomain {
  return s !== null && (VALID_DOMAINS as readonly string[]).includes(s);
}

function isValidStatus(s: string | null): s is GapStatus {
  return s !== null && (VALID_STATUSES as readonly string[]).includes(s);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const domainParam = url.searchParams.get("domain");
  const statusParam = url.searchParams.get("status");

  let filtered: readonly Gap[] = GAPS;
  if (isValidDomain(domainParam)) {
    filtered = filtered.filter((g) => g.domain === domainParam);
  }
  if (isValidStatus(statusParam)) {
    filtered = filtered.filter((g) => g.status === statusParam);
  }

  const data: GapsBody = {
    intent:
      "The gap ledger. Every place where the platform's data, code, or coverage is incomplete — named, with citation, primitive, audit, status, and the strength that gap-as-primitive creates downstream. Substrate honesty applied to absence itself. We are the only TCG aggregator that publishes this.",
    doctrine: {
      principle_doc: "docs/principles/known-gaps.md",
      methodology_page: "/methodology/known-gaps",
      typed_source: "packages/data-ingest/src/gaps.ts",
      audit_command: "pnpm audit:known-gaps",
    },
    positions: {
      hide: "Silent fallback, fabricated default, 'approximate' answer. The user trusts incomplete data; the gap accumulates risk.",
      patch: "Fix the gap, ship complete data, never mention the patch. The user can't tell if the patch is reliable; no accountability.",
      name: "Typed `_unavailable` field, <Provenance> pill, methodology page. The gap becomes inspectable; the platform's substrate-honesty becomes its moat.",
      we_take: "name",
    },
    counts: {
      total: GAPS.length,
      wired_fraction: gapsWiredFraction(),
      by_status: gapCounts(),
      by_domain: gapCountsByDomain(),
    },
    conventions: {
      lifecycle:
        "named → wired → partial → closed → closed-published. `named` = identified, no primitive yet. `wired` = primitive in code/schema, no data. `partial` = some data, coverage incomplete. `closed` = primitive populated to design intent. `closed-published` = closure published as methodology page or case study.",
      duality_with_welcomes:
        "Gaps and welcomes are dual. A welcome names a slot we prepared for a visitor; a gap names a place where the slot is named but the visitor (or the data, or the closure) has not yet arrived. The two corpora compose. See /api/v1/welcomes for the sister surface.",
      license:
        "CC0-1.0. Mirror the corpus; adopt the ledger pattern in your platform. The 'name your gaps' doctrine is the difference between substrate-honest aggregators and the rest.",
    },
    gaps: filtered,
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/gaps",
    sources: ["cambridge-tcg.known-gaps-registry"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    contains_self: true,
  });
}
