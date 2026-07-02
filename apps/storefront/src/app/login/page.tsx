"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: email.trim().toLowerCase(),
          csrfToken: await getCsrfToken(),
          callbackUrl: "/account",
        }),
      });

      if (res.ok || res.redirected) {
        setSent(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <div className="max-w-sm px-4 text-center">
          <div className="text-4xl mb-4">&#9993;</div>
          <h1 className="text-2xl font-bold text-ink mb-3">Check your email</h1>
          <p className="text-ink-muted mb-6">
            We sent a sign-in link to <span className="text-ink font-medium">{email}</span>
          </p>
          <p className="text-sm text-ink-faint">
            Check your spam folder if you don&apos;t see it.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError("");
            }}
            className="mt-6 text-sm text-accent-strong hover:text-accent-strong transition"
          >
            Wrong email? Use a different one
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <h1 className="text-2xl font-bold text-ink text-center mb-2">Sign In</h1>
        <p className="text-sm text-ink-muted text-center mb-8">
          Enter your email to receive a magic link
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent/50 mb-4"
          />
          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email.includes("@")}
            className="w-full py-3 bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        <p className="text-xs text-ink-faint text-center mt-6">
          No account? One will be created automatically.
        </p>
        <div className="text-center mt-4">
          <Link href="/" className="text-sm text-ink-muted hover:text-ink transition">
            ← Back to shop
          </Link>
        </div>
      </div>
    </main>
  );
}

async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf");
  const data = await res.json();
  return data.csrfToken;
}
