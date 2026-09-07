import "server-only";
import { getSessionUser } from "@/lib/auth/realms";
import { query } from "@/lib/db";

/** Real NextAuth session, then current owner existence; no cookie-presence gate or paid tier. */
export async function getMemberSessionActor(): Promise<{ userId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const result = await query(`SELECT id FROM users WHERE id = $1`, [user.id]);
  return result.rows.length ? { userId: user.id } : null;
}
