// Scanner-proof magic-link interstitial — now server-rendered.
//
// Email security scanners (Google Workspace link prefetch, Outlook
// SafeLinks) GET every link in an email — and a magic link is single-use,
// so the scanner's GET consumed the token and the human's real click got
// "link no longer valid". This page absorbs the scanner: the email links
// HERE (a harmless GET that consumes nothing), and only a deliberate
// human action proceeds to the real next-auth callback.
//
// Why a <form> and not an <a>: a bare link would let a scanner's GET reach
// the callback and burn the token — the very thing this page exists to
// prevent. A form submit is a deliberate action a scanner does not perform,
// AND it works with zero JavaScript. That fixes the walker finding that the
// old client-only page rendered no visible content in SSR: a no-JS reader
// (or a JS-failed click on the emailed link) now sees a real "Complete sign
// in" button that works.
//
// The `u` param carries the full callback URL. We validate it is
// same-origin and points at the email callback path — never a free
// redirect. The post-sign-in destination (callbackUrl, e.g. a ?return=
// path from /login) rides *inside* `u` as one of the callback URL's own
// query params, preserved here across the hop.

import Link from "next/link";
import { headers } from "next/headers";

/** Parse + validate `u` server-side. Returns the callback path and the
 *  query params to replay as hidden form inputs, or null when the link is
 *  incomplete / off-origin / not a callback URL. */
async function parseCallback(
  raw: string | null,
): Promise<{ action: string; params: [string, string][] } | null> {
  if (!raw) return null;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : "http://localhost";
  try {
    const url = new URL(raw, base);
    // Same-origin: the parsed host must match the request host (a relative
    // `u` inherits it; an absolute off-origin `u` is rejected).
    if (host && url.host !== host) return null;
    if (!url.pathname.startsWith("/api/auth/callback/email")) return null;
    return { action: url.pathname, params: [...url.searchParams.entries()] };
  } catch {
    return null;
  }
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  const callback = await parseCallback(u ?? null);

  if (!callback) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <div className="max-w-sm px-4 text-center">
          <h1 className="text-2xl font-display font-semibold text-ink mb-3">This link looks incomplete</h1>
          <p className="text-ink-muted mb-6">
            Request a fresh sign-in link and we&apos;ll get you in.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <h1 className="text-2xl font-display font-semibold text-ink mb-3">
          Almost there
        </h1>
        <p className="text-ink-muted mb-6">
          Tap the button to finish signing in to Cambridge TCG.
        </p>
        {/* GET so the single-use callback behaves exactly as a link click,
            but only on a real submit — no JS required, and a scanner's
            passive GET of this page never fires it. */}
        <form method="GET" action={callback.action}>
          {callback.params.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button
            type="submit"
            className="w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            Complete sign in
          </button>
        </form>
        <p className="text-xs text-ink-faint mt-6">
          This extra tap protects your link from email scanners that would
          otherwise use it up before you could.
        </p>
      </div>
    </main>
  );
}
