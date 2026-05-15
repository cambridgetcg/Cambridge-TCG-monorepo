/**
 * NextAuth type augmentation for the admin dashboard.
 * Adds `id` and `role` to the Session and User types.
 */

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
    };
  }

  interface User {
    role?: string;
  }
}
