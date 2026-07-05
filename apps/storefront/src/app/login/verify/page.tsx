"use client";

// Scanner-proof magic-link interstitial.
//
// Email security scanners (Google Workspace link prefetch, Outlook
// SafeLinks) GET every link in an email — and a magic link is single-use,
// so the scanner's GET consumed the token and the human's real click got
// "link no longer valid". This page absorbs the scanner: the email now
// links HERE (a harmless GET that consumes nothing), and only the human's
// button tap proceeds to the real next-auth callback.
//
// The `u` param carries the full callback URL. We validate it is
// same-origin and points at the email callback path — never a free
// redirect. The post-sign-in destination (callbackUrl, e.g. a ?return=
// path from /login) rides *inside* `u` as one of the callback URL's own
// query params, so passing `u` through untouched preserves it across
// this hop — including in a different browser than the one that
// requested the link, where no callback-url cookie exists.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!url.pathname.startsWith("/api/auth/callback/email")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function VerifyInner() {
  const params = useSearchParams();
  const [continuing, setContinuing] = useState(false);
  // Validation needs window.location.origin, so it runs after mount.
  // Evaluating during SSR (where it could only ever say "invalid")
  // hydration-mismatched against the client on every valid link;
  // `undefined` = not yet evaluated, render nothing until then.
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setTarget(safeCallbackUrl(params.get("u")));
  }, [params]);

  if (target === undefined) return null;

  if (!target) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="max-w-sm px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-3">This link looks incomplete</h1>
          <p className="text-neutral-400 mb-6">
            Request a fresh sign-in link and we&apos;ll get you in.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-3">
          Almost there
        </h1>
        <p className="text-neutral-400 mb-6">
          Tap the button to finish signing in to Cambridge TCG.
        </p>
        <button
          onClick={() => {
            setContinuing(true);
            window.location.href = target;
          }}
          disabled={continuing}
          className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
        >
          {continuing ? "Signing you in…" : "Complete sign in"}
        </button>
        <p className="text-xs text-neutral-500 mt-6">
          This extra tap protects your link from email scanners that would
          otherwise use it up before you could.
        </p>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
