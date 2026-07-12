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
    "Get in touch with Cambridge TCG through the bounded feedback inbox or by direct email.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const topic = typeof params.topic === "string" ? params.topic : "general";
  const listingRaw = typeof params.listing === "string" ? params.listing : "";
  const listing = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(listingRaw)
    ? listingRaw
    : null;
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <PageHeader
          title="Contact us"
          description="A question about an order, the site, an organisation listing, or anything else — store it in the review inbox below."
        />

        <ContactForm initialTopic={topic} initialListing={listing} />

        <p className="text-sm text-ink-muted mt-8 leading-relaxed">
          Prefer plain email? Write to{" "}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent underline hover:text-accent-strong"
          >
            contact@cambridgetcg.com
          </a>. The form above stores a separate operator inbox record; it does not
          send an email. Use direct email for an urgent issue. Neither channel
          has a guaranteed reply time.
        </p>
      </div>
    </main>
  );
}
