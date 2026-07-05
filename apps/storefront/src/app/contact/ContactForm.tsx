"use client";

import { useState } from "react";
import { Button, Card, ErrorAlert, Field, Input, Select, Textarea } from "@/lib/ui";

/**
 * ContactForm — the human half of the feedback channel.
 *
 * POSTs to /api/v1/feedback with kind "general" (the free-form kind; the
 * other four kinds are structured reports agents file directly). The
 * `topic` and `name` fields aren't part of the route's typed shape — they
 * ride along in the raw body, which the route logs and persists whole, so
 * triage still sees them. Email is optional: we can only reply if it's
 * given, and the form says so rather than requiring it.
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
  | { state: "sent"; referenceId: string | null }
  | { state: "error"; message: string };

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
          name: name.trim() || undefined,
          reporter_contact: email.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        data?: { feedback_id?: string };
        error?: { message?: string };
      };
      if (!res.ok || json.error) {
        setStatus({
          state: "error",
          message: json.error?.message ?? "Something went wrong sending your message.",
        });
        return;
      }
      setStatus({ state: "sent", referenceId: json.data?.feedback_id ?? null });
    } catch {
      setStatus({
        state: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  if (status.state === "sent") {
    return (
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
          within 48 hours; if you didn&apos;t, we can read but not write back.
        </p>
      </Card>
    );
  }

  return (
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
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Your email"
          htmlFor="contact-email"
          hint="Optional — but we can only reply if you leave one."
        >
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
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

      <Field label="Message" htmlFor="contact-message">
        <Textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      <Button type="submit" disabled={status.state === "sending" || !message.trim()}>
        {status.state === "sending" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
