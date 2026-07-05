import Link from "next/link";
import { WelcomeAll } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-3xl font-display font-semibold text-accent mb-2">404</p>
        <h1 className="text-2xl font-display font-semibold text-ink mb-3">Page not found</h1>
        <p className="text-sm text-ink-muted mb-6">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="flex gap-3 justify-center mb-6">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-semibold bg-ink text-page rounded-lg hover:opacity-90 transition"
          >
            Home
          </Link>
          <Link
            href="/market"
            className="px-4 py-2 text-sm font-medium text-ink-muted border border-border-subtle rounded-lg hover:bg-surface-subtle transition"
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
