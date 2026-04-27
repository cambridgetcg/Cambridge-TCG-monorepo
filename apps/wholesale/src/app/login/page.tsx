"use client";

import { useState, useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const email = (formData.get("email") as string) ?? "";
      const password = (formData.get("password") as string) ?? "";
      const result = await login(email, password);
      return result ?? null;
    },
    null,
  );

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-lg bg-[#12121a] p-8 border border-[#1e1e2e]">
        <h1 className="text-2xl font-bold text-center text-brand-500">TCG Wholesale</h1>
        <p className="text-center text-sm text-gray-400">Sign in to your account</p>
        {state?.error && <p className="text-red-400 text-sm text-center">{state.error}</p>}
        <input
          type="email"
          name="email"
          placeholder="Email"
          className="w-full rounded bg-[#0a0a0f] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          required
          disabled={pending}
          autoComplete="email"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          className="w-full rounded bg-[#0a0a0f] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          required
          disabled={pending}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-600 py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
