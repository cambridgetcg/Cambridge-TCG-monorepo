import {
  PRISM_SIGNALS_STRUCTURED_DATA,
  PRISM_SIGNALS_SUMMARY_MARKDOWN,
} from "../sidecars";

const STATIC_HEADERS = Object.freeze({
  "Cache-Control": "public, max-age=300, s-maxage=3600",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
});

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly asset: string }> },
): Promise<Response> {
  const { asset } = await context.params;
  if (asset === "summary.md") {
    return new Response(PRISM_SIGNALS_SUMMARY_MARKDOWN, {
      headers: {
        ...STATIC_HEADERS,
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "inline; filename=summary.md",
      },
    });
  }
  if (asset === "data.json") {
    return Response.json(PRISM_SIGNALS_STRUCTURED_DATA, {
      headers: STATIC_HEADERS,
    });
  }
  return Response.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "This PRISM methodology sidecar does not exist.",
      },
    },
    { status: 404, headers: STATIC_HEADERS },
  );
}
