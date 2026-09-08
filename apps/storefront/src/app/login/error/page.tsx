// Branded auth-error page (pages.error → /login/error).
// OAuth failures are not expired email links. Auth.js also sends SignInError
// subclasses to /login?error=...; that page carries its own generic guidance.

import Link from "next/link";
import type { Metadata } from "next";
import { isSupportId } from "@/lib/verification/events";

export const metadata: Metadata = {
  title: "Sign-in problem — Cambridge TCG",
};

const OAUTH_FAILURE = {
  title: "We couldn't complete sign-in",
  body: "Try again, or use another sign-in method. If using a connected provider, check that your email is verified. If you meant to use a different account, sign out first. If the problem continues, contact us.",
};

// Public codes from locked Auth.js. Profile/check failures can be reduced to
// Configuration; never expose their upstream message or infer account existence.
const MESSAGES: Record<string, { title: string; body: string; action?: string }> = {
  Verification: {
    title: "That sign-in link has expired",
    body: "Magic links last 24 hours and can be used once. This one has already been used or has timed out — request a fresh one and we'll get you in.",
    action: "Request a new link",
  },
  Configuration: {
    title: "Sign-in is temporarily unavailable",
    body: "We couldn't complete sign-in. Please try again shortly, use another sign-in method, or contact us if the problem continues.",
  },
  AccessDenied: OAUTH_FAILURE,
  OAuthCallbackError: OAUTH_FAILURE,
  OAuthAccountNotLinked: OAUTH_FAILURE,
  AccountNotLinked: OAUTH_FAILURE,
  MissingCSRF: {
    title: "Please restart sign-in",
    body: "We couldn't verify this sign-in request. Return to sign in and try again with a fresh form.",
  },
  RegistrationPaused: {
    title: "New registration is paused",
    body: "Cambridge TCG is currently limiting sign-in to existing account holders while the adult-account and terms boundary is reviewed. If you already have an account under another email, use that address to sign in.",
    action: "Back to sign in",
  },
  Default: OAUTH_FAILURE,
};

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; support?: string }>;
}) {
  const { error, support } = await searchParams;
  const supportId = isSupportId(support) ? support : null;
  const { title, body, action } = error && Object.hasOwn(MESSAGES, error)
    ? MESSAGES[error]
    : MESSAGES.Default;

  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <h1 className="text-2xl font-display font-semibold text-ink mb-3">{title}</h1>
        <p className="text-ink-muted mb-6">{body}</p>
        {supportId && (
          <p className="text-xs text-ink-faint mb-6">
            Support reference: <span className="font-mono">{supportId}</span>
          </p>
        )}
        <Link
          href="/login"
          className="inline-block w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
        >
          {action ?? "Back to sign in"}
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
