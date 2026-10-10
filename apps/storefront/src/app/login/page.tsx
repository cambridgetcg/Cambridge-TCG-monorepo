"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InkRule } from "@/lib/ui/InkRule";
import { isSupportId } from "@/lib/verification/events";

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

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.09-1.15 3.09-1.15.62 1.55.23 2.7.12 2.98.72.79 1.15 1.79 1.15 3.02 0 4.32-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
    </svg>
  );
}

const OAUTH_PROVIDERS = [
  { id: "google", name: "Google", Mark: GoogleG },
  { id: "github", name: "GitHub", Mark: GitHubMark },
] as const;

// ?return= arrives from the account layout / proxy when an
// unauthenticated visitor hits a gated page. Only a same-origin relative
// path may ride the flow as callbackUrl — anything else (protocol-
// relative "//", backslash tricks, absolute URLs, a loop back into
// /login) falls back to /account.
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\x00-\x20\x7f]/.test(raw)) return null;
  // Check the normalized pathname too: fragments and dot segments must not
  // turn a seemingly safe destination into a loop back through sign-in.
  const pathname = new URL(raw, "http://localhost").pathname;
  if (pathname === "/login" || pathname.startsWith("/login/")) return null;
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

// Admission and token-cap decisions intentionally use the same successful
// Auth.js response as a delivered link. Only failures unrelated to account
// eligibility are safe to expose here.
async function messageFor(res: Response): Promise<string | null> {
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
  const supportId = isSupportId(params.get("support")) ? params.get("support") : null;

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Discover configured providers, never credentials. OAuth uses a full-page
  // CSRF-protected POST so the browser follows the cross-origin redirect.
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const oauthProviders = OAUTH_PROVIDERS.filter(({ id }) => enabledProviders.includes(id));
  const [csrf, setCsrf] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/auth/providers").then((r) => r.json()).catch(() => ({})),
      fetch("/api/auth/csrf").then((r) => r.json()).catch(() => ({})),
    ]).then(([providers, csrfData]) => {
      if (!live) return;
      setEnabledProviders(OAUTH_PROVIDERS
        .filter(({ id }) => providers && (providers as Record<string, unknown>)[id])
        .map(({ id }) => id));
      setCsrf(typeof csrfData?.csrfToken === "string" ? csrfData.csrfToken : "");
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
            If an eligible existing account exists for{" "}
            <span className="text-ink font-medium">{email}</span>, a sign-in
            link will arrive.
          </p>
          {returnTo && (
            <p className="text-sm text-ink-muted mb-6">
              Signing in will take you back to{" "}
              <span className="text-ink font-medium">{returnTo}</span>.
            </p>
          )}
          <p className="text-sm text-ink-faint">
            It may take a minute. Check your spam folder too.
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
          {oauthProviders.length > 0 ? "Choose a sign-in method, or request an email sign-in link" : "Request an email sign-in link"}
        </p>

        {params.get("error") && (
          <p role="alert" className="text-sm text-danger text-center mb-6">
            We couldn&apos;t complete sign-in. Try again, or use another sign-in
            method. If using a connected provider, check that your email is verified.
            If you meant to use a different account, sign out first.
          </p>
        )}
        {supportId && (
          <p className="text-xs text-ink-faint text-center mb-6">
            Support reference: <span className="font-mono">{supportId}</span>
          </p>
        )}

        {oauthProviders.length > 0 && (
          <>
            <div role="group" aria-label="Connected sign-in providers" className="space-y-3">
              {oauthProviders.map(({ id, name, Mark }) => (
                <form key={id} method="POST" action={`/api/auth/signin/${id}`}>
                  <input type="hidden" name="csrfToken" value={csrf} />
                  <input type="hidden" name="callbackUrl" value={returnTo ?? "/account"} />
                  <button
                    type="submit"
                    disabled={!csrf}
                    className="w-full py-3 bg-surface border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition disabled:opacity-50 flex items-center justify-center gap-2.5"
                  >
                    <Mark />
                    Continue with {name}
                  </button>
                </form>
              ))}
            </div>
            {enabledProviders.includes("github") && (
              <p className="text-xs text-ink-faint text-center mt-4">
                GitHub sign-in requires a verified email. If it matches your existing
                CTCG account email, we link GitHub to that account. Once linked,
                GitHub continues to use the same CTCG account.
              </p>
            )}
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
            {loading ? "Checking..." : "Continue with Email"}
          </button>
        </form>

        <p className="text-xs text-ink-faint text-center mt-6">
          Email sign-in requests always receive the same confirmation. New
          registration may be paused while the adult-account and terms
          boundary is reviewed.
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
