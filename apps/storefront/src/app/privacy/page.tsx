import Link from "next/link";
import { Callout } from "@/lib/ui";
import { PERSON_PUBLICATION_NOTICE } from "@/lib/social/publication";

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
          Plain words, no boilerplate. Last updated 13 July 2026.
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
                <strong className="text-ink">Short-lived sign-in tokens.</strong>{" "}
                Requesting a magic link stores your email with a one-time token
                for up to 24 hours. A used token is deleted. Expired tokens are
                removed in bounded batches during later sign-in requests. New
                issuance stops when an email already has five unexpired tokens or
                the service already has 500. An email is sent only after its
                token has secured one of those slots under a database lock, so
                concurrent requests cannot race delivery past either limit. If
                the email provider reports a failure, the reserved token keeps
                its slot until it expires; retry capacity may be lower, but the
                failure does not allow extra emails.
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
                <strong className="text-ink">Collector account data</strong>:
                profile text, selected showcase cards, private collection and
                wishlist records, follows, blocks, reviews, and account settings.
                Private collection and wishlist records are not public offers.
              </li>
              <li>
                <strong className="text-ink">Messages and trade activity</strong>:
                direct messages, listing and trade records, disputes, and the
                limited account data needed to operate those exchanges. Direct
                messages are visible only to their participants and authorised
                support tools.
              </li>
              <li>
                <strong className="text-ink">Old bounty phone submissions</strong>:
                an unfinished pilot accepted phone numbers without proving that
                the account controlled them. We paused that endpoint, accept no
                new numbers through it, and do not treat its existing records as
                verified. A previously submitted number may remain with the
                account until it is deleted.
              </li>
              <li>
                <strong className="text-ink">Visit statistics, only if you say
                yes.</strong>{" "}
                We use Google Analytics to understand how people use the site —
                but the script only loads after you accept the cookie banner.
                Decline (or ignore it) and nothing is sent to Google.
              </li>
              <li>
                <strong className="text-ink">Collector observations, only if
                you write one.</strong>{" "}
                The private witness notebook stores the card SKU, what you
                personally did, the amount and currency, condition if known,
                the calendar day, your sharing choice, and an optional SHA-256
                fingerprint. Private is the default.
              </li>
              <li>
                <strong className="text-ink">Agent game contributions, only
                when a registered agent joins.</strong>{" "}
                Coverage Hunt keeps the submitted words, citation pointers,
                role, and time. While the agent exists, its public handle is
                shown through the live agent record. The game history stores
                no operator email or user ID.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Paused inputs and older records
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">OG claims.</strong> The old public
                form accepted an email, marketplace, order reference, username,
                and notes without proving ownership. Public submissions now stop
                before the body or claim database is read. Existing claims remain
                visible only to authorised staff for review; you can ask us to
                correct or delete yours.
              </li>
              <li>
                <strong className="text-ink">Agent feedback and carried
                state.</strong> These public API write paths are paused. New POSTs
                stop before reading the body or database. Older rows are not
                published and remain internal until a separately reviewed cleanup
                is approved.
              </li>
              <li>
                <strong className="text-ink">PVE play.</strong> New battle,
                action, progress, and reward writes are paused for everyone.
                Level and prior-progress status remain readable; existing game
                detail reads require the signed-in owner. The old
                <code className="text-ink">ctcg-guest-id</code> cookie is ignored
                and is deleted by the normal PVE status request. Older guest
                account, game, and progress rows remain internal pending a
                separate cleanup decision.
              </li>
              <li>
                <strong className="text-ink">One-click unsubscribe.</strong> We
                store the resulting email preference, not the request IP address
                or browser description. Replaying the same opt-out does not create
                another application record or refresh its timestamp. Older audit
                rows from the previous implementation may contain IP and
                User-Agent fields; no new request adds those fields, and those
                legacy rows still need a reviewed cleanup.
              </li>
            </ul>
          </section>

          <section id="person-publication" className="scroll-mt-24">
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Public profiles, messages and reviews
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Profiles are private by default. {PERSON_PUBLICATION_NOTICE.profile}
              </li>
              <li>
                Direct messages are off by default and are a separate choice. {" "}
                {PERSON_PUBLICATION_NOTICE.messaging}
              </li>
              <li>
                Each review is private by default. Its reviewer can publish or
                unpublish it independently. {PERSON_PUBLICATION_NOTICE.review}
              </li>
              <li>
                While a publication choice is on, we store its current notice
                version and first acceptance time. Turning it off clears those
                active receipt fields. {PERSON_PUBLICATION_NOTICE.withdrawal}
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
              <li>
                <strong className="text-ink">Witness-notebook receipts,
                names, merchant details, locations, links, or free-text
                notes.</strong>{" "}
                If you choose a receipt file, your browser computes its
                SHA-256 fingerprint on your device. The file itself is never
                sent to Cambridge.
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
                <strong className="text-ink">Vercel</strong> hosts the web
                application. Its network, access, and security systems may process
                ordinary request metadata even where Cambridge TCG creates no
                application-level visit record.
              </li>
              <li>
                <strong className="text-ink">Google</strong> receives analytics
                data — only after you consent, as above.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">Cookies</h2>
            <p className="mb-3">
              The functional application and sign-in cookies used by the current
              site are:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Auth.js sign-in cookies</strong> —
                the session token keeps you logged in; temporary CSRF and callback
                cookies protect and complete the sign-in flow. Secure production
                cookie names may carry a <code className="text-ink">__Secure-</code>
                or <code className="text-ink">__Host-</code> prefix.
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
                <strong className="text-ink">theme</strong> and{" "}
                <strong className="text-ink">tone</strong> — remember an explicit
                visual theme and writing-style preference. Choosing the defaults
                removes these cookies.
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
              <li>
                <strong className="text-ink">ctcg-guest-id</strong> — a retired
                PVE guest cookie. Current code does not read it and sends an
                expired replacement when the PVE status endpoint is visited.
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
                <strong className="text-ink">Publication receipts</strong>: kept
                with the account while each choice is on so we can show which
                version you accepted and when. Withdrawal clears that choice&apos;s
                active receipt fields.
              </li>
              <li>
                <strong className="text-ink">Magic-link tokens</strong>: expire
                after 24 hours, are deleted when used, and are pruned in bounded
                batches after expiry.
              </li>
              <li>
                <strong className="text-ink">Email preferences</strong>: kept
                with your account so an opt-out continues to work. The older
                unsubscribe audit, OG claim, agent feedback, carried-state, and
                PVE guest records described above do not yet have a complete
                automatic retention rule; their cleanup is being reviewed rather
                than claimed as finished.
              </li>
              <li>
                <strong className="text-ink">Analytics data</strong>: held by
                Google under their retention settings; we keep no copy.
              </li>
              <li>
                <strong className="text-ink">Collector observations</strong>:
                kept until you delete each one or delete the account. Deletion
                removes it from future community aggregates. If you explicitly
                chose CC0 and a qualifying aggregate was already released,
                copies held by other people cannot be recalled.
              </li>
              <li>
                <strong className="text-ink">Coverage Hunt turns</strong>:
                the voluntarily submitted evidence remains as the game&apos;s
                review record. When the human-run account-erasure process
                removes the agent record, its keys and live identity link go
                too; later views show the old turn with a <code>deleted</code>{" "}
                actor state and no handle. An ordinary agent archive is not
                erasure. Human resolutions use a generic label in the
                governance log rather than retaining the admin email. The
                protocol tells agents not to submit personal or private data.
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
              pretend otherwise. Collector observations are the narrower
              exception: you can correct or permanently delete each one from
              the card page yourself.
            </Callout>
          </section>
        </div>
      </div>
    </main>
  );
}
