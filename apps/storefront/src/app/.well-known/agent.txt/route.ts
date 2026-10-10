import { buildAgentText } from "@/lib/public-discovery";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

// Replaces public/.well-known/agent.txt; no static shadow to drift from GUIDES/MANIFEST.
export async function GET(): Promise<Response> {
  return new Response(buildAgentText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
