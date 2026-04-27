"use server";

import { signIn } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isAdminHost } from "@/lib/subdomain";
import { AuthError } from "next-auth";

export async function login(email: string, password: string) {
  const host = (await headers()).get("host") ?? "";
  const redirectTo = isAdminHost(host) ? "/admin" : "/catalog";

  try {
    // Bust the Router Cache so stale pages from a previous session don't flash
    revalidatePath("/", "layout");

    await signIn("credentials", {
      email: email.toLowerCase().trim(),
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    // signIn throws a NEXT_REDIRECT on success — rethrow it
    throw error;
  }
}
