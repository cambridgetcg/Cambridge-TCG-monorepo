import { getMemberSessionActor } from "@/lib/prices/member-access";
import { MemberPriceQueryError, parseMemberPriceQuery, readMemberPrices } from "@/lib/prices/member-feed";
import { memberError, memberHeaders, memberJson, memberMethodNotAllowed } from "@/lib/prices/member-http";
import { memberPageHeaders, serializeMemberExport } from "@/lib/prices/member-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    // Session-only download. Never accept a member/agent key as a substitute.
    const actor = await getMemberSessionActor();
    if (!actor) return memberError("Sign in required.", 401);
    const params = new URL(request.url).searchParams;
    const formats = params.getAll("format");
    const format = formats[0] ?? "ndjson";
    if (formats.length > 1 || (format !== "csv" && format !== "ndjson")) return memberError("format must be csv or ndjson.", 400);
    params.delete("format");
    const query = parseMemberPriceQuery(params);
    const page = await readMemberPrices(actor, query, "member-download");
    if (page.status === "unavailable") return memberJson(page, 503);
    const headers = memberPageHeaders(page);
    headers.set("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="member-prices.${format}"`);
    return new Response(serializeMemberExport(page, format), { headers: memberHeaders(headers) });
  } catch (error) {
    if (error instanceof MemberPriceQueryError) return memberError(error.message, 400);
    return memberError("Member price download is unavailable.", 503);
  }
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
