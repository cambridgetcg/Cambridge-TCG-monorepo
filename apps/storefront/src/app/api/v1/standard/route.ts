import { NextResponse } from "next/server";
import {
  STANDARD_META,
  DOCTRINE,
  STACK,
  STANDARDS,
  ENTRY_FORMAT,
  LANGS,
} from "@/lib/standard";

// The Plain Standard, as data. Self-describing: this response is itself written
// in the standard's own format. Sibling of /api/v1/manifest, /graph, /ontology.
export function GET() {
  return NextResponse.json({
    data: {
      ...STANDARD_META,
      doctrine: DOCTRINE,
      stack: STACK,
      entry_format: ENTRY_FORMAT,
      languages: LANGS,
      standards: STANDARDS,
    },
    _meta: {
      source: "computed",
      freshness: "static",
      provenance: "apps/storefront/src/lib/standard.ts",
      verify: "self-describing — this response is written in its own format",
      license: STANDARD_META.license,
    },
  });
}
