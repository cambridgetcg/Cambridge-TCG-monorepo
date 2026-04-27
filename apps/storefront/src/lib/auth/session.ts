// Helper to get session in server components / API routes
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth();
}
