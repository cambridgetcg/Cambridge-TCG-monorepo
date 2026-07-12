import Link from "next/link";

export const metadata = {
  title: "OG status - Cambridge TCG",
  description: "Current status of Cambridge TCG OG membership claims.",
};

export default function OGClaimPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-sm font-semibold text-accent mb-3">OG membership</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold text-ink mb-5">
          New claims are paused
        </h1>
        <div className="space-y-4 text-ink-muted leading-relaxed">
          <p>
            The old form accepted an email, an order reference, or a marketplace
            username without proving that the person submitting it owned the
            account or purchase. We have closed that form while we build a
            signed-in ownership check.
          </p>
          <p>
            A visit to this page now sends and stores no claim details. Existing
            claims remain available only to authorised staff for review. You can
            ask us to correct or delete an old claim through the contact page.
          </p>
          <p>
            Existing OG membership remains in place. This pause only affects new
            self-submitted claims.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/contact" className="text-accent underline">
            Contact Cambridge TCG
          </Link>
          <Link href="/login" className="text-accent underline">
            Sign in
          </Link>
          <Link href="/" className="text-ink-muted underline">
            Back to shop
          </Link>
        </div>
      </div>
    </main>
  );
}
