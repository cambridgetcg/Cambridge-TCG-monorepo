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

        {/* Card-number quick-find — a lost visitor who mistyped a card URL
            (the site's own copy teaches numbers like OP01-001) can jump
            straight to it. Native GET form: works with JS disabled. */}
        <form method="get" action="/market" className="flex gap-2 mb-4">
          <input
            type="search"
            name="q"
            placeholder="Card number, name, or SKU — e.g. OP01-001"
            aria-label="Find a card"
            className="flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition"
          />
          <button
            type="submit"
            className="px-4 py-2.5 text-sm font-semibold bg-accent text-page rounded-lg hover:bg-accent-strong transition"
          >
            Find
          </button>
        </form>

        {/* Near-miss aliases — /marketplace is one character-class from
            /market; name the doors a lost visitor probably meant. */}
        <p className="text-xs text-ink-faint mb-6">
          Did you mean{" "}
          <Link href="/market" className="text-accent hover:underline">the market</Link>,{" "}
          <Link href="/prices/search" className="text-accent hover:underline">price search</Link>, or{" "}
          <Link href="/find" className="text-accent hover:underline">find a card</Link>?
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
