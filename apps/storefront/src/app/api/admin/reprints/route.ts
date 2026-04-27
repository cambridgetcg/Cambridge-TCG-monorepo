import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import {
  createReprintAnnouncement,
  listActiveReprintAnnouncements,
  setReprintStatus,
} from "@/lib/portfolio/reprints";

// GET — list active announcements (admin moderation queue)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const announcements = await listActiveReprintAnnouncements();
  return NextResponse.json({ announcements });
}

// POST — create a new announcement
//
// Body:
//   { scope: { kind: 'sku' | 'set' | 'pattern', value }, title,
//     severity?, expectedReleaseDate?, sourceUrl?, adminNotes?,
//     actorLabel? }
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const scopeKind = body?.scope?.kind;
  const scopeValue = (body?.scope?.value ?? "").toString().trim();
  if (!scopeKind || !scopeValue) {
    return NextResponse.json({ error: "scope.kind + scope.value required." }, { status: 400 });
  }

  const scope = scopeKind === "sku" ? { kind: "sku" as const, sku: scopeValue }
              : scopeKind === "set" ? { kind: "set" as const, setCode: scopeValue }
              : scopeKind === "pattern" ? { kind: "pattern" as const, query: scopeValue }
              : null;
  if (!scope) {
    return NextResponse.json({ error: "scope.kind must be 'sku' | 'set' | 'pattern'." }, { status: 400 });
  }

  const result = await createReprintAnnouncement({
    scope,
    title: body.title,
    severity: body.severity,
    expectedReleaseDate: body.expectedReleaseDate ?? null,
    sourceUrl: body.sourceUrl,
    adminNotes: body.adminNotes,
    createdByAdmin: (body.actorLabel ?? "admin").toString().trim() || "admin",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    announcement: result.announcement,
    affectedUsers: result.affectedUsers,
  });
}

// PATCH — change status (realize / cancel)
//
// Body: { id, status: 'realized' | 'cancelled', actorLabel?, reason? }
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = (body.id ?? "").toString();
  const status = body.status;
  if (!id || !["realized", "cancelled"].includes(status)) {
    return NextResponse.json(
      { error: "id + status ('realized' | 'cancelled') required." },
      { status: 400 },
    );
  }
  const updated = await setReprintStatus(
    id,
    status,
    (body.actorLabel ?? "admin").toString(),
    body.reason,
  );
  if (!updated) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }
  return NextResponse.json({ announcement: updated });
}
