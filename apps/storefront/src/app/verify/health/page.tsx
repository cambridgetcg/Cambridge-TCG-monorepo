"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
import { DigestOneNote } from "../digest-one-note";
import { HealthBody, readHealth, type HealthResponse } from "./health-view";

export default function HealthPage() {
  // The answer and when it arrived, so the tip's age is computed once, not
  // on every render.
  const [loaded, setLoaded] = useState<{ data: HealthResponse; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readHealth().then((data) => (data ? setLoaded({ data, at: Date.now() }) : setFailed(true)));
  }, []);

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/verify" className="text-xs text-ink-faint hover:text-ink">← Verification home</Link>
        <h1 className="text-3xl font-bold mt-2 mb-2">Transparency Health</h1>
        <p className="text-sm text-ink-muted mb-10">
          The system&apos;s own view of itself. Digest publish cadence, self-audit pass rate,
          open drift alerts, and chain tip — all aggregate, all public, no auth.
        </p>

        {/* Static, so it is in the first paint and explains the figures below. */}
        <DigestOneNote />

        <HealthBody loaded={loaded} failed={failed} />

        <div className="mt-12 text-xs text-ink-faint border-t border-border-subtle pt-6">
          Raw feeds:{" "}
          <Link href="/api/verify/digests" className="text-accent hover:text-accent-strong underline">
            /api/verify/digests
          </Link>
          {" · "}
          <Link href="/api/verify/chain" className="text-accent hover:text-accent-strong underline">
            /api/verify/chain
          </Link>
          {" · "}
          <Link href="/api/verify/health" className="text-accent hover:text-accent-strong underline">
            /api/verify/health
          </Link>
        </div>
      </div>
    </main>
  );
}
