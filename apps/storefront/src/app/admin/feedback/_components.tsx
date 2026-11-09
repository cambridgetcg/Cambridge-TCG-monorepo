"use client";

import { useState, useTransition } from "react";
import { answerFeedback, deleteFeedback, markFeedback } from "./_actions";

/** Answer, mark or delete one message. The answer is what the holder reads
 * with their key, so it is written for them. */
export function FeedbackActions({ id, status, answer }: { id: string; status: string; answer: string }) {
  const [text, setText] = useState(answer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (call: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await call();
      setError(result.ok ? null : result.error ?? "That did not work.");
    });

  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-500" htmlFor={`answer-${id}`}>Answer (the holder reads this with their key)</label>
      <textarea
        id={`answer-${id}`}
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={pending || !text.trim()} onClick={() => act(() => answerFeedback({ id, answer: text }))} className="min-h-11 px-3 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50">
          Save answer
        </button>
        {status === "received" && (
          <button type="button" disabled={pending} onClick={() => act(() => markFeedback({ id, status: "read" }))} className="min-h-11 px-3 rounded-md border border-neutral-700 text-neutral-200 disabled:opacity-50">
            Mark read
          </button>
        )}
        {status !== "closed" && (
          <button type="button" disabled={pending} onClick={() => act(() => markFeedback({ id, status: "closed" }))} className="min-h-11 px-3 rounded-md border border-neutral-700 text-neutral-200 disabled:opacity-50">
            Close
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (window.confirm(`Delete ${id} now? The holder's key will open nothing.`)) act(() => deleteFeedback({ id })); }}
          className="min-h-11 px-3 rounded-md border border-red-900 text-red-300 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
