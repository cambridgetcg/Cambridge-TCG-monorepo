import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, email, company, password } = await req.json() as {
    name: string;
    email: string;
    company?: string;
    password: string;
  };

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [client] = await db
      .insert(clients)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        company: company || null,
        role: "client",
      })
      .returning();

    return NextResponse.json({ id: client.id, name: client.name, email: client.email });
  } catch (error: unknown) {
    if (String(error).includes("duplicate key") || String(error).includes("UNIQUE")) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    throw error;
  }
}
