import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email: string;
      image?: string | null;
      role: string;
    };
  }
}
