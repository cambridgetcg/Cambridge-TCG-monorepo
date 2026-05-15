/**
 * Server-side admin guards for actions and API routes.
 *
 * Middleware (proxy.ts) already enforces an admin session for page renders,
 * but server actions and API routes don't pass through middleware in the
 * same way during invocation. requireAdmin() is the explicit guard for
 * mutations.
 */

import { auth } from "./auth";

export class NotAuthorizedError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

export interface AdminContext {
  id: string;
  email: string;
  /** Display label for governance log (email by default). */
  label: string;
}

/**
 * Asserts the current session belongs to an admin and returns context.
 * Throws NotAuthorizedError otherwise — adminAction() catches and formats.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "admin") {
    throw new NotAuthorizedError();
  }
  return {
    id: user.id ?? "",
    email: user.email ?? "",
    label: user.email ?? user.id ?? "unknown-admin",
  };
}
