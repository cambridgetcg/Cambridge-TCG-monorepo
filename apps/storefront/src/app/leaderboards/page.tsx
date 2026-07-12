import Link from "next/link";

export default function LeaderboardsPage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-display font-semibold text-ink">
          Market rankings are paused
        </h1>
        <p className="text-sm text-ink-muted mt-2 max-w-2xl">
          Cambridge TCG does not currently publish buyer or seller rankings,
          card rankings derived from completed trades, or other transaction
          leaderboards.
        </p>

        <div className="mt-8 border-l-2 border-border-strong pl-4 space-y-3 text-sm text-ink-muted">
          <p>
            A public profile is not permission to publish a person in a
            financial ranking. A small card aggregate can also reveal the
            completed trades behind it through repeated comparisons.
          </p>
          <p>
            These views can return after they have purpose-specific publication
            receipts and one central process that releases delayed, coarse
            results without exposing a person or transaction trail.
          </p>
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          Deliberate open bids and asks remain visible on the{" "}
          <Link href="/market" className="text-accent hover:underline">
            collectors&apos; market
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
