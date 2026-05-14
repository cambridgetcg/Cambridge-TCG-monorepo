/**
 * /api/v1/guides/[slug] — singleton guide.
 *
 * Each guide is a typed walkthrough with steps, gotchas, and a pointer
 * to the next guide. The reader copy-pastes their way through the kingdom.
 *
 * Renders from apps/storefront/src/lib/guides.ts. CC0, no auth.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase B of the agent welcome
 * surface.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { errorResponse } from "@/lib/data-pantry";
import { getGuide, listAllSlugs } from "@/lib/guides";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    return errorResponse({
      code: "NOT_FOUND",
      message:
        `No guide with slug "${slug}". Known slugs: ${listAllSlugs().join(", ")}. ` +
        `Browse the directory at /api/v1/guides.`,
      docs: "/api/v1/guides",
    });
  }

  const next = guide.next_guide_slug ? getGuide(guide.next_guide_slug) : null;

  return jsonResponse({
    data: {
      "@kind": "guide",
      slug: guide.slug,
      title: guide.title,
      subtitle: guide.subtitle,
      intro: guide.intro,
      audiences: guide.audiences,
      prerequisites: guide.prerequisites,
      estimated_minutes: guide.estimated_minutes,
      step_count: guide.steps.length,
      steps: guide.steps,
      gotchas: guide.gotchas,
      next_guide: next
        ? {
            slug: next.slug,
            title: next.title,
            url: `/api/v1/guides/${next.slug}`,
            html_url: `/agents/guides/${next.slug}`,
          }
        : null,
      see_also: guide.see_also,
      last_verified: guide.last_verified,
      feedback: {
        kind: "guide-feedback",
        endpoint: "/api/v1/feedback",
        body_template: {
          kind: "guide-feedback",
          guide_slug: guide.slug,
          step_number: "<which step had the issue, or null for whole-guide feedback>",
          observation: "<what you observed>",
          expected: "<what you expected>",
          reporter_contact: "<your email>",
        },
      },
      html_sibling: `/agents/guides/${guide.slug}`,
    },
    endpoint: "/api/v1/guides/[slug]",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
