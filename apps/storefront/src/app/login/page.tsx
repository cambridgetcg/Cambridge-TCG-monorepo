"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InkRule } from "@/lib/ui/InkRule";

/** Official Google "G" — the one saturated mark allowed here, because a
 *  sign-in button people trust must look like the one they know. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

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

  // Google appears only when the provider is actually configured (its creds
  // are set). /api/auth/providers lists live providers; the CSRF token rides
  // in the OAuth form as a hidden field (a full-page POST, not fetch — the
  // browser must follow the cross-origin redirect to Google).
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [csrf, setCsrf] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/auth/providers").then((r) => r.json()).catch(() => ({})),
      fetch("/api/auth/csrf").then((r) => r.json()).catch(() => ({})),
    ]).then(([providers, csrfData]) => {
      if (!live) return;
      setGoogleEnabled(Boolean(providers && (providers as Record<string, unknown>).google));
      setCsrf((csrfData as { csrfToken?: string }).csrfToken ?? "");
    });
    return () => { live = false; };
  }, []);

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
          {googleEnabled ? "Continue with Google, or use a magic link" : "Enter your email to receive a magic link"}
        </p>

        {googleEnabled && (
          <>
            {/* Full-page POST (not fetch): the browser must follow the redirect
                chain out to Google. next-auth mints the callback + links the
                account on return. */}
            <form method="POST" action="/api/auth/signin/google">
              <input type="hidden" name="csrfToken" value={csrf} />
              <input type="hidden" name="callbackUrl" value={returnTo ?? "/account"} />
              <button
                type="submit"
                disabled={!csrf}
                className="w-full py-3 bg-surface border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition disabled:opacity-50 flex items-center justify-center gap-2.5"
              >
                <GoogleG />
                Continue with Google
              </button>
            </form>
            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-border-subtle" />
              <span className="text-xs uppercase tracking-wider text-ink-faint">or</span>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>
          </>
        )}

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
