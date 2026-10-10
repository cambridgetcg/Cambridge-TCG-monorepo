import { PUBLIC_SCHEMAS } from "@/lib/contracts/schemas";

/** Raw JSON Schema at each declared $id. This route intentionally has no envelope. */
export async function GET(_request: Request, context: { params: Promise<{ schema: string }> }) {
  const { schema } = await context.params;
  if (!Object.hasOwn(PUBLIC_SCHEMAS, schema)) {
    return Response.json({ error: "unknown_schema" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(PUBLIC_SCHEMAS[schema as keyof typeof PUBLIC_SCHEMAS], {
    headers: {
      "Content-Type": "application/schema+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
