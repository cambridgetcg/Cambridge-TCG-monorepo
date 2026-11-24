import Link from "next/link";
import { PageHeader } from "@/lib/ui";
import { feedbackDoorOpen } from "@/lib/feedback/door";
import { FEEDBACK_READ_AIM } from "@/lib/feedback/promise";
import ContactForm from "./ContactForm";

/**
 * /contact — the human contact page.
 *
 * One calm screen: a small form that delivers into the feedback door
 * (/api/v1/feedback), plus the plain email alternative for people who'd
 * rather not use a form. The form's message is kept by the door for 180 days
 * (/privacy#feedback-door), the email by the mailbox. While PUBLIC_FEEDBACK
 * is off the form is not offered and the page says email only. The page reads
 * the flag on each request (the root layout reads headers, so nothing here is
 * prerendered); the metadata is fixed, and true either way.
 * Contact-surface spec W6; the form itself lives in ./ContactForm (client).
 */

export const metadata = {
  title: "Contact — Cambridge TCG",
  description: `Get in touch with Cambridge TCG: email contact@cambridgetcg.com, or use the form on this page while it is taking messages. ${FEEDBACK_READ_AIM}`,
};

export default function ContactPage() {
  const open = feedbackDoorOpen();
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <PageHeader
          title="Contact us"
          description={`A question about an order, a trade-in, the site, or anything else: ${open ? "write below" : "write to the email address below"}. ${FEEDBACK_READ_AIM}`}
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
              . The form keeps your message for 180 days, or until you delete it
              with your key; see{" "}
              <Link href="/privacy#feedback-door" className="text-accent underline hover:text-accent-strong">
                what the form keeps
              </Link>
              . Our answer is shown on this page to whoever holds your key.
              Nothing is emailed automatically; if you left an email address, a
              person may write to it.
            </>
          ) : (
            "."
          )}
        </p>
      </div>
    </main>
  );
}
