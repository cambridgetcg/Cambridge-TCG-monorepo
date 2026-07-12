"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorAlert, Field, Input, Select, Textarea } from "@/lib/ui";

/**
 * ContactForm — the human half of the feedback channel.
 *
 * POSTs to /api/v1/feedback with kind "general" (the free-form kind; the
 * other four kinds are structured reports agents file directly). The route
 * accepts only this form's named fields. Email is optional and is
 * stored separately from message content so both can be removed by the same
 * 180-day retention boundary. Submission stores an inbox row; it does not
 * send an email or copy the message into application logs.
 */

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "order", label: "An order or delivery" },
  { value: "trade-in", label: "Trade-ins and selling" },
  { value: "site-issue", label: "Something on the site looks wrong" },
  { value: "directory", label: "Report or correct an organisation listing" },
  { value: "partnership", label: "Partnerships, data, or the API" },
] as const;

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; referenceId: string | null }
  | { state: "error"; message: string };

export default function ContactForm({
  initialTopic = "general",
  initialListing = null,
}: {
  initialTopic?: string;
  initialListing?: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(
    TOPICS.some((item) => item.value === initialTopic) ? initialTopic : "general",
  );
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
          listing: initialListing ?? undefined,
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
          Your message is stored for operator review. If you left an email
          address, an operator may use it to reply, but no reply time is
          guaranteed. For an urgent issue, email{" "}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent underline"
          >
            contact@cambridgetcg.com
          </a>
          {" "}directly.
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
            maxLength={120}
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

      {initialListing && (
        <div className="rounded-lg border border-border-subtle bg-surface p-3 text-sm text-ink-muted">
          Organisation listing: <code className="text-ink">{initialListing}</code>
          <p className="mt-1 text-xs text-ink-faint">
            This identifier is attached to the report so the team can locate
            the exact record.
          </p>
        </div>
      )}

      <Field label="Message" htmlFor="contact-message">
        <Textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      <p className="text-xs text-ink-faint leading-relaxed">
        The form stores your message, topic, optional name and optional reply
        email in our AWS-hosted database for operator review. It does not email
        or log the message. Content and contact details are scheduled for
        removal 180 days after receipt; a minimal non-personal lifecycle record
        remains.{" "}
        <Link href="/privacy" className="text-accent underline">
          Privacy details
        </Link>
        .
      </p>

      <Button type="submit" disabled={status.state === "sending" || !message.trim()}>
        {status.state === "sending" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
