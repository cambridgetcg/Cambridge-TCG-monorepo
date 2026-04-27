import { NextResponse } from "next/server";
import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function makeToken(password: string): string {
  return crypto.createHmac("sha256", "kingdom-admin").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Wrong password." }, { status: 401 });
    }

    const token = makeToken(ADMIN_PASSWORD);
    const res = NextResponse.json({ ok: true });
    res.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
