"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// One-time welcome that names the auto-generated collector handle.
//
// Walkers all reported the same thing: a new seller's public handle
// (@mint_ooze_6527) first appears attributed to their listing on a card
// page — they discover their own name by accident. This note surfaces it
// on the first visit to the account overview, keyed in localStorage so it
// shows once per handle and then steps out of the way. Persistent
// disclosure still lives on the overview itself ("Trading as @handle");
// this is only the first-run greeting.
export default function HandleWelcomeNote({ handle }: { handle: string }) {
  const [show, setShow] = useState(false);
  const key = `account.handle-welcome.v1:${handle}`;

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setShow(true);
    } catch {
      // Private mode / storage disabled — just don't show the one-time note.
    }
  }, [key]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-wash p-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          Welcome. You&rsquo;re trading as{" "}
          <span className="font-semibold text-ink">@{handle}</span> — this is the
          public name collectors see on your listings, offers, and reviews.
        </p>
        <p className="text-xs text-ink-muted mt-1">
          It was picked for you at sign-in. You can change it any time in{" "}
          <Link href="/account/profile" className="text-accent underline underline-offset-2">
            Profile &amp; settings
          </Link>
          .
        </p>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-xs font-medium text-ink-muted hover:text-ink transition"
        aria-label="Dismiss welcome note"
      >
        Got it
      </button>
    </div>
  );
}
