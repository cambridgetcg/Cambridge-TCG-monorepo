"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { answerFeedback, deleteFeedback, markFeedback } from "./_actions";

const Say = createContext<(words: string) => void>(() => {});

/** Says what the last action did, above the messages and kept on the screen:
 * a message that was answered or closed moves down the list, or off it. */
export function Said({ children }: { children: ReactNode }) {
  const [words, say] = useState("");
  return (
    <Say value={say}>
      <div role="status" className="sticky top-16 z-10 mb-0">
        {words && <p className="mb-6 rounded-md border border-neutral-500 bg-neutral-900 px-3 py-2 text-sm text-neutral-100">{words}</p>}
      </div>
      {children}
    </Say>
  );
}

/** Answer, mark or delete one message. The answer is what the holder reads
 * with their key, so it is written for them. Saving it sends nothing. A button
 * that does not apply keeps its place, so that a second click meets no other.
 * The focus ring takes the accent colour, which a theme can draw too dark for
 * this ground. */
export function FeedbackActions({ id, status, answer }: { id: string; status: string; answer: string }) {
  const [text, setText] = useState(answer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const say = useContext(Say);

  const act = (call: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const result = await call();
      setError(result.ok ? null : result.error ?? "That did not work.");
      say(result.ok ? done : "");
    });

  return (
    <div role="group" aria-label={id} className="space-y-2 [--color-accent:var(--color-neutral-200)]">
      <label className="block text-xs text-neutral-400" htmlFor={`answer-${id}`}>Answer (shown to whoever holds this message&apos;s key)</label>
      <textarea
        id={`answer-${id}`}
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={`saving-${id}`}
        className="w-full rounded-md border border-neutral-500 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
      />
      <p id={`saving-${id}`} className="text-xs text-neutral-300">Saving sends nothing, to anyone. The sender sees the answer only by coming back with their key.</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={pending || !text.trim()} onClick={() => act(() => answerFeedback({ id, answer: text }), `Saved the answer to ${id}.`)} className="min-h-11 px-3 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50">
          Save answer
        </button>
        <button type="button" disabled={pending || status !== "received"} onClick={() => act(() => markFeedback({ id, status: "read" }), `Marked ${id} read.`)} className="min-h-11 px-3 rounded-md border border-neutral-500 text-neutral-200 disabled:opacity-50">
          Mark read
        </button>
        <button type="button" disabled={pending || status === "closed"} onClick={() => act(() => markFeedback({ id, status: "closed" }), `Closed ${id}.`)} className="min-h-11 px-3 rounded-md border border-neutral-500 text-neutral-200 disabled:opacity-50">
          Close
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (window.confirm(`Delete ${id} now? The holder's key will open nothing.`)) act(() => deleteFeedback({ id }), `Deleted ${id}.`); }}
          className="min-h-11 px-3 rounded-md border border-red-700 text-red-300 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
