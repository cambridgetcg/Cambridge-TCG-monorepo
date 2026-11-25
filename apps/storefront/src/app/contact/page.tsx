import Link from "next/link";
import { PageHeader } from "@/lib/ui";
import { feedbackDoorOpen } from "@/lib/feedback/door";
import { CONTACT_FORM_READ_AIM } from "@/lib/feedback/promise";
import ContactForm from "./ContactForm";

/**
 * /contact — the human contact page.
 *
 * One calm screen: a small form that delivers into the feedback door
 * (/api/v1/feedback), plus the plain email alternative for people who'd
 * rather not use a form. The form's message is kept by the door for 180 days
 * (/privacy#feedback-door), the email by the mailbox. The aim to read within
 * 48 hours is for the form's messages only. While PUBLIC_FEEDBACK is off the
 * form is not offered and the page says email only. The page reads the flag on
 * each request (the root layout reads headers, so nothing here is prerendered);
 * the metadata is fixed, and true either way.
 * Contact-surface spec W6; the form itself lives in ./ContactForm (client).
 */

export const metadata = {
  title: "Contact — Cambridge TCG",
  description: "Get in touch with Cambridge TCG: email contact@cambridgetcg.com, or use the form on this page while it is taking messages.",
};

export default function ContactPage() {
  const open = feedbackDoorOpen();
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <PageHeader
          title="Contact us"
          description={`A question about an order, the site, or anything else: ${open ? `write below. ${CONTACT_FORM_READ_AIM}` : "email us."} If you are under 18, ask a parent or guardian to write to us.`}
        />

        <ContactForm open={open} />

        {open && (
          <div className="text-sm text-ink-muted mt-8 space-y-4 leading-relaxed">
            <p>
              If you use the form, it keeps your message for 180 days, or until
              you delete it with your key; see{" "}
              <Link href="/privacy#feedback-door" className="text-accent underline hover:text-accent-strong">
                what the form keeps
              </Link>
              . An answer, if one is written, is shown on this page to whoever
              holds your key. No answer is emailed automatically; if you left an
              email address, a person may write to it.
            </p>
            <p>
              Prefer plain email? Write to{" "}
              <a href="mailto:contact@cambridgetcg.com" className="text-accent underline hover:text-accent-strong">
                contact@cambridgetcg.com
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
