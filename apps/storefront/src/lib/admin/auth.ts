import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function makeToken(password: string): string {
  return crypto.createHmac("sha256", "kingdom-admin").update(password).digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!ADMIN_PASSWORD) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return false;
  return token === makeToken(ADMIN_PASSWORD);
}
