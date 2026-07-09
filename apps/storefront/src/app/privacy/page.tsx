import Link from "next/link";
import { Callout } from "@/lib/ui";

/**
 * /privacy — what we collect, what we don't, in plain words.
 *
 * Written honestly rather than as boilerplate: every claim below maps to
 * something real in the codebase (magic-link auth, Stripe checkout, SES
 * email, consent-gated GA), and where practice isn't formalised yet the
 * page says so instead of pretending. Contact-surface spec W6.
 */

export const metadata = {
  title: "Privacy — Cambridge TCG",
  description:
    "What Cambridge TCG collects, what it doesn't, how long things are kept, and the cookies in use — in plain words.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-ink mb-2">Privacy</h1>
        <p className="text-sm text-ink-faint mb-8">
          Plain words, no boilerplate. Last updated 10 June 2026.
        </p>

        <div className="space-y-8 text-ink-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">What we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Your email address</strong>, if you
                create an account. Sign-in works by emailing you a magic link —
                there are no passwords here, so we never store one.
              </li>
              <li>
                <strong className="text-ink">Order details</strong>: your name,
                delivery address, and what you bought. We need these to ship
                cards and to keep honest accounts.
              </li>
              <li>
                <strong className="text-ink">Trade-in details</strong>: the
                cards you submit and the payout we agree. See the{" "}
                <Link href="/trade-in/terms" className="text-accent underline">
                  trade-in terms
                </Link>{" "}
                for how that works.
              </li>
              <li>
                <strong className="text-ink">Visit statistics, only if you say
                yes.</strong>{" "}
                We use Google Analytics to understand how people use the site —
                but the script only loads after you accept the cookie banner.
                Decline (or ignore it) and nothing is sent to Google.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              What we don&apos;t collect
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Card payment details.</strong>{" "}
                Payments are processed by Stripe; your card number goes to them,
                not to us. We see that you paid, not what your card is.
              </li>
              <li>
                <strong className="text-ink">Passwords.</strong> None exist —
                sign-in is by emailed link only.
              </li>
              <li>
                <strong className="text-ink">Marketing or ad-tracking
                cookies.</strong>{" "}
                No third-party ad trackers run here. The one Google Ads tag we
                use records a purchase conversion after checkout, and like
                Analytics it only runs if you accepted the banner.
              </li>
              <li>
                <strong className="text-ink">Anything to sell.</strong> We do
                not sell or share your data with anyone for marketing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">Who touches your data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Stripe</strong> processes card
                payments.
              </li>
              <li>
                <strong className="text-ink">Amazon Web Services</strong> hosts
                our database and sends our email (sign-in links, order
                confirmations) via their SES service.
              </li>
              <li>
                <strong className="text-ink">Google</strong> receives analytics
                data — only after you consent, as above.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">Cookies</h2>
            <p className="mb-3">The complete list of cookies this site sets:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Sign-in session</strong> — keeps
                you logged in to your account.
              </li>
              <li>
                <strong className="text-ink">display-currency</strong> — which
                currency prices are shown in.
              </li>
              <li>
                <strong className="text-ink">text-mode</strong> — remembers if
                you switched to the text-only reading layout.
              </li>
              <li>
                <strong className="text-ink">lang-mode</strong> — remembers the
                language-display toggle in the footer.
              </li>
              <li>
                <strong className="text-ink">analytics-consent</strong> — your
                yes-or-no answer to the analytics banner, kept for one year so
                we don&apos;t ask again.
              </li>
              <li>
                <strong className="text-ink">banner-dev-notice</strong> —
                remembers you dismissed the site notice; gone when you close
                your browser.
              </li>
            </ul>
            <p className="mt-3">
              Google Analytics sets its own cookies <em>only</em> after you
              accept the banner. Everything else above is functional, not
              tracking.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">How long we keep things</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Orders and trade-ins</strong>: kept
                for six years, because UK tax and accounting law requires it.
              </li>
              <li>
                <strong className="text-ink">Your account</strong>: kept until
                you ask us to delete it.
              </li>
              <li>
                <strong className="text-ink">Analytics data</strong>: held by
                Google under their retention settings; we keep no copy.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">Your rights</h2>
            <p>
              Under UK data-protection law you can ask to see what we hold about
              you, ask us to correct it, or ask us to delete it (we&apos;ll keep
              what tax law obliges us to, and delete the rest). Use the{" "}
              <Link href="/contact" className="text-accent underline">
                contact page
              </Link>{" "}
              or email{" "}
              <a
                href="mailto:contact@cambridgetcg.com"
                className="text-accent underline"
              >
                contact@cambridgetcg.com
              </a>
              .
            </p>
            <Callout tone="note" title="Honest note">
              We don&apos;t yet have an automated export-my-data or
              delete-my-account button. When you ask, a human does it by hand
              and confirms by email. We&apos;d rather tell you that plainly than
              pretend otherwise.
            </Callout>
          </section>
        </div>
      </div>
    </main>
  );
}
