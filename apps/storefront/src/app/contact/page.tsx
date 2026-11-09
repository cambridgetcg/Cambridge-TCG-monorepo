import Link from "next/link";
import { PageHeader } from "@/lib/ui";
import { feedbackDoorOpen } from "@/lib/feedback/door";
import ContactForm from "./ContactForm";

/**
 * /contact — the human contact page.
 *
 * One calm screen: a small form that delivers into the feedback door
 * (/api/v1/feedback), plus the plain email alternative for people who'd
 * rather not use a form. The form and the email reach the same people but
 * not the same place: the form's message is kept by the door for 180 days
 * (/privacy#feedback-door), the email by the mailbox. While PUBLIC_FEEDBACK
 * is off the form is not offered and the page says email only; the page is
 * built with the deployment's flags, as the switch needs a redeploy anyway.
 * Contact-surface spec W6; the form itself lives in ./ContactForm (client).
 */

export const metadata = {
  title: "Contact — Cambridge TCG",
  description:
    "Get in touch with Cambridge TCG. Send a message through the form, or email contact@cambridgetcg.com — a human reads every message.",
};

export default function ContactPage() {
  const open = feedbackDoorOpen();
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <PageHeader
          title="Contact us"
          description="A question about an order, a trade-in, the site, or anything else — write below and a human will read it."
        />

        <ContactForm open={open} />

        <p className="text-sm text-ink-muted mt-8 leading-relaxed">
          {open ? "Prefer plain email? Write to " : "Write to "}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent underline hover:text-accent-strong"
          >
            contact@cambridgetcg.com
          </a>
          {open ? (
            <>
              {" — "}the same people read both. The form keeps your message for
              180 days, or until you delete it with your key; see{" "}
              <Link href="/privacy#feedback-door" className="text-accent underline hover:text-accent-strong">
                what the form keeps
              </Link>
              . If you left an email address, we aim to reply within 48 hours.
            </>
          ) : (
            <>. We aim to reply within 48 hours.</>
          )}
        </p>
      </div>
    </main>
  );
}
