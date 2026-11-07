import { buildAgentText } from "@/lib/public-discovery";
import { errandDiscoveryLinkHeader } from "@/lib/siblings";

// Replaces public/.well-known/agent.txt; no static shadow to drift from GUIDES/MANIFEST.
export async function GET(): Promise<Response> {
  return new Response(buildAgentText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
      // Navigation only, like the other discovery documents (Quiet Doors, 2026-10).
      Link: errandDiscoveryLinkHeader(),
    },
  });
}
