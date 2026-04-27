import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPreferences,
  setPreferences,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  isEmailCategory,
  type EmailCategory,
  type PreferenceRow,
} from "@/lib/email/preferences";

// GET — current preferences + label metadata so the page can render without
// duplicating the category vocabulary.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const prefs = await getPreferences(session.user.id);
  return NextResponse.json({
    preferences: prefs,
    meta: Object.keys(CATEGORY_LABELS).map((c) => ({
      category: c,
      label: CATEGORY_LABELS[c as EmailCategory],
      description: CATEGORY_DESCRIPTIONS[c as EmailCategory],
    })),
  });
}

// PATCH — partial update. Body: { [category]: boolean, ... }
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<PreferenceRow> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isEmailCategory(k)) continue;
    if (typeof v !== "boolean") continue;
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields." }, { status: 400 });
  }
  const merged = await setPreferences(session.user.id, patch);
  return NextResponse.json({ preferences: merged });
}
