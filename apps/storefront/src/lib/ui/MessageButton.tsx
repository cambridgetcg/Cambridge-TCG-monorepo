"use client";

/**
 * MessageButton — open-or-create a DM thread with another user.
 *
 * Pillar three of the global-free-trade policy (spec §2.4): messaging
 * at every trade context. Posts to /api/messages/conversations (which
 * validates any reference server-side — see validateReference in
 * lib/messages/db.ts), then deep-links to the inbox with the thread
 * selected. The reference travels in the URL (?ref=<type>:<id>) so the
 * FIRST message sent there carries the reference chip.
 *
 * Style mirrors Button.tsx's "secondary" variant, expressed in semantic
 * tokens (wardrobe §3.4) so it renders identically under the terminal
 * defaults and theme-aware inside any [data-theme] subtree.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export type MessageReferenceType =
  | "market_trade" | "market_lot" | "offer" | "auction" | "market_order";

interface MessageButtonProps {
  /** The user to open a thread with. */
  otherUserId?: string;
  /** Public-profile interaction without exposing an internal user UUID. */
  otherUsername?: string;
  /** Optional trade-context reference — allowlisted + relationship-checked server-side. */
  referenceType?: MessageReferenceType;
  referenceId?: string;
  label?: string;
  size?: "sm" | "md";
}

// Sizes match Button.tsx's SIZE_CLS so the two sit level in a flex row.
const SIZE_CLS: Record<"sm" | "md", string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
};

export function MessageButton({
  otherUserId,
  otherUsername,
  referenceType,
  referenceId,
  label = "Message",
  size = "md",
}: MessageButtonProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function open() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUserId, otherUsername, referenceType, referenceId }),
      });
      const data = await res.json();
      if (res.ok && data.conversation) {
        const ref = referenceType && referenceId
          ? `&ref=${encodeURIComponent(`${referenceType}:${referenceId}`)}`
          : "";
        router.push(`/account/messages?c=${data.conversation.id}${ref}`);
        return; // stay pending through the navigation
      }
      // The server refuses for a reason worth reading — block list,
      // recipient opted out, rate limit. Surface it here, BEFORE the
      // user writes anything into a thread that can't open.
      setError(typeof data.error === "string" ? data.error : "Couldn't open a conversation.");
    } catch {
      // Network failure — fall through and re-enable the button.
      setError("Network error — try again.");
    }
    setPending(false);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className={`inline-flex items-center justify-center gap-2 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed bg-surface text-ink border border-border-subtle hover:bg-surface-subtle ${SIZE_CLS[size]}`}
      >
        <Icon name="message" size={size === "sm" ? 13 : 15} />
        {pending ? "…" : label}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
