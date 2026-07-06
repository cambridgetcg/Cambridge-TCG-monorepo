// Branded auth-error page (pages.error → /login/error).
//
// Auth.js's default error page ends a failed magic-link flow off-brand,
// and worse, its "Sign in" button href is malformed
// (/api/auth/error?error=Verification/signin) and dead-ends on a bare
// "Error Error" screen — the exact trap the walker hit when a link
// expired. This page names the cause in plain language and always offers a
// working "request a new link".

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign-in link problem — Cambridge TCG",
};

// Auth.js passes ?error=<Code>. We translate the codes a magic-link flow
// can actually produce; everything else falls to a calm default.
const MESSAGES: Record<string, { title: string; body: string }> = {
  Verification: {
    title: "That sign-in link has expired",
    body: "Magic links last 24 hours and can be used once. This one has already been used or has timed out — request a fresh one and we'll get you in.",
  },
  Configuration: {
    title: "Sign-in is temporarily unavailable",
    body: "Something on our side isn't set up right for sign-in. This is not your account — please try again shortly, or request a new link.",
  },
  AccessDenied: {
    title: "That link couldn't sign you in",
    body: "The link didn't grant access — it may have been for a different account or already used. Request a fresh link to continue.",
  },
  Default: {
    title: "That sign-in link didn't work",
    body: "The link may have expired or already been used. Request a fresh one and we'll get you in.",
  },
};

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { title, body } = MESSAGES[error ?? "Default"] ?? MESSAGES.Default;

  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <h1 className="text-2xl font-display font-semibold text-ink mb-3">{title}</h1>
        <p className="text-ink-muted mb-6">{body}</p>
        <Link
          href="/login"
          className="inline-block w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
        >
          Request a new link
        </Link>
        <p className="text-xs text-ink-faint mt-6">
          Still stuck?{" "}
          <Link href="/contact" className="text-accent hover:underline">
            Contact us
          </Link>{" "}
          and we&apos;ll sort it out.
        </p>
      </div>
    </main>
  );
}
