import normalizedStatementSchema from "@cambridge-tcg/answering-rhymes/schema/statement-v1.json";

export const dynamic = "force-static";

/** Raw, cacheable JSON Schema at the exact URI declared by its `$id`. */
export function GET(): Response {
  return new Response(JSON.stringify(normalizedStatementSchema), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/schema+json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
