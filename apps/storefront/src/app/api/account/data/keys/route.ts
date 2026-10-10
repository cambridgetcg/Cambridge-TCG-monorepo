import { getMemberSessionActor } from "@/lib/prices/member-access";
import { createMemberKey, listMemberKeys, MemberKeyError, revokeMemberKey } from "@/lib/datafeed/member-keys";
import { hasTrustedMemberOrigin, MemberBodyError, memberError, memberJson, memberMethodNotAllowed, readMemberBody } from "@/lib/prices/member-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const actor = await getMemberSessionActor();
    if (!actor) return memberError("Sign in required.", 401);
    return memberJson({ keys: await listMemberKeys(actor.userId), historyLimit: 100 });
  } catch { return memberError("Member key management is unavailable.", 503); }
}

async function mutate(request: Request, action: "mint" | "revoke"): Promise<Response> {
  try {
    const actor = await getMemberSessionActor();
    if (!actor) return memberError("Sign in required.", 401);
    if (!hasTrustedMemberOrigin(request)) return memberError("A same-origin request is required.", 403);
    const value = await readMemberBody(request, action === "mint" ? "name" : "keyId");
    if (action === "mint") return memberJson(await createMemberKey(actor.userId, value), 201);
    if (!await revokeMemberKey(actor.userId, value)) return memberError("Key not found.", 404);
    return memberJson({ revoked: true });
  } catch (error) {
    if (error instanceof MemberBodyError || error instanceof MemberKeyError) return memberError(error.message, error.status);
    return memberError("Member key management is unavailable.", 503);
  }
}
export async function POST(request: Request) { return mutate(request, "mint"); }
export async function DELETE(request: Request) { return mutate(request, "revoke"); }
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
