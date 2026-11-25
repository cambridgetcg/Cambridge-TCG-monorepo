"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, ErrorAlert, Field, Input, Select, Textarea } from "@/lib/ui";
import { CONTACT_FORM_READ_AIM } from "@/lib/feedback/promise";

/**
 * ContactForm — the human half of the feedback door (/api/v1/feedback).
 *
 * POSTs kind "general" with the topic, message, and the optional name and
 * email as reply_name and reply_to. The door keeps exactly those fields
 * (lib/feedback/door.ts), never the request as sent, and answers with a
 * reference and a holder key shown once. The key stays in this page's
 * memory only: nothing is written to cookies or browser storage. With it the
 * sender can read an answer or delete the message here, now or later. An
 * answer is shown only to the key; none is emailed automatically.
 * While the door is closed (`open` false, read by the page from
 * PUBLIC_FEEDBACK) the form is not offered and the page points to email; a
 * key from an earlier message still reads and erases it.
 */

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "order", label: "An order or delivery" },
  { value: "trade-in", label: "Trade-ins and selling" },
  { value: "site-issue", label: "Something on the site looks wrong" },
  { value: "partnership", label: "Partnerships, data, or the API" },
] as const;

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; referenceId: string | null; holderKey: string | null }
  | { state: "deleted" }
  | { state: "error"; message: string };

interface DoorReply {
  data?: { "@kind"?: string; feedback_id?: string; holder_key?: string; status?: string; answer?: { text: string; answered_at: string } | null; erased?: boolean };
  error?: { message?: string };
}

/** A holder key's shape (lib/feedback/door.ts HOLDER_KEY_PATTERN, which
 * imports node:crypto and so stays out of this client file). */
const HOLDER_KEY = /^fbk_[A-Za-z0-9_-]{43}$/;

const DELETED = "Deleted here: the message, any email address you left and any answer.";

export default function ContactForm({ open }: { open: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(TOPICS[0].value);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  // The receipt takes the form's place, wherever on the screen Send was.
  // Focus goes to it, so that the key, shown once, is seen and read out.
  const receipt = useRef<HTMLElement>(null);
  useEffect(() => {
    if (status.state === "sent" || status.state === "deleted") receipt.current?.focus();
  }, [status.state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || status.state === "sending") return;
    setStatus({ state: "sending" });

    try {
      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "general",
          message: message.trim(),
          topic,
          reply_name: name.trim() || undefined,
          reply_to: email.trim() || undefined,
        }),
      });
      const json = (await res.json()) as DoorReply;
      if (!res.ok || json.error) {
        setStatus({
          state: "error",
          message: json.error?.message ?? "Something went wrong sending your message.",
        });
        return;
      }
      setStatus({ state: "sent", referenceId: json.data?.feedback_id ?? null, holderKey: json.data?.holder_key ?? null });
    } catch {
      setStatus({
        state: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  if (status.state === "deleted") {
    return (
      <section ref={receipt} tabIndex={-1} aria-labelledby="receipt-heading" className="scroll-mt-24">
        <Card padding="lg">
          <p id="receipt-heading" className="text-sm text-ink-muted leading-relaxed">{DELETED}</p>
        </Card>
      </section>
    );
  }

  if (status.state === "sent") {
    return (
      <section ref={receipt} tabIndex={-1} aria-labelledby="receipt-heading" className="space-y-5 scroll-mt-24">
        <Card padding="lg">
          <p id="receipt-heading" className="text-base font-semibold text-ok">Message received.</p>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
            {status.referenceId && (
              <>
                Your reference is{" "}
                <code className="text-ink bg-surface-subtle px-1.5 py-0.5 rounded text-xs">
                  {status.referenceId}
                </code>
                {" — quote it if you follow up. "}
              </>
            )}
            {CONTACT_FORM_READ_AIM} An answer, if one is written, is shown on
            this page to whoever holds your key. No answer is emailed
            automatically; if you left an email address, a person may write to
            it.
          </p>
          {status.holderKey && (
            <p className="text-sm text-ink-muted mt-3 leading-relaxed">
              Your key is{" "}
              <code className="text-ink bg-surface-subtle px-1.5 py-0.5 rounded text-xs break-all select-all">
                {status.holderKey}
              </code>
              . Copy it now: with it you can read an answer here and delete the
              message yourself. We keep only a fingerprint of it, so we cannot
              show it again. We delete the message 180 days after it arrives.
            </p>
          )}
        </Card>
        {/* Its own key, so that React never takes it for the form's empty
            MessageKey, whose buttons would not work. */}
        {status.holderKey && (
          <MessageKey key={status.holderKey} initialKey={status.holderKey} onDeleted={() => setStatus({ state: "deleted" })} />
        )}
      </section>
    );
  }

  if (!open) {
    return (
      <div className="space-y-8">
        <Card padding="lg">
          <p className="text-sm text-ink-muted leading-relaxed">
            The form is not taking messages at the moment. Please email{" "}
            <a href="mailto:contact@cambridgetcg.com" className="text-accent underline hover:text-accent-strong">
              contact@cambridgetcg.com
            </a>{" "}
            instead.
          </p>
        </Card>
        <MessageKey />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="contact-name" hint={<span id="contact-name-hint">Optional.</span>}>
            <Input
              id="contact-name"
              aria-describedby="contact-name-hint"
              name="name"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Your email"
            htmlFor="contact-email"
            hint={<span id="contact-email-hint">Optional. Nothing is sent to it automatically, but a person may write to it. Any answer is shown here, with the key you get.</span>}
          >
            <Input
              id="contact-email"
              aria-describedby="contact-email-hint"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Topic" htmlFor="contact-topic">
          <Select
            id="contact-topic"
            name="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Message" htmlFor="contact-message" hint={<span id="contact-message-hint">At most 4,000 characters.</span>}>
          <Textarea
            id="contact-message"
            aria-describedby="contact-message-hint"
            name="message"
            rows={6}
            required
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>

        <p className="text-sm text-ink-muted leading-relaxed">
          Please leave out passwords, card payment details and anything else
          private that we do not need.
        </p>

        <div>
          {/* Always here, and beside Send, so that a refusal is seen and read out. */}
          <div role="alert">
            {status.state === "error" && (
              <div className="mb-5">
                <ErrorAlert title="Not sent" description={status.message} />
              </div>
            )}
          </div>
          <Button type="submit" disabled={status.state === "sending" || !message.trim()}>
            {status.state === "sending" ? "Sending…" : "Send message"}
          </Button>
        </div>
      </form>

      <MessageKey />
    </div>
  );
}

type KeyState =
  | { state: "idle" }
  | { state: "working" }
  | { state: "status"; status: string; answer: { text: string; answered_at: string } | null }
  | { state: "erased" }
  | { state: "error"; message: string };

/** Read the answer to, or delete, a message sent here, with its key. The
 * key is sent only as an Authorization header and kept only in memory. */
function MessageKey({ initialKey = "", onDeleted }: { initialKey?: string; onDeleted?: () => void }) {
  const [key, setKey] = useState(initialKey);
  const [result, setResult] = useState<KeyState>({ state: "idle" });

  async function call(method: "GET" | "DELETE") {
    const holderKey = key.trim();
    if (!holderKey || result.state === "working") return;
    if (!HOLDER_KEY.test(holderKey)) {
      setResult({
        state: "error",
        message: holderKey.startsWith("fb_")
          ? "That is your reference, for quoting in an email. The key starts with fbk_ and was shown beside it."
          : "That is not a key from this form. The key starts with fbk_ and was shown when you sent your message.",
      });
      return;
    }
    if (method === "DELETE" && !window.confirm("Delete this message now? Its key will open nothing.")) return;
    setResult({ state: "working" });
    try {
      const res = await fetch("/api/v1/feedback", {
        method,
        headers: { authorization: `Bearer ${holderKey}` },
        cache: "no-store",
      });
      const json = (await res.json()) as DoorReply;
      if (!res.ok || json.error) {
        setResult({ state: "error", message: json.error?.message ?? "That did not work." });
        return;
      }
      if (method === "DELETE") {
        setResult({ state: "erased" });
        onDeleted?.();
        return;
      }
      // Only a message's status answers a key; anything else (the door's
      // own description, say) is not about this message.
      if (json.data?.["@kind"] !== "feedback-status") {
        setResult({ state: "error", message: "That key did not open a message." });
        return;
      }
      setResult({ state: "status", status: json.data.status ?? "received", answer: json.data.answer ?? null });
    } catch {
      setResult({ state: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  return (
    <section aria-labelledby="message-key-heading" className="space-y-4">
      <h2 id="message-key-heading" className="text-base font-semibold text-ink">
        {initialKey ? "Your message" : "Sent a message before?"}
      </h2>
      {!initialKey && (
        <Field label="Your key" htmlFor="contact-key" hint={<span id="contact-key-hint">The fbk_… key shown when you sent it.</span>}>
          <Input
            id="contact-key"
            aria-describedby="contact-key-hint"
            name="key"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={!key.trim() || result.state === "working" || result.state === "erased"} onClick={() => call("GET")}>
          Check for an answer
        </Button>
        <Button type="button" variant="ghost" disabled={!key.trim() || result.state === "working" || result.state === "erased"} onClick={() => call("DELETE")}>
          Delete my message
        </Button>
      </div>
      <div aria-live="polite">
        {result.state === "error" && <ErrorAlert title="Not done" description={result.message} />}
        {result.state === "erased" && (
          <p className="text-sm text-ink-muted">{DELETED}</p>
        )}
        {result.state === "status" && (
          <div className="text-sm text-ink-muted leading-relaxed">
            {result.answer ? (
              <>
                <p className="font-semibold text-ink">Our answer</p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{result.answer.text}</p>
              </>
            ) : (
              <p>{result.status === "closed" ? "This message was closed without an answer here." : `No answer yet (status: ${result.status}).`}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
