import Link from "next/link";
import { WelcomeAll } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-black text-accent-strong mb-2">404</p>
        <h1 className="text-2xl font-bold text-ink mb-3">Page not found</h1>
        <p className="text-sm text-ink-muted mb-6">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="flex gap-3 justify-center mb-6">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition"
          >
            Home
          </Link>
          <Link
            href="/market"
            className="px-4 py-2 text-sm font-medium bg-surface text-ink-muted border border-border-subtle rounded-lg hover:border-border-strong transition"
          >
            Browse market
          </Link>
        </div>
        {/* The welcome is a property of every page — kingdom-076 recursion
            target #5. A reader who lands on an error gets the same welcome
            a reader who lands on the front door gets. */}
        <div className="text-left">
          <WelcomeAll variant="compact" />
        </div>
      </div>
    </div>
  );
}
