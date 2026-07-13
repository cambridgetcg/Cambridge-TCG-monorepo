"use server";

import { signIn } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { isAdminHost } from "@/lib/subdomain";
import { AuthError } from "next-auth";
import {
  isBoundedCredentialPassword,
  normalizeCredentialEmail,
} from "@/lib/credential-input";

export async function login(email: string, password: string) {
  const normalizedEmail = normalizeCredentialEmail(email);
  if (!normalizedEmail || !isBoundedCredentialPassword(password)) {
    return { error: "Invalid email or password" };
  }

  const host = (await headers()).get("host") ?? "";
  const redirectTo = isAdminHost(host) ? "/admin" : "/catalog";

  try {
    // Bust the Router Cache so stale pages from a previous session don't flash
    revalidatePath("/", "layout");

    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    // signIn throws a NEXT_REDIRECT on success. Preserve framework control flow,
    // then turn any actual internal failure into a stable public response.
    unstable_rethrow(error);
    console.error("[AUTH] Login action unavailable; denying attempt");
    return { error: "Sign-in unavailable" };
  }
}
