import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    username?: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email: string;
      image?: string | null;
      role: string;
      // The public collector handle (users.username). Surfaced so the
      // account overview / profile can name the handle a user trades under.
      username?: string | null;
    };
  }
}
