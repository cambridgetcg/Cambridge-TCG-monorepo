import { buildLlmsText } from "@/lib/public-discovery";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(): Promise<Response> {
  return new Response(buildLlmsText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
