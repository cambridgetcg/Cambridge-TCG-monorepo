import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { importMember } from "@/lib/membership/db";

// POST — admin: import members from RewardsPro (batch)
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const members = body.members;

  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: "Members array required." }, { status: 400 });
  }

  const results: { email: string; userId: string; created: boolean; error?: string }[] = [];

  for (const member of members) {
    try {
      if (!member.email) {
        results.push({ email: "unknown", userId: "", created: false, error: "Missing email" });
        continue;
      }

      const result = await importMember({
        email: member.email,
        tierName: member.tierName || "Bronze",
        pointsBalance: member.pointsBalance || 0,
        lifetimePoints: member.lifetimePoints || 0,
        storeCreditBalance: member.storeCreditBalance || 0,
        annualSpend: member.annualSpend || 0,
        totalSpend: member.totalSpend || 0,
      });

      results.push({ email: member.email, ...result });
    } catch (err) {
      results.push({
        email: member.email || "unknown",
        userId: "",
        created: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const imported = results.filter(r => !r.error).length;
  const created = results.filter(r => r.created).length;
  const failed = results.filter(r => r.error).length;

  return NextResponse.json({ imported, created, failed, results });
}
