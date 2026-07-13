"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InkRule } from "@/lib/ui/InkRule";

// ?return= arrives from the account layout / proxy when an
// unauthenticated visitor hits a gated page. Only a same-origin relative
// path may ride the flow as callbackUrl — anything else (protocol-
// relative "//", backslash tricks, absolute URLs, a loop back into
// /login) falls back to /account.
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw === "/login" || raw.startsWith("/login/") || raw.startsWith("/login?")) return null;
  return raw;
}

// Mirrors @auth/core's email normalizer (no quotes, exactly one "@",
// non-empty local + domain). Server-side that failure collapses into a
// generic error redirect, so catching it here is the only way to tell
// the user "the address is malformed" rather than "sending failed".
function isValidEmail(email: string): boolean {
  if (email.includes('"')) return false;
  const parts = email.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

// The signin POST answers with a redirect chain; the error code (if any)
// is a query param on the final URL fetch() landed on.
function errorCodeFrom(res: Response): string | null {
  try {
    return new URL(res.url).searchParams.get("error");
  } catch {
    return null;
  }
}

// Honest mapping of what the auth API actually exposes. New issuance stops at
// five unexpired tokens per email address or 500 across the service; hosting
// protection may add broader limits in front of it.
async function messageFor(res: Response): Promise<string | null> {
  if (res.status === 429) {
    try {
      const body = await res.clone().json() as { code?: unknown };
      if (body.code === "magic_link_global_limit") {
        return "Sign-in email is temporarily at its service-wide safety limit. Use a recent link or wait before requesting another.";
      }
      if (body.code === "magic_link_email_limit") {
        return "This address has reached its active sign-in email limit. Use a recent link if one arrived, or wait before requesting another.";
      }
    } catch {
      // Hosting-level 429 responses are not required to carry our JSON shape.
    }
    return "This address has reached its active sign-in email limit. Use a recent link if one arrived, or wait before requesting another.";
  }
  const code = errorCodeFrom(res);
  if (code === "Configuration") {
    // Send failures surface as this code — the failure is ours, not theirs.
    return "We couldn't send the email — a problem on our side. Please try again in a minute.";
  }
  if (code === "MissingCSRF") {
    return "The sign-in form expired. Please try again.";
  }
  if (code === "AccessDenied") {
    return "Sign-in was declined for this email address.";
  }
  if (code) {
    return `Sign-in failed (${code}). Please try again.`;
  }
  if (!res.ok) {
    return `Something went wrong (HTTP ${res.status}). Please try again.`;
  }
  return null;
}

function LoginInner() {
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get("return"));

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setError("That doesn't look like a valid email address — check for typos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: trimmed,
          csrfToken: await getCsrfToken(),
          callbackUrl: returnTo ?? "/account",
        }),
      });

      const failure = await messageFor(res);
      if (failure) {
        setError(failure);
      } else {
        setSent(true);
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
          <h1 className="text-2xl font-display font-semibold text-ink mb-3">Check your email</h1>
          <p className="text-ink-muted mb-6">
            We sent a sign-in link to <span className="text-ink font-medium">{email}</span>
          </p>
          {returnTo && (
            <p className="text-sm text-ink-muted mb-6">
              Signing in will take you back to{" "}
              <span className="text-ink font-medium">{returnTo}</span>.
            </p>
          )}
          <p className="text-sm text-ink-faint">
            Check your spam folder if you don&apos;t see it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <h1 className="text-2xl font-display font-semibold text-ink text-center mb-2">Sign In</h1>
        <InkRule className="mb-4 max-w-[8rem] mx-auto" />
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
            className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent mb-4"
          />
          {error && <p className="text-sm text-danger mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email.includes("@")}
            className="w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf");
  const data = await res.json();
  return data.csrfToken;
}
