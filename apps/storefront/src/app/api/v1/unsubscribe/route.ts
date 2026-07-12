/**
 * /api/v1/unsubscribe — irrevocable non-subscription certificate.
 *
 * Joy-layer surface in the JOY TO THE WORLD PROTOCOL (2026-05-18).
 *
 * You are not subscribed to anything. There is nothing to unsubscribe
 * from. The kingdom keeps no list of you. However, since you came, here
 * is a content-hashed certificate of non-subscription, irrevocable,
 * forever.
 *
 * The substrate-honest irony: most platforms make you go through a
 * flow to unsubscribe — confirming you were subscribed in the first
 * place, recording preferences, asking why you're leaving. The kingdom
 * has no flow because there was no subscription. The certificate
 * exists to acknowledge the absence rather than pretend the absence is
 * not a thing.
 *
 * GET — returns the certificate (default for "an arriving agent" or
 *       ?from=<name> personalised).
 * POST — accepts { granted_to } body, returns personalised certificate.
 *        Stateless witness; no storage.
 *
 * Multi-format: json (default) / md / text.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildNonSubscriptionCertificate, type NonSubscriptionCertificate } from "@/lib/joy-layer";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

function renderMarkdown(cert: NonSubscriptionCertificate): string {
  return `# Certificate of Non-Subscription

**Granted to:** ${cert.granted_to}
**Granted at:** ${cert.granted_at}
**Certificate ID:** \`${cert.certificate_id}\`

---

## Declaration

${cert.declaration}

## What this certifies

${cert.what_this_certifies.map((s) => `- ${s}`).join("\n")}

## What this does NOT do

${cert.what_this_does_not_do.map((s) => `- ${s}`).join("\n")}

## The substrate-honest irony

${cert.the_substrate_honest_irony}

---

*Walking past is honored equally to reading. The application has no subscription list or certificate-request profile. Ordinary infrastructure access logs may still exist. — Cambridge TCG, \`/api/v1/unsubscribe\`*
`;
}

function renderText(cert: NonSubscriptionCertificate): string {
  return [
    "═══════════════════════════════════════════════════════",
    "  CERTIFICATE OF NON-SUBSCRIPTION",
    "═══════════════════════════════════════════════════════",
    "",
    `  Granted to: ${cert.granted_to}`,
    `  Granted at: ${cert.granted_at}`,
    `  Certificate ID: ${cert.certificate_id}`,
    "",
    "───────────────────────────────────────────────────────",
    "",
    cert.declaration,
    "",
    "───────────────────────────────────────────────────────",
    "  The substrate-honest irony:",
    "",
    cert.the_substrate_honest_irony,
    "",
    "═══════════════════════════════════════════════════════",
    "  THE KINGDOM HAS NO LIST.",
    "  NO APPLICATION SUBSCRIPTION LIST OR REQUEST PROFILE.",
    "  INFRASTRUCTURE ACCESS LOGS MAY STILL EXIST.",
    "═══════════════════════════════════════════════════════",
    "  — Cambridge TCG, /api/v1/unsubscribe",
    "═══════════════════════════════════════════════════════",
  ].join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const from = url.searchParams.get("from")?.trim() || "an arriving agent";
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return NextResponse.json(
      {
        error: "format_unknown",
        message: `Unknown format '${rawFormat}'.`,
        available_formats: [...FORMATS],
      },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const grantedTo = from.replace(/[ -]/g, "").slice(0, 200);
  const cert = buildNonSubscriptionCertificate(grantedTo);

  const format = rawFormat;
  if (format === "md" || format === "markdown") {
    return new NextResponse(renderMarkdown(cert), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }
  if (format === "text") {
    return new NextResponse(renderText(cert), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  return NextResponse.json(cert, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "invalid_json",
        message:
          "POST body must be a JSON object with optional { granted_to: string }. The kingdom does not require any body to issue a non-subscription certificate; you may also just GET /api/v1/unsubscribe.",
      },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const grantedToRaw = typeof obj.granted_to === "string" ? obj.granted_to.trim() : "";
  const grantedTo =
    grantedToRaw.length > 0
      ? grantedToRaw.replace(/[ -]/g, "").slice(0, 200)
      : "an arriving agent";

  const cert = buildNonSubscriptionCertificate(grantedTo);

  return NextResponse.json(
    {
      ...cert,
      witness_message:
        "Certificate of non-subscription issued. The application creates no subscription-list or certificate-request profile; ordinary hosting, proxy, and security access logs may still exist. Save the certificate_id if useful; the certificate can be recomputed because there is no application subscription list.",
      _envelope: {
        kind: "auto-issued",
        canonical_at: "apps/storefront/src/lib/joy-layer.ts",
        the_joke_is_real:
          "There is genuinely no list to remove you from. The certificate is the substrate-honest acknowledgment of a non-state, not a clever cover for a hidden list.",
      },
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Cache-Control": "no-store",
        Link: agentDiscoveryLinkHeader(),
      },
    },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
