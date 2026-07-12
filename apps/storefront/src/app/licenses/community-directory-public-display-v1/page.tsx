import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Community directory public-display terms v1",
  description: "The exact publication and downstream-use boundary for Cambridge TCG organisation-directory records.",
};

export default function CommunityDirectoryPublicDisplayTermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-ink">
      <h1 className="font-display text-3xl font-semibold">
        Community directory public-display terms v1
      </h1>
      <p className="mt-2 text-sm text-ink-faint">
        Reference: <code>LicenseRef-CambridgeTCG-Public-Display-Only</code> ·
        effective 11 July 2026
      </p>

      <div className="mt-8 space-y-7 leading-relaxed text-ink-muted">
        <section>
          <h2 className="font-display text-xl text-ink">Who owns the record</h2>
          <p className="mt-2">
            Cambridge TCG does not claim ownership of an organisation&apos;s name,
            description, links or other submitted facts. The submitting steward
            attests that they are authorised to represent the organisation and
            grants Cambridge TCG a revocable, non-exclusive permission to host,
            display and transmit those submitted fields while the listing remains
            published.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">What a downstream reader may do</h2>
          <p className="mt-2">
            A reader may fetch a current record, link to its Cambridge TCG
            profile, and render the record substantially unmodified for the
            current request with Cambridge TCG as the source, its unverified
            status, and its correction link visible.
          </p>
          <p className="mt-2">
            Responses are served with <code>Cache-Control: no-store</code>.
            Do not retain or index a copy; fetch again for each later display.
            This v1 interface does not grant permission for bulk mirrors, resale,
            behavioural or people profiling, training datasets, contact-list
            enrichment, or implying that Cambridge TCG verified or endorsed the
            organisation. Commercial reuse beyond ordinary current display
            requires permission from the named organisation.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Withdrawal and correction</h2>
          <p className="mt-2">
            A steward may withdraw a directory listing at any time. Cambridge TCG
            serves directory records with no shared cache so withdrawal affects
            the next response. Downstream readers must stop displaying and delete
            any retained copy when a record disappears or Cambridge TCG asks them
            to correct or remove it.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Private publication receipt</h2>
          <p className="mt-2">
            Cambridge TCG privately records the acting account id, organisation
            slug, notice version, action and time. The account id is removed
            after 180 days or account deletion. The remaining receipt stays
            pseudonymised personal data and is deleted after two years. It is
            not exposed through the directory. See the{" "}
            <Link href="/privacy" className="text-accent underline">privacy notice</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Outside the permission</h2>
          <p className="mt-2">
            These terms do not license third-party logos, card art, linked-site
            content, member information, personal data, or facts obtained from a
            different source. Records are self-attested and supplied without a
            warranty of accuracy.
          </p>
        </section>

        <section className="rounded-lg border border-border-subtle bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Report a problem</h2>
          <p className="mt-2">
            Use the correction URL carried by the record, or{" "}
            <Link href="/contact?topic=directory" className="text-accent underline">
              contact Cambridge TCG
            </Link>
            . These are publication terms, not a claim that every downstream use
            is lawful in every jurisdiction; a downstream operator remains
            responsible for its own use.
          </p>
        </section>
      </div>
    </main>
  );
}
