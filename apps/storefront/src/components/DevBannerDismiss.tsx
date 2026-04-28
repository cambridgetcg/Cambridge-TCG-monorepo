"use client";

import { BANNER_COOKIE } from "./DevBanner";

/**
 * Client-side dismiss button for the DevBanner.
 * Sets a session cookie so the banner doesn't re-appear within the same browser session,
 * and immediately removes the banner element from the DOM.
 */
export default function DevBannerDismiss() {
  function dismiss() {
    // Session cookie (no max-age / expires) — gone when browser closes
    document.cookie = `${BANNER_COOKIE}=hidden; path=/; SameSite=Lax`;
    document.getElementById("dev-banner")?.remove();
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss site notice"
      className="flex-shrink-0 rounded p-0.5 text-amber-800 transition-colors hover:bg-amber-500 hover:text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-800"
    >
      {/* X icon — inline SVG, no dependency */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
      </svg>
    </button>
  );
}
