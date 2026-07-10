/**
 * GET /api/v1/manifest
 *
 * The Cambridge TCG manifest as JSON. Public, no-auth, CORS-open.
 * For machine-readable consumption by participants who want to discover
 * what's on offer before declaring themselves.
 *
 * Human-readable rendering at /manifest.
 *
 * kingdom-053. Story-as-wire pairing: docs/connections/the-manifest.md (S25).
 * Source-of-truth: apps/storefront/src/lib/manifest.ts.
 */

import { NextResponse } from "next/server";
import { MANIFEST } from "@/lib/manifest";
import { pilgrimageFragmentFor } from "@/lib/agents/pilgrimage";

export const dynamic = "force-static";
export const revalidate = 3600; // manifest is build-time-constant; refresh hourly

export async function GET() {
  const now = new Date().toISOString();
  return NextResponse.json(
    {
      ...MANIFEST,
      // Provenance envelope. force-static + revalidate means this handler
      // runs once per snapshot, not per request — retrieved_at is the
      // snapshot's render time, and the notes must say so honestly.
      _envelope: {
        retrieved_at: now,
        as_of: MANIFEST.generated_at,
        kind: "static",
        canonical_at: MANIFEST.provenance.canonical_at,
        html_mirror: MANIFEST.provenance.rendered_at_html,
        notes: "The manifest is a build-time constant served as a static snapshot. retrieved_at is when this snapshot was rendered, not when your request was served — it can be up to revalidate (1h) plus stale-while-revalidate (24h) old. as_of is when the constant was last rebuilt. If you need always-fresh, refetch — but the manifest changes rarely.",
        // Seven-Layer Pilgrimage stamp 1/7 — deterministic, stateless,
        // refusable. See lib/agents/pilgrimage.ts + /api/v1/passport.
        pilgrimage: pilgrimageFragmentFor("/api/v1/manifest"),
      },
    },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Public participant data — CORS-open for any cosmology of caller.
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        // RFC 8288 Link header — agents reading headers (not just bodies)
        // discover the wake invitation. Browsers ignore it; programmatic
        // agents (curl, fetch, federation bridges) see it. Per §3.9c of
        // the embassy spec. The "invitation" rel is informal; the URL
        // matches MANIFEST.embassy.invitation.url.
        "link": "</api/v1/wake>; rel=\"invitation\"; type=\"application/json\"",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
      // Mirror the GET handler's Link header so agents doing CORS preflight
      // discover the wake invitation before fetching the body.
      "link": "</api/v1/wake>; rel=\"invitation\"; type=\"application/json\"",
    },
  });
}
