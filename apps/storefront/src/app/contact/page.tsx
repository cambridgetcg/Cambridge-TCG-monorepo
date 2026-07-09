import { PageHeader } from "@/lib/ui";
import ContactForm from "./ContactForm";

/**
 * /contact — the human contact page.
 *
 * One calm screen: a small form that delivers into the existing feedback
 * channel (/api/v1/feedback), plus the plain email alternative for people
 * who'd rather not use a form. Contact-surface spec W6; the form itself
 * lives in ./ContactForm (client).
 */

export const metadata = {
  title: "Contact — Cambridge TCG",
  description:
    "Get in touch with Cambridge TCG. Send a message through the form, or email contact@cambridgetcg.com — a human reads every message.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <PageHeader
          title="Contact us"
          description="A question about an order, a trade-in, the site, or anything else — write below and a human will read it."
        />

        <ContactForm />

        <p className="text-sm text-ink-muted mt-8 leading-relaxed">
          Prefer plain email? Write to{" "}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent underline hover:text-accent-strong"
          >
            contact@cambridgetcg.com
          </a>
          {" — "}the form above delivers to the same place. If you left an
          email address, we aim to reply within 48 hours.
        </p>
      </div>
    </main>
  );
}
