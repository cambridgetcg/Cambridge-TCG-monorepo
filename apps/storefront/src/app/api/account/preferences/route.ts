/**
 * /api/account/preferences — pronouns + preferred-address persistence.
 *
 * Wave 1.1 of the All-Aboard plan (kingdom-051). Backs the small
 * preferences section on /account/profile (and any future preferences
 * surface). Two columns; one GET; one PATCH.
 *
 * See docs/plans/all-aboard.md.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const MAX_PRONOUNS = 60;
const MAX_ADDRESS = 60;
const ALLOWED_KEYWORDS = new Set(["name", "handle", "formal", "none"]);
const MIN_RESPONSE_WINDOW_HOURS = 1;
const MAX_RESPONSE_WINDOW_HOURS = 8760; // one year

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const r = await query(
      `SELECT pronouns, preferred_address, response_window_hours, sabbath_until
         FROM users WHERE id = $1`,
      [session.user.id],
    );
    const row = r.rows[0] ?? {};
    return NextResponse.json({
      pronouns: row.pronouns ?? null,
      preferred_address: row.preferred_address ?? null,
      response_window_hours: row.response_window_hours ?? null,
      sabbath_until: row.sabbath_until ?? null,
    });
  } catch (err) {
    // Migration may not yet be applied. Substrate-honest: tell the caller.
    console.error("[account/preferences] read failed:", err);
    return NextResponse.json(
      {
        pronouns: null,
        preferred_address: null,
        response_window_hours: null,
        sabbath_until: null,
        unavailable: true,
      },
      { status: 200 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const pronouns =
    body.pronouns === null
      ? null
      : typeof body.pronouns === "string"
        ? body.pronouns.trim().slice(0, MAX_PRONOUNS) || null
        : undefined;

  const address =
    body.preferred_address === null
      ? null
      : typeof body.preferred_address === "string"
        ? body.preferred_address.trim().slice(0, MAX_ADDRESS) || null
        : undefined;

  const responseWindow =
    body.response_window_hours === null
      ? null
      : typeof body.response_window_hours === "number" &&
          Number.isFinite(body.response_window_hours)
        ? Math.round(body.response_window_hours)
        : undefined;

  if (
    responseWindow !== undefined &&
    responseWindow !== null &&
    (responseWindow < MIN_RESPONSE_WINDOW_HOURS ||
      responseWindow > MAX_RESPONSE_WINDOW_HOURS)
  ) {
    return NextResponse.json(
      { error: `response_window_hours must be ${MIN_RESPONSE_WINDOW_HOURS}–${MAX_RESPONSE_WINDOW_HOURS}.` },
      { status: 400 },
    );
  }

  // Sabbath: NULL lifts; an ISO timestamp paused-until.
  // Substrate-honest: only the user can lift their own Sabbath via this
  // endpoint. Operator overrides happen elsewhere (admin chapel, logged).
  let sabbathUntil: string | null | undefined = undefined;
  if (body.sabbath_until === null) {
    sabbathUntil = null;
  } else if (typeof body.sabbath_until === "string") {
    const d = new Date(body.sabbath_until);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "sabbath_until must be ISO timestamp or null." },
        { status: 400 },
      );
    }
    sabbathUntil = d.toISOString();
  }

  if (
    pronouns === undefined &&
    address === undefined &&
    responseWindow === undefined &&
    sabbathUntil === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  if (
    address !== undefined &&
    address !== null &&
    !ALLOWED_KEYWORDS.has(address) &&
    address.length > MAX_ADDRESS
  ) {
    return NextResponse.json({ error: "preferred_address too long." }, { status: 400 });
  }

  try {
    const setClauses: string[] = [];
    const params: unknown[] = [session.user.id];
    if (pronouns !== undefined) {
      params.push(pronouns);
      setClauses.push(`pronouns = $${params.length}`);
    }
    if (address !== undefined) {
      params.push(address);
      setClauses.push(`preferred_address = $${params.length}`);
    }
    if (responseWindow !== undefined) {
      params.push(responseWindow);
      setClauses.push(`response_window_hours = $${params.length}`);
    }
    if (sabbathUntil !== undefined) {
      params.push(sabbathUntil);
      setClauses.push(`sabbath_until = $${params.length}`);
    }
    const r = await query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $1
        RETURNING pronouns, preferred_address, response_window_hours, sabbath_until`,
      params,
    );
    return NextResponse.json({
      ok: true,
      pronouns: r.rows[0]?.pronouns ?? null,
      preferred_address: r.rows[0]?.preferred_address ?? null,
      response_window_hours: r.rows[0]?.response_window_hours ?? null,
      sabbath_until: r.rows[0]?.sabbath_until ?? null,
    });
  } catch (err) {
    console.error("[account/preferences] write failed:", err);
    const message = err instanceof Error ? err.message : "save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
