"use client";

// The Daily Run — higher or lower on real card prices, ~30 seconds,
// no account needed. One provably-shuffled deck per UTC day, the same
// for everyone. See src/lib/daily-run/README.md for the whole rules
// and the honest admissions.

import Link from "next/link";
import { useEffect, useState } from "react";

interface RunCard {
  sku: string;
  name: string;
  image_url: string | null;
  set_code: string | null;
  card_number: string | null;
  price_pence?: number;
}

interface StartData {
  date: string;
  deck_size: number;
  max_run: number;
  rule: string;
  card: RunCard;
  cursor: string;
  yesterday: { run_date: string; draw_id: string } | null;
}

interface GuessData {
  correct: boolean;
  revealed: RunCard;
  run_length: number;
  done: boolean;
  cursor: string | null;
  claimed: { finalAmount?: number; baseAmount?: number } | null;
}

const BEST_KEY = "cambridgetcg_daily_run_best";

function pounds(pence?: number): string {
  return pence == null ? "?" : `£${(pence / 100).toFixed(2)}`;
}

export default function DailyRunPage() {
  const [start, setStart] = useState<StartData | null>(null);
  const [current, setCurrent] = useState<RunCard | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [met, setMet] = useState<RunCard[]>([]);
  const [done, setDone] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [claimed, setClaimed] = useState<GuessData["claimed"]>(null);
  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [best, setBest] = useState(0);

  useEffect(() => {
    try {
      setBest(parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0);
    } catch {}
    fetch("/api/rewards/daily-run")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.data?.card) throw new Error();
        setStart(j.data);
        setCurrent(j.data.card);
        setCursor(j.data.cursor);
        setMet([j.data.card]);
      })
      .catch(() => setError("Today's deck couldn't be dealt just now. Come back in a moment — it keeps."));
  }, []);

  async function guess(g: "higher" | "lower") {
    if (!cursor || busy || done) return;
    setBusy(true);
    setFlipping(true);
    try {
      const r = await fetch("/api/rewards/daily-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor, guess: g }),
      });
      const j = await r.json();
      if (!r.ok || !j?.data) throw new Error(j?.error?.message);
      const d: GuessData = j.data;
      setLastCorrect(d.correct);
      setCurrent(d.revealed);
      setMet((m) => [...m, d.revealed]);
      setRun(d.run_length);
      setCursor(d.cursor);
      if (d.done) {
        setDone(true);
        setClaimed(d.claimed);
        if (d.run_length > best) {
          setBest(d.run_length);
          try {
            localStorage.setItem(BEST_KEY, String(d.run_length));
          } catch {}
        }
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That guess didn't land; refresh to start over. Your day isn't spent.");
    } finally {
      setBusy(false);
      setTimeout(() => setFlipping(false), 350);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            The Daily <span className="text-amber-400">Run</span>
          </h1>
          <p className="text-neutral-400 mt-2 leading-relaxed">
            One deck of {start?.deck_size ?? 20} real cards, the same for everyone, shuffled
            fresh at midnight UTC. Is the next card worth more or less?
          </p>
        </div>

        {error && (
          <div className="border border-neutral-800 rounded-lg p-6 text-center text-neutral-400">{error}</div>
        )}

        {!error && !start && (
          <div className="border border-neutral-800 rounded-lg p-10 text-center text-neutral-500">Dealing today's deck…</div>
        )}

        {start && current && (
          <>
            {/* Run counter */}
            <div className="flex justify-center gap-6 mb-6 text-sm text-neutral-400">
              <span>
                run: <span className="text-white font-bold">{run}</span>
              </span>
              <span>
                card {met.length} of {start.deck_size}
              </span>
              {best > 0 && (
                <span>
                  your best: <span className="text-amber-400 font-bold">{best}</span>
                </span>
              )}
            </div>

            {/* The face-up card */}
            <div
              className={`border border-neutral-800 rounded-xl bg-neutral-900/40 p-6 text-center transition-all duration-300 ${
                flipping ? "scale-95 opacity-40" : "scale-100 opacity-100"
              }`}
            >
              {current.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.image_url}
                  alt={current.name}
                  className="mx-auto h-64 object-contain rounded-md mb-4"
                />
              )}
              <h2 className="text-lg font-bold text-white">{current.name}</h2>
              <p className="text-neutral-500 text-sm mt-1">
                {[current.set_code, current.card_number].filter(Boolean).join(" · ")}
              </p>
              <p className="text-2xl font-black text-amber-400 mt-3">{pounds(current.price_pence)}</p>
              {lastCorrect !== null && (
                <p className={`mt-2 text-sm font-semibold ${lastCorrect ? "text-emerald-400" : "text-neutral-400"}`}>
                  {lastCorrect ? "right — the run goes on" : "not this time — the run ends here"}
                </p>
              )}
            </div>

            {/* The two big buttons */}
            {!done && (
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button
                  onClick={() => guess("higher")}
                  disabled={busy}
                  className="py-4 rounded-xl bg-amber-400 text-neutral-950 font-black text-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
                >
                  Next is worth more
                </button>
                <button
                  onClick={() => guess("lower")}
                  disabled={busy}
                  className="py-4 rounded-xl bg-neutral-800 text-white font-black text-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  Next is worth less
                </button>
              </div>
            )}
            <p className="text-center text-xs text-neutral-600 mt-3">
              Ties count in your favour. A perfect run is {start.max_run}.
            </p>

            {/* End of run — recap */}
            {done && (
              <div className="mt-8">
                <div className="text-center mb-6">
                  <p className="text-xl font-bold text-white">
                    Your run: <span className="text-amber-400">{run}</span>
                    {run >= best && run > 0 && <span className="text-neutral-400 font-normal"> — a new best for this device</span>}
                  </p>
                  {claimed?.finalAmount != null && (
                    <p className="text-emerald-400 text-sm mt-2">
                      {claimed.finalAmount} Berries banked for finishing today's run.
                    </p>
                  )}
                  <p className="text-neutral-500 text-sm mt-2">Tomorrow there is a new deck. Nothing expires tonight.</p>
                </div>
                <h3 className="text-sm font-semibold text-neutral-400 mb-3">Cards you met today</h3>
                <ul className="space-y-2">
                  {met.map((c) => (
                    <li key={c.sku} className="flex justify-between items-center border border-neutral-800 rounded-lg px-4 py-2 text-sm">
                      <Link href={`/cards/${c.sku}/market`} className="text-neutral-300 hover:text-amber-400">
                        {c.name}
                      </Link>
                      <span className="text-neutral-500">{pounds(c.price_pence)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Honest footer */}
            <div className="mt-10 pt-6 border-t border-neutral-800 text-xs text-neutral-500 leading-relaxed">
              <p>{start.rule}</p>
              <p className="mt-2">
                {start.yesterday ? (
                  <>
                    Yesterday's shuffle is public:{" "}
                    <Link href={`/verify/draw/${start.yesterday.draw_id}`} className="underline underline-offset-2 hover:text-amber-400">
                      check the math yourself
                    </Link>
                    . Today's seed is sealed until midnight UTC.
                  </>
                ) : (
                  <>Today's seed is sealed until midnight UTC; after that, the shuffle is public and checkable.</>
                )}{" "}
                <Link href="/methodology/oracle-policies" className="underline underline-offset-2 hover:text-amber-400">
                  How our provably fair draws work
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
