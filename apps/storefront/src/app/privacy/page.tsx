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
          Plain words, no boilerplate. Last updated 11 July 2026.
        </p>

        <p className="mb-8 text-sm leading-relaxed text-ink-muted">
          Cambridge TCG is the controller for the processing described here.
          Contact <a href="mailto:contact@cambridgetcg.com" className="text-accent underline">contact@cambridgetcg.com</a>{" "}
          or use <Link href="/contact" className="text-accent underline">/contact</Link>.
          We have not appointed a data-protection officer.
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
                <strong className="text-ink">Contact and feedback messages</strong>:
                what you write in the contact form or public feedback API,
                plus a name and reply email or HTTPS URL when supplied. A reply
                path is optional for general reports but required for
                contract-drift and federation-adopter reports because the
                operator must be able to verify the affected integration or
                coordinate the adopter. You can use a general report instead
                if you do not want to supply one. These records are
                stored in our operator inbox, not emailed or copied into
                application logs. A reply address is used only if an operator
                replies to that report.
              </li>
              <li>
                <strong className="text-ink">Direct messages</strong>: the two
                participants, full message body, optional listing or trade
                reference, sent time, read cursors and a short inbox preview.
                Participants can read their conversation; authorised operators
                may access it only when needed for safety, support or a dispute.
                Archiving hides a thread from one inbox but does not delete it.
              </li>
              <li>
                <strong className="text-ink">Trust and fraud-safety records</strong>:
                completed and cancelled trade history, reviews, disputes,
                account age, trading volume, external-reputation evidence,
                security signals, trust score, limits, flags and suspension
                decisions. The automated-decisions section below explains the
                logic and effect.
              </li>
              <li>
                <strong className="text-ink">Optional identity-verification records</strong>:
                historic submissions may contain legal name, date of birth,
                address, phone, bank details and document metadata. New intake
                and document previews are paused until dedicated private file
                storage and a tested retention schedule exist. We verified that
                the current public-media bucket contains no objects under the
                verification prefix; the application will not mint the first one.
              </li>
              <li>
                <strong className="text-ink">Short-lived abuse counters</strong>:
                public feedback and self-serve agent registration turn the
                request IP, and selected signed-in actions turn the internal
                account id, into a window-specific HMAC-SHA256 value using a
                server secret. The feature does not write the raw subject or a
                reusable subject hash to its database or application logs.
                These counters enforce the published feedback, registration,
                directory and direct-message limits.
              </li>
              <li>
                <strong className="text-ink">Unsubscribe receipts</strong>:
                user, email category, action source and time prove a signed
                unsubscribe action. The token already proves authority, so the
                application no longer stores request IP or User-Agent with the
                receipt; migration 0119 clears legacy copies.
              </li>
              <li>
                <strong className="text-ink">Ordinary request metadata</strong>:
                our hosting and security providers process the request IP,
                path, time and headers such as User-Agent to deliver and
                protect the site. Cambridge application code does not build a
                bot profile or contact directory from User-Agent strings.
              </li>
              <li>
                <strong className="text-ink">Public media uploads</strong>:
                new quote, avatar, auction-image, trade-photo, identity-document
                and dispute-evidence uploads are paused. Existing safe reads and
                deletion controls remain where applicable. Reopening requires
                bounded private/public storage helpers and a reviewed retention
                schedule.
              </li>
              <li>
                <strong className="text-ink">Directory publication receipts</strong>:
                when an organisation steward lists or withdraws a record, we
                privately record the acting account id, organisation slug,
                notice version, action and time. This proves which publication
                notice was acted on and supports correction or withdrawal.
                Actor ids are never exposed through the public directory.
              </li>
              <li>
                <strong className="text-ink">Privacy-reset rollback ledger</strong>:
                the July 2026 privacy migration temporarily records affected
                internal row identifiers and their prior publication setting
                so a faulty migration can be reversed safely. It contains no
                profile, message, collection or review text.
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
                our database and object storage and sends our email (sign-in
                links, order confirmations) via SES.
              </li>
              <li>
                <strong className="text-ink">Vercel</strong> hosts the web
                application and therefore processes ordinary request metadata
                needed to deliver and protect it.
              </li>
              <li>
                <strong className="text-ink">Google</strong> receives analytics
                data — only after you consent, as above.
              </li>
              <li>
                <strong className="text-ink">Authorised Cambridge TCG operators</strong>{" "}
                can access support, fraud, dispute and historic verification
                records when their role requires it. Those records are not a
                public directory.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Why we use it
            </h2>
            <p className="mb-3">
              UK data-protection law asks us to name a lawful basis for each
              use, not merely say that the data is useful. These are the bases
              Cambridge TCG relies on:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Contract</strong> for account,
                order, delivery, trade-in, direct-message and transaction data
                needed to provide something you asked us for.
              </li>
              <li>
                <strong className="text-ink">Legal obligation</strong> for the
                transaction records we must keep for tax and accounting.
              </li>
              <li>
                <strong className="text-ink">Consent</strong> for optional
                analytics and optional publication of your person-facing
                profile, activity or review. These start off. Profile publication
                can be switched off in profile settings, a given review can be
                unpublished from{" "}
                <Link href="/account/reviews" className="text-accent underline">
                  account reviews
                </Link>
                , and analytics can be withdrawn through the persistent Cookie
                settings control. Withdrawing consent does not undo processing
                that was lawful before withdrawal.
              </li>
              <li>
                <strong className="text-ink">Legitimate interests</strong> for
                receiving and correcting feedback, short-lived abuse and
                security controls, trust and fraud assessment, private
                directory-publication receipts, historic verification-case
                handling, and the time-limited privacy-migration rollback ledger.
                The interests are keeping the service and transactions safe,
                responding accurately, proving publication or withdrawal, and
                making a risky migration reversible. We minimise and time-limit
                these records where a schedule exists, do not use them for
                marketing, and do not expose them publicly. You may object and
                ask for human review using the contact details below.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Automated trust and fraud decisions
            </h2>
            <p className="mb-3">
              The trust engine calculates a 0–100 score from completed and
              cancelled trades, reviews, account age, transaction volume,
              verified external reputation, dispute outcomes and unresolved
              medium-or-higher fraud signals. The resulting tier sets per-trade
              and daily limits, payout holds and whether inspection is required.
              A proposed trade above a limit can be refused automatically.
            </p>
            <p className="mb-3">
              Fraud rules look for rapid listing, possible self-trading through
              shared shipping addresses, repeated buyer-favour refunds, sudden
              volume changes, a high-value order on a new account, and
              chargebacks. An unresolved critical signal, or one explicitly
              configured for suspension, can automatically suspend the account.
              Suspension blocks trading and messaging and removes public person
              surfaces. A signal is an indicator, not proof of wrongdoing.
            </p>
            <p>
              The account owner can inspect active flags at{" "}
              <Link href="/account/standing" className="text-accent underline">
                /account/standing
              </Link>{" "}
              and the trust breakdown in their account. Ask for human review,
              supply context, or challenge a limit or suspension through the
              contact details above. A human can clear signals and reverse a
              suspension.
            </p>
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
              tracking. Use the Cookie settings control fixed to the site after
              any decision to reopen the choice or withdraw analytics consent.
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
                <strong className="text-ink">Direct messages</strong>: currently
                kept until either participant&apos;s account is deleted. Archiving
                is not deletion. There is not yet a per-thread delete or shorter
                automatic retention job; this is a named gap, and you can ask
                for manual deletion subject to dispute, safety and legal needs.
              </li>
              <li>
                <strong className="text-ink">Historic identity verification</strong>:
                the current system has no adequate automatic retention schedule,
                which is one reason intake is paused. Existing details stay
                restricted to owner and authorised-operator application reads
                until manually deleted or a reviewed schedule is shipped.
                Contact us to request deletion; transaction records required by
                law are handled separately.
              </li>
              <li>
                <strong className="text-ink">Trust and fraud profiles</strong>:
                kept while the account exists so limits, unresolved safety
                signals and prior resolutions remain consistent. They are
                removed with account deletion; underlying transaction records
                may remain for six years where accounting, disputes or legal
                claims require them. You can request restriction or human review
                without deleting the account.
              </li>
              <li>
                <strong className="text-ink">Analytics data</strong>: held by
                Google under their retention settings; we keep no copy.
              </li>
              <li>
                <strong className="text-ink">Hosting request metadata</strong>:
                handled under the hosting provider&apos;s security and retention
                settings. Cambridge does not copy bot User-Agent/contact data
                into its own application database.
              </li>
              <li>
                <strong className="text-ink">Contact and feedback content</strong>:
                scheduled for automatic content and contact redaction 180 days
                after receipt.
                The maintenance job removes the message, optional name, reply
                address and free-text operator notes. It keeps a minimal audit
                row — reference, kind, status, dates and any resolving commit —
                as pseudonymised personal data until the whole row is deleted
                two years after receipt.
              </li>
              <li>
                <strong className="text-ink">Abuse counters</strong>:
                fixed minute, hour and day buckets are retained for at most two
                complete windows: up to two minutes, two hours or two days.
                The maintenance job deletes expired buckets in bounded batches.
              </li>
              <li>
                <strong className="text-ink">Legacy network identifiers</strong>:
                migration 0119 deletes the old unsalted agent-registration IP
                hashes and clears legacy unsubscribe IP/User-Agent fields. The
                maintenance job continuously clears either legacy schema during
                the migration-to-deploy compatibility window; those values are
                intentionally unrecoverable.
              </li>
              <li>
                <strong className="text-ink">Directory receipt actor ids</strong>:
                removed automatically 180 days after each listing or withdrawal
                action, or earlier when the account is deleted. The remaining
                slug, notice version, action and timestamp are pseudonymised
                personal data; the whole receipt is deleted after two years.
              </li>
              <li>
                <strong className="text-ink">Privacy-reset rollback ledger</strong>:
                dropped from the active database no later than 30 days after
                migration 0117 is applied, once release checks close the rollback
                window. Snapshot copies age out under the configured encrypted
                backup schedule; production application is blocked until that
                schedule is recorded.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">Your rights</h2>
            <p className="mb-3">
              Under UK data-protection law, where applicable, you can ask for
              access, correction, deletion, restriction or portability; object
              to legitimate-interests processing; withdraw consent; and ask for
              human intervention or challenge an automated decision. We will
              keep what tax law or a legal claim requires and explain any
              refusal. Use the{" "}
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
            <p>
              You can also complain to the UK Information Commissioner&apos;s
              Office through{" "}
              <a
                href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/"
                className="text-accent underline"
              >
                the ICO complaint service
              </a>.
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
