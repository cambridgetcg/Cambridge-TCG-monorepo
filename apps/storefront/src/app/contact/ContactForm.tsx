"use client";

import { useState } from "react";
import { Button, Card, ErrorAlert, Field, Input, Select, Textarea } from "@/lib/ui";

/**
 * ContactForm — the human half of the feedback door (/api/v1/feedback).
 *
 * POSTs kind "general" with the topic, message, and the optional name and
 * email as reply_name and reply_to. The door keeps exactly those fields
 * (lib/feedback/door.ts), never the request as sent, and answers with a
 * reference and a holder key shown once. The key stays in this page's
 * memory only: nothing is written to cookies or browser storage. With it the
 * sender can read our answer or delete the message here, now or later.
 * While the door is closed the POST answers 503 and the form shows that
 * message, which names the email address instead.
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
  | { state: "error"; message: string };

interface DoorReply {
  data?: { feedback_id?: string; holder_key?: string; status?: string; answer?: { text: string; answered_at: string } | null; erased?: boolean };
  error?: { message?: string };
}

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(TOPICS[0].value);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

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

  if (status.state === "sent") {
    return (
      <div className="space-y-5">
        <Card padding="lg">
          <p className="text-base font-semibold text-ok">Message received.</p>
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
            We read every message. If you left an email address, we aim to reply
            within 48 hours; if you didn&apos;t, read our answer below with your key.
          </p>
          {status.holderKey && (
            <p className="text-sm text-ink-muted mt-3 leading-relaxed">
              Your key is{" "}
              <code className="text-ink bg-surface-subtle px-1.5 py-0.5 rounded text-xs break-all">
                {status.holderKey}
              </code>
              . Copy it now if you want to come back: we keep only a fingerprint of
              it, so we cannot show it again. We delete the message 180 days after
              it arrives.
            </p>
          )}
        </Card>
        {status.holderKey && <MessageKey initialKey={status.holderKey} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-5">
        {status.state === "error" && (
          <ErrorAlert title="Not sent" description={status.message} />
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="contact-name" hint="Optional.">
            <Input
              id="contact-name"
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
            hint="Optional — we can only write back if you leave one."
          >
            <Input
              id="contact-email"
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

        <Field label="Message" htmlFor="contact-message" hint="At most 4,000 characters.">
          <Textarea
            id="contact-message"
            name="message"
            rows={6}
            required
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>

        <Button type="submit" disabled={status.state === "sending" || !message.trim()}>
          {status.state === "sending" ? "Sending…" : "Send message"}
        </Button>
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
function MessageKey({ initialKey = "" }: { initialKey?: string }) {
  const [key, setKey] = useState(initialKey);
  const [result, setResult] = useState<KeyState>({ state: "idle" });

  async function call(method: "GET" | "DELETE") {
    const holderKey = key.trim();
    if (!holderKey || result.state === "working") return;
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
        return;
      }
      setResult({ state: "status", status: json.data?.status ?? "received", answer: json.data?.answer ?? null });
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
        <Field label="Your key" htmlFor="contact-key" hint="The fbk_… key shown when you sent it.">
          <Input
            id="contact-key"
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
          <p className="text-sm text-ink-muted">Deleted: the message, any email address you left and our answer are gone.</p>
        )}
        {result.state === "status" && (
          <div className="text-sm text-ink-muted leading-relaxed">
            {result.answer ? (
              <>
                <p className="font-semibold text-ink">Our answer</p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{result.answer.text}</p>
              </>
            ) : (
              <p>No answer yet (status: {result.status}).</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
