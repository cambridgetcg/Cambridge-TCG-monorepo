import Link from "next/link";
import { WelcomeAll } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-black text-amber-400 mb-2">404</p>
        <h1 className="text-2xl font-bold text-white mb-3">Page not found</h1>
        <p className="text-sm text-neutral-400 mb-6">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="flex gap-3 justify-center mb-6">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
          >
            Home
          </Link>
          <Link
            href="/market"
            className="px-4 py-2 text-sm font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 rounded-lg hover:border-neutral-700 transition"
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
