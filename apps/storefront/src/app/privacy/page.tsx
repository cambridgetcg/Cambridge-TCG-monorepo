import Link from "next/link";
import { Callout } from "@/lib/ui";
import {
  ACTIVITY_PUBLICATION_NOTICE,
  PERSON_PUBLICATION_NOTICE,
} from "@/lib/social/publication";

/**
 * /privacy — the operational privacy notice for the storefront.
 *
 * Claims here are deliberately tied to current product behaviour. Where a
 * retention or cleanup process is not automated, the notice says so.
 */

export const metadata = {
  title: "Privacy — Cambridge TCG",
  description:
    "How Cambridge TCG Limited uses personal data, why, who receives it, how long it is kept, and your UK data-protection rights.",
};

const headingClass =
  "text-lg font-display font-semibold text-ink mb-3 scroll-mt-24";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-ink mb-2">
          Privacy notice
        </h1>
        <p className="text-sm text-ink-faint mb-4">
          Last updated 2 September 2026.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed mb-8">
          This notice explains what Cambridge TCG does with personal data on
          this website, including account, marketplace, community, optional
          verification, testnet-wallet and PRISM Signals Telegram-preview
          features. It also explains which choices make information public.
        </p>

        <Callout tone="note" title="At a glance">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              We use account, contact and transaction data to provide sign-in,
              trading, fulfilment, support, safety and record-keeping.
            </li>
            <li>
              Open market orders are public by design. Profiles, activity, decks
              and organisation-directory entries have separate publication
              choices, described below.
            </li>
            <li>
              Cambridge identity verification and testnet wallet linking are
              optional. New identity submissions are paused unless the private
              storage process has passed review; wallet linking moves no money.
            </li>
            <li>
              Production defaults new account registration and new peer-to-peer
              commitments to paused. Existing account sign-in, fulfilment and
              remedies remain available; the release controls are not proof of
              age or terms acceptance.
            </li>
            <li>
              Automated rules can affect limits, routes, inspection and payout
              timing. You can ask for an explanation and human review when a
              rule blocks or materially changes a service.
            </li>
            <li>
              We do not sell personal data or run advertising trackers. Email
              the privacy contact to ask a question, exercise a right or make a
              data-protection complaint.
            </li>
          </ul>
        </Callout>

        <nav
          aria-label="Privacy notice contents"
          className="rounded-lg border border-border-subtle bg-surface-subtle p-4 mb-8 text-sm"
        >
          <p className="font-semibold text-ink mb-2">On this page</p>
          <ul className="grid gap-1 sm:grid-cols-2 list-disc pl-5 text-ink-muted">
            <li>
              <a className="text-accent underline" href="#controller">
                Controller and contact
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#data">
                Data we use
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#choices">
                Required and optional data
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#purposes">
                Purposes and lawful bases
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#automated-rules">
                Automated rules and review
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#publication">
                Public features and choices
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#wallets">
                Wallet proofs
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#prism-signals-telegram">
                PRISM Telegram preview
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#not-collected">
                What we do not collect
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#recipients">
                Recipients and transfers
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#cookies">
                Cookies and browser storage
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#retention">
                Retention
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#children">
                Children
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#paused-and-legacy">
                Paused and legacy data
              </a>
            </li>
            <li>
              <a className="text-accent underline" href="#rights">
                Your rights
              </a>
            </li>
          </ul>
        </nav>

        <div className="space-y-10 text-ink-muted text-sm leading-relaxed">
          <section id="controller" className="scroll-mt-24">
            <h2 className={headingClass}>Controller and privacy contact</h2>
            <p>
              <strong className="text-ink">Cambridge TCG Limited</strong>{" "}
              (company number 15680297) is the controller for the processing
              described here. Our registered office is 60 Tottenham Court Road,
              Suite 4583a, Fitzrovia, London, United Kingdom, W1T 2EW.
            </p>
            <p className="mt-3">
              For a privacy question, rights request, public-data correction or
              removal request, email{" "}
              <a
                href="mailto:support@cambridgetcg.com"
                className="text-accent underline"
              >
                support@cambridgetcg.com
              </a>
              . Please put &ldquo;privacy&rdquo; in the subject where practical.
            </p>
          </section>

          <section id="data" className="scroll-mt-24">
            <h2 className={headingClass}>Personal data we use</h2>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <strong className="text-ink">Account and sign-in data:</strong>{" "}
                email address, username, display/profile fields, settings,
                functional-cookie choices and account state. Sign-in uses an
                emailed magic link, so Cambridge TCG stores no account password.
                A one-time token is stored with the email that requested it. If
                Google sign-in is configured and you choose it, Google supplies
                the verified email, name, profile image and provider-account
                identifier; the account link can also store OAuth access,
                refresh and ID tokens, scope, type and expiry/session metadata.
              </li>
              <li>
                <strong className="text-ink">Communications:</strong> direct
                messages, support correspondence, notification preferences and
                the context needed to answer or moderate them. Direct messages
                are available to their participants and authorised support
                tools; a relevant counterparty may start a conversation in the
                situations described in the publication section below.
              </li>
              <li>
                <strong className="text-ink">
                  Orders and peer transactions:
                </strong>{" "}
                products or cards, listings, bids, swaps, prices and payouts,
                names, delivery addresses, shipping and tracking details,
                transaction status, messages, dispute material and evidence. A
                seller, buyer or swap counterparty receives the details needed
                to fulfil the transaction. A Cambridge-verification or escrow
                flow may instead direct a shipment to Cambridge TCG.
              </li>
              <li>
                <strong className="text-ink">
                  Stripe payments and payouts:
                </strong>{" "}
                Stripe receives payment-card and checkout details. Cambridge TCG
                receives transaction, customer, session, payment, refund and
                dispute identifiers and statuses, but not the full card number.
                The retired paid-membership system may also retain the card
                brand and last four digits that Stripe supplied for the former
                account billing display; Cambridge TCG does not retain the full
                card number. Sellers who start Stripe Connect onboarding give
                Stripe identity, business, bank-account and payout information;
                Cambridge TCG stores the connected-account identifier,
                capability/status and transfer records needed to operate
                payouts.
              </li>
              <li id="identity-verification" className="scroll-mt-24">
                <strong className="text-ink">
                  Optional Cambridge identity verification:
                </strong>{" "}
                new submissions and document uploads are paused by default. A
                deployment can enable them only after an explicit private
                storage review. When enabled, the flow accepts full legal name,
                date of birth, UK address, optional phone number, and uploaded
                government-identity, proof-of-address or other supporting
                image/PDF files selected by the participant. It rejects bank
                details. Earlier submissions may still contain a sort code,
                account number and account name until reviewed cleanup or a
                valid deletion request. Existing owner-scoped document reads and
                deletion remain available while new submission is paused. A
                legacy file reference that does not match the account that owns
                the record is not opened and needs support-assisted inventory
                and removal. Authorised administrators can review the submission
                and outcome. Files are stored with our AWS infrastructure. This
                is separate from Stripe Connect verification and currently has
                no automatic effect on trading or trust presentation.
              </li>
              <li>
                <strong className="text-ink">
                  Optional external reputation:
                </strong>{" "}
                the marketplace, public profile URL or username, a verification
                code, public profile facts returned by the named marketplace,
                check times and result. Cambridge TCG fetches the user-nominated
                public profile and may recheck it about every 90 days. A
                verified result can contribute to the displayed trust score.
              </li>
              <li>
                <strong className="text-ink">
                  Collector and community data:
                </strong>{" "}
                private collection and wishlist records, explicit trade intent,
                follows, blocks, reviews, trust and moderation state, showcase
                cards, achievements and the separately controlled publication
                receipts described below. Private collections and wishlists are
                not made public by a profile-publication choice.
              </li>
              <li>
                <strong className="text-ink">
                  Collectives and directory data:
                </strong>{" "}
                organisation slug, name, kind, region, languages, description,
                house rules, steward account, members, invites and publication
                settings. Steward and membership records remain in account
                management; the public directory query does not select them.
              </li>
              <li>
                <strong className="text-ink">Saved and public decks:</strong> a
                signed-in deck save stores its identifier and slug, name,
                leader, card entries and quantities, notes, tags, public/private
                flag, view count and record times. The private card snapshot can
                contain catalog image and price fields. Public deck responses
                withhold those image/price values and the author account ID, as
                explained in the publication section below.
              </li>
              <li>
                <strong className="text-ink">Testnet wallet-link data:</strong>{" "}
                the public Base Sepolia address and the detailed proof records
                explained in the wallet section below. A public blockchain
                address can be correlated with the Cambridge account that links
                it, even though Cambridge does not publish a wallet directory.
              </li>
              <li>
                <strong className="text-ink">
                  Requests, security and logs:
                </strong>{" "}
                IP address, User-Agent/browser description, request time, route,
                response and rate-limit or security events may be processed in
                infrastructure, access and security logs. Cambridge TCG does not
                create an application-level analytics profile from ordinary page
                visits, but hosting and security logs can still exist.
              </li>
              <li id="prism-signals-telegram" className="scroll-mt-24">
                <strong className="text-ink">
                  Optional PRISM Signals Telegram preview:
                </strong>{" "}
                if the preview is configured and you open its bot, Telegram
                sends Cambridge TCG a webhook update that can contain a Telegram
                user/profile identifier, profile or display-name fields,
                private-chat identifier, message and command text,
                update/message identifiers, language or username fields
                Telegram includes, and—if misrouted—payment or refund fields.
                Cambridge verifies the webhook secret, reads at most 32
                KiB, uses only the update id, private-chat or pre-checkout id,
                chat type, bounded command text, and presence of payment fields
                needed for the fixed response, and processes them in memory.
                This preview creates no application
                database row, account link, analytics profile, entitlement or
                payment record. Vercel can still process ordinary access and
                security metadata. Telegram separately processes the bot chat
                and update under its own service and privacy terms. Do not use
                the preview for personal, card, listing, seller or payment
                information.
              </li>
              <li>
                <strong className="text-ink">
                  Optional collector observations:
                </strong>{" "}
                the owner-only witness notebook contains the card SKU, action,
                amount and currency, condition, date, sharing choice and
                optional SHA-256 fingerprint. Non-private sharing modes record
                permission for a possible future projector only. Raw rows remain
                owner-only, public projection is paused and no aggregate has
                been released.
              </li>
              <li>
                <strong className="text-ink">Coverage Hunt records:</strong>{" "}
                voluntarily submitted words, citation pointers, role and time;
                its history stores no operator email or user ID.
              </li>
            </ul>
            <p className="mt-4">
              Most data comes from you. We also receive transaction and status
              data from Stripe, fulfilment or dispute information from a trading
              counterparty, optional account/profile and OAuth data from Google
              when you choose configured Google sign-in, public facts from a
              marketplace profile you ask us to check, wallet-verification
              results from the configured RPC service where needed, an optional
              Telegram update when you choose the configured PRISM preview bot,
              and records created by our own service.
            </p>
          </section>

          <section id="choices" className="scroll-mt-24">
            <h2 className={headingClass}>
              What is required and what is optional
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                An email and functional sign-in data are required to create and
                use an account. Without them, you can still browse public pages
                but cannot use account tools.
              </li>
              <li>
                Transaction, payment and delivery details are required only when
                you request the relevant order, trade, auction, swap, payout or
                shipped reward. Without the required details, Cambridge TCG or
                the counterparty cannot complete that service.
              </li>
              <li>
                Information required for tax, fraud, sanctions, accounting or
                other legal checks must be provided where that obligation
                applies; the transaction or payout may be refused or paused if
                it is missing.
              </li>
              <li>
                Google sign-in is optional when it is configured. You can use
                the email magic-link route instead; declining Google changes no
                other account feature.
              </li>
              <li>
                Public profile, review and activity publication, messaging,
                collective-directory listing, Cambridge identity verification,
                external-reputation checks, saved/public decks, collector
                observations and future-projector permission, and testnet wallet
                links are optional. Declining affects only that feature or any
                trust contribution expressly attached to it.
              </li>
              <li>
                Do not include personal data about another person in collective
                directory fields. A steward cannot make that acceptable merely
                by selecting the publication checkbox.
              </li>
            </ul>
          </section>

          <section id="purposes" className="scroll-mt-24">
            <h2 className={headingClass}>
              Why we use data and our lawful bases
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-ink">
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 font-semibold">UK GDPR lawful basis</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Create an account, authenticate, communicate and provide
                      requested account tools.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Contract</strong>, including
                      steps you request before entering one.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Receive and answer an optional PRISM Signals Telegram
                      synthetic-preview command and protect the webhook from
                      unauthorised submissions.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Legitimate interests</strong>{" "}
                      in responding to the low-impact voluntary preview
                      interaction you initiate and in authenticating, bounding
                      and securing the test route. The necessity and balancing
                      safeguards are recorded in the PRISM product-flow
                      methodology. No payment or entitlement contract is formed.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Operate orders, trades, auctions, swaps, shipping, escrow,
                      refunds and payouts.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Contract</strong>; and{" "}
                      <strong className="text-ink">legal obligation</strong>{" "}
                      where payment, tax, accounting or regulatory rules apply.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Publish any bid or ask that remains open so collectors can
                      discover its terms, respond and see market depth.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Contract</strong>, including
                      the open-order service you request; and{" "}
                      <strong className="text-ink">legitimate interests</strong>{" "}
                      in operating a transparent peer-to-peer order book where
                      contract is not the applicable basis. This necessary
                      order-book publication is not treated as consent to the
                      separate profile, activity or directory features.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Keep tax, company and transaction records and respond to
                      lawful requests.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Legal obligation</strong>.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Prevent abuse, secure sign-in, rate-limit, investigate
                      replay, fraud, disputes and legal claims, moderate, and
                      maintain service reliability.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Legitimate interests</strong>{" "}
                      in protecting users, transactions, Cambridge TCG and the
                      service; and legal obligation where applicable.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Publish a profile, review, milestone activity or
                      collective-directory listing you separately switch on.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Consent</strong>, recorded
                      per purpose and notice version. You can withdraw it for
                      future Cambridge publication.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Save a private deck or owner-only collector observation;
                      publish a deck; or record permission for a possible future
                      collector-observation projector.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Contract</strong> for the
                      requested private save/notebook;{" "}
                      <strong className="text-ink">consent</strong> for public
                      deck publication or future-projector eligibility. No
                      collector-observation projector is active now.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Perform optional Cambridge identity verification or a
                      nominated external-reputation check.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Consent</strong> for an
                      enabled optional submission/check;{" "}
                      <strong className="text-ink">legitimate interests</strong>{" "}
                      in reviewing authenticity and preventing fraud for review
                      and audit records.
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-3 pr-4">
                      Link and verify a Base Sepolia testnet wallet.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Consent</strong> for the
                      optional link;{" "}
                      <strong className="text-ink">legitimate interests</strong>{" "}
                      for bounded attempts, replay investigation and proof
                      audit.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4">
                      Remember functional preferences and keep the application
                      working.
                    </td>
                    <td className="py-3">
                      <strong className="text-ink">Contract</strong> and{" "}
                      <strong className="text-ink">legitimate interests</strong>{" "}
                      in a usable, secure service; cookies are used only where
                      necessary or requested.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Our legitimate interests are service and transaction security,
              fraud and abuse prevention, dispute handling, moderation,
              reliability, record integrity and the defence of legal claims. We
              consider whether those interests can be achieved with less data
              and the likely effect on people. You can object; we will reassess
              the balance unless the law requires the processing or compelling
              grounds override the objection.
            </p>
          </section>

          <section id="automated-rules" className="scroll-mt-24">
            <h2 className={headingClass}>Automated rules and human review</h2>
            <p>
              Cambridge TCG uses rules to calculate and present trust scores and
              tiers; set transaction limits, escrow routes, physical-inspection
              requirements, trust-based commission rates and payout holds;
              enforce auction, payment and trade states; match only explicit
              card-level trade intent; apply rate limits; and raise security,
              fraud or moderation flags. Inputs can include account age and
              state, completed or cancelled transactions, trading volume,
              trust-weighted reviews, verified external reputation, returns,
              disputes and chargebacks, transaction value, card category,
              explicit listing/wishlist choices and risk signals.
            </p>
            <p className="mt-3">
              Fraud signals have a specific automatic downstream effect. Each
              unresolved signal at medium, high or critical severity subtracts
              20 points the next time the trust score is calculated. A lower
              result can reduce per-transaction and daily limits, change the
              displayed tier or trust-based commission rate, route a future
              trade through stricter escrow or inspection, and lengthen a hold
              on a future seller payout. The signal row&rsquo;s stored{" "}
              <code className="text-ink">auto_action</code> label is not itself
              executed: current detection does not directly suspend the account
              or stop an already-earned payout. An operator can resolve or
              dismiss a signal; recalculating the score then removes that
              signal&rsquo;s 20-point deduction.
            </p>
            <p className="mt-3">
              A rule can reject or limit an action, change the route or terms of
              a trade, require inspection or escrow, delay a payout, change
              trust presentation, or affect whether a listing/account is
              discoverable. Whether an outcome has a legal or similarly
              significant effect depends on its real context and impact;
              Cambridge TCG does not treat this list as a conclusion that the
              statutory safeguards for solely automated decisions can never
              apply. If a rule blocks or materially changes a service, email the
              privacy contact to request an explanation and human review,
              express your view, or challenge inaccurate input data. Where those
              statutory safeguards apply, the review must be capable of
              correcting inputs and changing the outcome rather than merely
              repeating the automated result.
            </p>
            <p className="mt-3">
              There is not yet a durable in-product decision-review case queue,
              assigned reviewer or published service level. Email is the current
              request channel, but a support link alone is not evidence that
              human intervention is operational. For that reason, production
              rejects new orders, offers and acceptances, auction commitments,
              swaps, lot commitments and automatic pricing-rule commitments by
              default. The pause does not block payment, shipping, receipt,
              cancellation, return, dispute, refund, payout, evidence or
              revocation steps for an existing obligation.
            </p>
          </section>

          <section id="publication" className="scroll-mt-24">
            <h2 className={headingClass}>
              Public features, choices and their reach
            </h2>
            <div id="market-orders" className="scroll-mt-24">
              <h3 className="font-semibold text-ink mb-2">
                Open bids and asks
              </h3>
              <p>
                Any part of a bid or ask that remains open is published without
                sign-in because public discovery is the service requested when
                an open order is placed. The aggregate order book identifies the
                card/SKU and side and, at each price, the total remaining
                quantity and number of orders. It also exposes best-bid,
                best-ask and derived book values such as spread. Aggregate price
                levels do not include individual order IDs or account identity.
              </p>
              <p className="mt-3">
                Bids are not returned as individual public rows; only aggregate
                bid values are public. To support negotiation, the individual-
                ask response returns the SKU and, for each ask, its listing ID,
                price, remaining quantity, condition, offer setting, return
                setting and return window, creation time and a listing-scoped
                contact-availability flag. A signed-in viewer can also be told
                whether an ask is their own. The response does not return the
                seller&rsquo;s account/user ID, username, name, profile, email,
                trust dossier, private notes, payment details or delivery
                address.
              </p>
              <p className="mt-3">
                Once an order is cancelled, completely filled or expired,
                Cambridge TCG stops serving it in future open-order responses.
                Cambridge TCG cannot recall copies already fetched, cached,
                indexed or redistributed by someone else. Do not place an open
                order if you do not want its terms published in this way.
              </p>
            </div>

            <div id="person-publication" className="scroll-mt-24 mt-6">
              <h3 className="font-semibold text-ink mb-2">
                Profile, messaging and reviews
              </h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Profiles are private by default.{" "}
                  {PERSON_PUBLICATION_NOTICE.profile}
                </li>
                <li>
                  Direct messages are off by default and are a separate choice.{" "}
                  {PERSON_PUBLICATION_NOTICE.messaging}
                </li>
                <li>
                  Each review is private by default.{" "}
                  {PERSON_PUBLICATION_NOTICE.review}
                </li>
                <li>{PERSON_PUBLICATION_NOTICE.withdrawal}</li>
              </ul>
            </div>

            <div id="activity-publication" className="scroll-mt-24 mt-6">
              <h3 className="font-semibold text-ink mb-2">
                Community-feed activity
              </h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>{ACTIVITY_PUBLICATION_NOTICE.activity}</li>
                <li>{ACTIVITY_PUBLICATION_NOTICE.ranking}</li>
                <li>{ACTIVITY_PUBLICATION_NOTICE.withdrawal}</li>
              </ul>
            </div>

            <div id="deck-publication" className="scroll-mt-24 mt-6">
              <h3 className="font-semibold text-ink mb-2">Public decks</h3>
              <p>
                Saved decks are private unless their owner selects
                &ldquo;Publish to community&rdquo;. A public deck is listed at{" "}
                <Link href="/decks" className="text-accent underline">
                  /decks
                </Link>{" "}
                and available through unauthenticated list and full-deck APIs.
                Anyone can read and copy it. The public list includes the deck
                identifier and slug, name, leader/card summary, tags, view count
                and update time. The full public response includes its card
                identities and quantities, notes, tags, view count and update
                time. Stored catalog price and image snapshot values are
                withheld from these public responses, and the author account ID
                is not returned.
              </p>
              <p className="mt-3">
                Opening a full public-deck API response increments its aggregate
                view count; the current counter is not deduplicated by session.
                Unpublishing stops Cambridge TCG serving the deck through the
                public page and APIs but cannot recall a copy already fetched.
                Delete the deck to remove its saved row. Do not put another
                person&rsquo;s personal data in a deck name, note or tag.
              </p>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-ink mb-2">
                Collective profile and organisation directory
              </h3>
              <p>
                A public collective profile and inclusion in the organisation
                directory are separate choices. A public profile is available at
                its <code className="text-ink">/c/…</code> address. The
                directory adds searchable HTML and a public JSON API containing
                the slug, display name, kind, region, languages, description,
                house rules, and platform-record creation and update times.
                Names and descriptions are searchable; kind, region and language
                are filters. Existing public profiles are not listed
                automatically.
              </p>
              <p className="mt-3">
                Anyone can view directory material. Search engines, AI crawlers
                and other third parties may index, copy or redistribute it.
                Turning the listing off stops future directory responses but
                leaves the public profile visible; making the profile private
                also clears the listing. Cambridge TCG cannot recall copies
                already fetched. Do not include personal data about another
                person in directory fields. For correction or removal, turn the
                listing off or email the privacy contact. Read the{" "}
                <Link
                  href="/methodology/community-directory"
                  className="text-accent underline"
                >
                  directory publication contract
                </Link>
                .
              </p>
            </div>

            <p className="mt-4">
              For versioned person, activity and directory choices, Cambridge
              TCG stores the current notice version and acceptance time while
              the choice is on. Deck publication currently stores an unversioned
              public/private flag and deck update time, not a separate notice
              receipt. Withdrawal stops future publication by Cambridge TCG and
              clears an active receipt where the feature is designed that way;
              it cannot make someone else forget, return or delete a copy they
              already obtained.
            </p>
          </section>

          <section id="wallets" className="scroll-mt-24">
            <h2 className={headingClass}>
              Testnet wallet links and RPC disclosure
            </h2>
            <p>
              Wallet linking is optional and currently limited to Base Sepolia;
              Cambridge TCG does not accept assets through this feature. We keep
              the public Base Sepolia address, chain, proof method, verification
              times, signature fingerprint, and the exact five-minute standard
              wallet-signing message (EIP-4361), including its one-use code and
              random request identifier. We also keep the bounded
              verification-attempt count and attempt times. A separate one-way
              digest binds the challenge to the Cambridge sign-in session; that
              digest is not placed in the wallet-visible message. The raw
              session token and wallet signature are not retained. This proof is
              not identity, KYC, asset ownership, or permission to move funds;
              it shows only control of the address at that time.
            </p>
            <p className="mt-3">
              A public blockchain address and its public activity may be
              correlated with the Cambridge account that links it. Cambridge TCG
              first checks an ordinary wallet signature locally. Only after that
              fails does the configured Base Sepolia network service receive the
              public address to check whether it belongs to a smart wallet. It
              receives the exact challenge message and submitted signature only
              when the address has deployed smart-wallet code or the signature
              contains a locally recognised smart-wallet marker (ERC-6492).
              Cambridge first checks that the service reports Base Sepolia.
              Cambridge TCG will not enable remote smart-wallet verification
              unless the wallet screen identifies the configured RPC provider
              and links its privacy information before a submission can call it.
              If no provider is explicitly and validly configured, smart-wallet
              verification stops instead of using an unnamed default. The wallet
              feature may remain disabled until these conditions are met.
            </p>
          </section>

          <section id="not-collected" className="scroll-mt-24">
            <h2 className={headingClass}>What we do not collect or do</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Cambridge TCG stores no account password and does not receive
                the full payment-card number entered in Stripe Checkout.
              </li>
              <li>
                We do not sell personal data or share it for third-party
                advertising.
              </li>
              <li>
                We run no marketing, advertising or third-party analytics
                cookies on the storefront.
              </li>
              <li>
                We do not retain a wallet seed phrase, private key, balance or
                submitted signature.
              </li>
              <li>
                If you select a witness-notebook receipt, the browser computes a
                SHA-256 fingerprint locally; the receipt file, merchant, name,
                location and free-text notes are not sent to Cambridge TCG.
              </li>
            </ul>
          </section>

          <section id="recipients" className="scroll-mt-24">
            <h2 className={headingClass}>Who receives data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Google</strong> receives an OAuth
                sign-in request when Google is configured and you choose that
                button. It returns the account/profile and OAuth material
                described above. Google also processes ordinary request and
                device metadata under its own{" "}
                <a
                  href="https://policies.google.com/privacy"
                  className="text-accent underline"
                >
                  privacy policy
                </a>
                .
              </li>
              <li>
                <strong className="text-ink">Stripe</strong> receives payment,
                checkout and, where requested, Connect identity, bank and payout
                onboarding data. Stripe may act as a controller for parts of its
                regulated payment and verification processing. See
                Stripe&rsquo;s{" "}
                <a
                  href="https://stripe.com/gb/legal/privacy-center"
                  className="text-accent underline"
                >
                  privacy centre
                </a>
                .
              </li>
              <li>
                <strong className="text-ink">Amazon Web Services</strong> hosts
                database and object-storage workloads, including optional
                identity documents, and may send service email through SES. A
                separately configured email-delivery service receives addresses
                and message content when it is used instead.
              </li>
              <li>
                <strong className="text-ink">Vercel</strong> hosts the web
                application and processes ordinary network, access and security
                request metadata.
              </li>
              <li>
                <strong className="text-ink">Telegram</strong> receives and
                processes your interaction when you choose to open or message
                the configured PRISM preview bot, and sends the resulting update
                to Cambridge TCG&apos;s Vercel-hosted webhook. Telegram is an
                independent service; see its{" "}
                <a
                  href="https://telegram.org/privacy"
                  className="text-accent underline"
                >
                  privacy policy
                </a>
                . No Telegram bot is advertised unless the separate fixture
                configuration and clean non-payment/privacy-wired posture are
                present.
              </li>
              <li>
                <strong className="text-ink">
                  A configured Base Sepolia RPC provider
                </strong>{" "}
                receives the limited wallet-verification data described above
                when remote verification is required. Cambridge TCG will keep
                that remote path disabled unless the wallet screen names the
                active provider and links its privacy information before the
                request.
              </li>
              <li>
                <strong className="text-ink">Transaction counterparties</strong>{" "}
                receive the names, delivery addresses, tracking, messages and
                dispute/fulfilment information necessary for the relevant peer
                trade, auction or swap. Cambridge TCG provides it for that
                transaction; a counterparty is independently responsible for any
                later use it makes of the information.
              </li>
              <li>
                <strong className="text-ink">A marketplace you nominate</strong>{" "}
                receives ordinary request metadata when Cambridge TCG checks the
                public profile URL for external reputation.
              </li>
              <li>
                <strong className="text-ink">The public</strong>, search
                engines, crawlers and third parties receive only material you
                separately choose to publish, subject to the boundaries above.
              </li>
              <li>
                Professional advisers, insurers, payment/fraud partners, courts,
                regulators or law-enforcement bodies may receive relevant data
                where necessary for advice, a claim, security, fraud prevention
                or a legal obligation.
              </li>
            </ul>

            <h3 className="font-semibold text-ink mt-6 mb-2">
              International transfers
            </h3>
            <p>
              Suppliers and infrastructure may process data outside the United
              Kingdom. In particular, some Cambridge database and object storage
              currently uses AWS in the United States, while Google, AWS, Vercel
              and Stripe operate international services and subprocessors. Their
              provider terms state that a recognised mechanism applies where UK
              restricted-transfer rules require one, such as UK adequacy
              regulations, the UK International Data Transfer Agreement or UK
              Addendum to standard contractual clauses, as applicable, together
              with contractual and security measures. Cambridge TCG relies on
              those terms for these services. The applicable route can vary by
              provider and subprocessor. Provider information is available in
              the{" "}
              <a
                href="https://aws.amazon.com/compliance/gdpr-center/"
                className="text-accent underline"
              >
                AWS GDPR centre
              </a>
              ,{" "}
              <a
                href="https://vercel.com/legal/dpa"
                className="text-accent underline"
              >
                Vercel DPA
              </a>,{" "}
              <a
                href="https://telegram.org/privacy"
                className="text-accent underline"
              >
                Telegram privacy policy
              </a>{" "}
              and{" "}
              <a
                href="https://stripe.com/gb/legal/privacy-center"
                className="text-accent underline"
              >
                Stripe privacy centre
              </a>
              . Contact us for the current safeguard relevant to your data.
            </p>
          </section>

          <section id="cookies" className="scroll-mt-24">
            <h2 className={headingClass}>Cookies and browser storage</h2>
            <p className="mb-3">
              The storefront uses functional cookies to provide a requested
              service or remember a choice:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Auth.js cookies</strong> — a
                session token keeps you signed in; temporary CSRF, callback and
                sign-in cookies protect and complete authentication. The
                session-token cookie is configured for a maximum of 30 days and
                is removed earlier on sign-out or expiry. Auth.js uses names in
                the <code className="text-ink">authjs.*</code> family, including{" "}
                <code className="text-ink">authjs.session-token</code>,{" "}
                <code className="text-ink">authjs.csrf-token</code> and{" "}
                <code className="text-ink">authjs.callback-url</code>. Optional
                Google sign-in can also use state, nonce and PKCE cookies; all
                three have a 15-minute maximum, while the other temporary
                cookies end with their browser session or sign-in flow. Secure
                production names may use{" "}
                <code className="text-ink">__Secure-</code> or{" "}
                <code className="text-ink">__Host-</code> prefixes.
              </li>
              <li>
                <strong className="text-ink">display-currency</strong> —
                remembers the requested display currency for up to one year.
              </li>
              <li>
                <strong className="text-ink">text-mode</strong> and{" "}
                <strong className="text-ink">lang-mode</strong> — remember
                reading and language-display choices for up to one year.
              </li>
              <li>
                <strong className="text-ink">theme</strong> and{" "}
                <strong className="text-ink">tone</strong> — remember an
                explicit visual theme and writing-style choice for up to one
                year; choosing defaults removes them.
              </li>
              <li>
                <strong className="text-ink">banner-dev-notice</strong> —
                remembers a dismissed site notice until the browser closes.
              </li>
              <li>
                <strong className="text-ink">ctcg-guest-id</strong> — a retired
                PVE guest cookie. Current code does not use it and expires it
                when the PVE status endpoint is visited.
              </li>
            </ul>
            <h3 className="font-semibold text-ink mt-5 mb-2">
              Browser local storage
            </h3>
            <p>
              The storefront also uses first-party <code>localStorage</code>,
              which stays in that browser rather than being attached to every
              web request. Current application code does not write to{" "}
              <code className="text-ink">sessionStorage</code> or IndexedDB. The
              local-storage records are:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <code className="text-ink">market.listing-draft.v1</code> — the
                selected card and catalog snapshot, condition, intended price
                and quantity, return choice and save time. It is removed when
                the listing is posted or you reset or replace the draft.
              </li>
              <li>
                <code className="text-ink">ctcg-deck-builder-decks</code> —
                locally saved deck names, leaders, cards, quantities, catalog
                image/price snapshots and save times. For a signed-in person,
                choosing Save also sends the deck to Cambridge TCG for the
                cross-device saved-deck feature described above.
              </li>
              <li>
                <code className="text-ink">ctcg-practice-battle</code>,{" "}
                <code className="text-ink">ctcg-practice-clears</code> and{" "}
                <code className="text-ink">ctcg-practice-starter</code> — local
                practice-game state, cleared level numbers and the last starter
                choice.
              </li>
              <li>
                <code className="text-ink">account.handle-welcome.v1:*</code> —
                a per-handle marker that prevents the same welcome note from
                appearing again after you dismiss it.
              </li>
              <li>
                <code className="text-ink">cambridgetcg_cart</code> — a retired
                retail-cart key that current code does not create and removes
                when the order-confirmation cleanup runs.
              </li>
            </ul>
            <p className="mt-3">
              Local storage has no time-based expiry. A record remains until the
              relevant feature overwrites or removes it, you clear this
              site&rsquo;s browser data, or the browser evicts it. Cambridge TCG
              does not automatically receive a listing draft, local deck or
              practice state merely because it is in local storage; relevant
              details are sent when you submit a listing, choose a signed-in
              deck save, or otherwise make the corresponding request.
            </p>
            <p className="mt-3">
              No storefront marketing, advertising or third-party analytics
              cookie is currently set, so there is no marketing-cookie consent
              banner. Infrastructure request logs are separate from cookies and
              are described above.
            </p>
          </section>

          <section id="retention" className="scroll-mt-24">
            <h2 className={headingClass}>How long data is kept</h2>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <strong className="text-ink">
                  Orders, payments, trades and accounting records:
                </strong>{" "}
                at least six years from the end of the relevant company
                financial year, and longer where a law, tax enquiry, dispute or
                legal claim requires it.
              </li>
              <li>
                <strong className="text-ink">
                  Account, messages, social and collective-management data:
                </strong>{" "}
                currently kept with the account until you request deletion;
                Cambridge TCG has not yet implemented an automatic inactive-
                account purge. We may retain a limited record where a legal
                obligation, transaction, safety issue, dispute or legal claim
                requires it.
              </li>
              <li>
                <strong className="text-ink">
                  Google OAuth account links:
                </strong>{" "}
                provider identifiers and returned OAuth/token metadata are kept
                with the linked Cambridge account until unlinking or account
                deletion; an individual token can expire earlier.
              </li>
              <li>
                <strong className="text-ink">
                  PRISM Signals Telegram preview updates:
                </strong>{" "}
                no application record is retained by the current preview; the
                bounded update exists in server memory only while the response
                is formed. Vercel access/security logs and Telegram&apos;s own bot
                chat/update records are separate and governed by those
                providers. A payment-bearing update is not acknowledged by this
                preview, so Telegram may retry it; the preview must be connected
                only to the explicitly declared clean, invoice-free test bot.
              </li>
              <li>
                <strong className="text-ink">
                  Identity verification and external reputation:
                </strong>{" "}
                the verification submission, checks and outcome are currently
                retained with the account and do not yet have a shorter
                automatic deletion schedule. You can delete each current
                identity-document upload or ask us to withdraw/delete optional
                material, including bank fields remaining from an earlier
                submission; a limited fraud, audit or legal-claims record may
                remain where justified. The upload currently stores the file
                before saving its database record. If that second step is
                interrupted, an unindexed file can remain and cannot be removed
                through the ordinary document screen. New uploads stay paused
                until Cambridge TCG has reviewed private storage and an
                abandoned-upload inventory or expiry process; support can also
                arrange an inventory of files stored for the account.
              </li>
              <li>
                <strong className="text-ink">Magic-link tokens:</strong> usable
                for up to 24 hours, deleted when used and pruned in bounded
                batches when a later sign-in request runs cleanup. There is not
                currently a separate maximum time by which every expired row is
                guaranteed to be removed. Issuance is capped at five unexpired
                tokens per email and 500 service-wide; a failed email
                reservation keeps its slot until expiry rather than permitting
                extra sends.
              </li>
              <li>
                <strong className="text-ink">Publication receipts:</strong> kept
                with the account while each choice is on to show the notice
                version and acceptance time. Turning a choice off clears its
                active receipt fields where the feature is designed that way.
              </li>
              <li>
                <strong className="text-ink">Testnet wallet proofs:</strong> a
                challenge can be used for five minutes, but its exact message,
                proof-free verification-attempt records (challenge,
                chain/address key and attempt time), and active or revoked link
                history are currently retained with the account for replay
                investigation and audit. There is no automatic earlier cleanup;
                account deletion removes all three wallet tables. We will
                publish a shorter reviewed schedule before a broader or
                payment-capable rollout.
              </li>
              <li>
                <strong className="text-ink">Saved decks:</strong> kept until
                the owner deletes the deck or the account. Unpublishing keeps
                the saved deck private and stops future public page/API
                responses; it cannot recall earlier copies. The aggregate view
                count remains with the saved deck until deletion.
              </li>
              <li>
                <strong className="text-ink">Collector observations:</strong>{" "}
                kept owner-only until you delete each row or the account.
                Deletion also removes eligibility for any future projector.
                Anonymous/CC0 modes currently store future-projector permission
                only: no public projector reads the table and no aggregate has
                been released.
              </li>
              <li>
                <strong className="text-ink">Coverage Hunt turns:</strong> the
                submitted evidence remains as the game review record. Account
                erasure removes the live agent identity link; later views show a
                deleted actor state. Ordinary agent archive is not erasure.
              </li>
              <li>
                <strong className="text-ink">
                  Infrastructure and security logs:
                </strong>{" "}
                periods vary by provider and log type. The retention decision
                depends on whether the record is still needed to deliver or
                diagnose the service, investigate a specific security or abuse
                event, meet a provider/security requirement, or establish,
                exercise or defend a legal claim. The exact live periods have
                not yet been consolidated into this notice; contact us for the
                current period relevant to a specific request.
              </li>
            </ul>
          </section>

          <section id="children" className="scroll-mt-24">
            <h2 className={headingClass}>Children</h2>
            <Callout tone="warning" title="If you are under 18">
              Please do not create an account or use messaging, social, trading,
              payment, organisation-directory, identity-verification or
              wallet-linking tools. You can view the public catalogue and
              learning pages. Ask a parent or guardian to contact us if you
              think you have already shared personal information here.
            </Callout>
            <p>
              Public catalogue and methodology pages can be viewed by anyone and
              may be accessed by children. Account, messaging, social
              publication, trading, payment, collective-directory publication,
              Cambridge identity-verification and wallet-linking features are
              not designed for people under 18. Cambridge TCG does not currently
              run general age assurance or record a site-wide, versioned
              age-and-terms assent at account creation or before all social
              tools. Production now defaults new account admission and new P2P
              commitments to paused unless an operator selects the exact
              reviewed release mode. That reversible release control is not age
              assurance, so the service still cannot claim that every account
              holder is an adult. When the optional
              identity-verification form is enabled, it rejects a declared date
              of birth under 18; that is not site-wide age verification. A
              person under 18 should not submit personal data to or use those
              account features. A parent or guardian can email the privacy
              contact to ask us to locate and remove a child&rsquo;s data,
              subject to legal retention duties.
            </p>
          </section>

          <section id="paused-and-legacy" className="scroll-mt-24">
            <h2 className={headingClass}>Paused inputs and legacy records</h2>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <strong className="text-ink">Account and P2P admission:</strong>{" "}
                production defaults new account registration and new marketplace
                commitments to paused. Existing-user sign-in and existing
                obligation/remedy steps stay available. The exact reviewed modes
                are deployment controls, not stored proof that a person is over
                18, accepted a particular terms version or received operational
                human intervention.
              </li>
              <li>
                <strong className="text-ink">Identity verification:</strong> new
                submissions and document uploads default to paused and return an
                unavailable response unless the deployment explicitly enables
                reviewed private storage. Existing owner/admin reads and
                owner-requested deletion remain available for owner-scoped
                objects; a legacy key that fails that check is kept closed and
                requires support-assisted storage inventory and removal.
              </li>
              <li>
                <strong className="text-ink">Retired trade-in desk:</strong> the
                Cambridge TCG we-buy desk closed on 6 July 2026. The current{" "}
                <code className="text-ink">/api/tradein/status</code>,{" "}
                <code className="text-ink">/api/tradein/submit</code>,{" "}
                <code className="text-ink">/api/tradein/quote</code>,{" "}
                <code className="text-ink">/api/market/sell-for-credit</code>{" "}
                and <code className="text-ink">/api/quotes</code> paths return
                HTTP 410 before reading submitted content or trade-in database
                records, so they collect no new trade-in submission content.
                Ordinary infrastructure request logs described above can still
                exist. Legacy database schemas remain; this notice does not
                infer from source code alone whether a historical row exists.
                Any historical transaction record, if present, follows the
                transaction-retention and rights rules in this notice.
              </li>
              <li>
                <strong className="text-ink">Retired paid memberships:</strong>{" "}
                the paid-membership interface closed on 21 July 2026. An
                authenticated legacy billing endpoint can still return the
                signed-in account holder&rsquo;s mirrored subscription status,
                plan, tier name, cancellation/expiry timing, card brand and last
                four digits, plus recent invoice summaries and links fetched
                from Stripe when available. It does not return the full card
                number. Every response, including an authentication error, is
                marked private and no-store.
              </li>
              <li>
                <strong className="text-ink">
                  Retired Bounty Board phone submissions:
                </strong>{" "}
                an unfinished pilot accepted phone numbers without proving
                account control. It accepts no new numbers and existing records
                were never treated as verified. A submitted number may remain
                with the account until deletion.
              </li>
              <li>
                <strong className="text-ink">OG claims:</strong> the old form
                accepted email, marketplace, order reference, username and notes
                without proving ownership. New public submissions stop before
                reading the body or claim database. Existing claims remain
                available only to authorised staff for review and
                correction/deletion requests.
              </li>
              <li>
                <strong className="text-ink">
                  Agent feedback and carried state:
                </strong>{" "}
                public write paths are paused. New POSTs stop before body or
                database reads. Older internal rows await a separately reviewed
                cleanup.
              </li>
              <li>
                <strong className="text-ink">PVE:</strong> new durable battles
                and rewards are paused. Existing owner-only progress reads
                remain, while old guest rows await a separate cleanup decision.
              </li>
              <li>
                <strong className="text-ink">One-click unsubscribe:</strong>{" "}
                current requests store the email preference, not request IP or
                browser description, and repeat opt-outs do not create a fresh
                application record. Older audit rows may contain IP and
                User-Agent fields and still need reviewed cleanup.
              </li>
              <li>
                <strong className="text-ink">
                  Incomplete legacy retention:
                </strong>{" "}
                old unsubscribe-audit, OG-claim, agent-feedback, carried-state
                and PVE guest records do not yet share a complete automatic
                retention rule. Cambridge TCG is reviewing cleanup rather than
                claiming it has occurred.
              </li>
            </ul>
          </section>

          <section id="rights" className="scroll-mt-24">
            <h2 className={headingClass}>Your data-protection rights</h2>
            <p className="mb-3">
              Depending on the circumstances, UK data-protection law gives you
              the right to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                access your personal data and receive information about its use;
              </li>
              <li>correct inaccurate data and complete incomplete data;</li>
              <li>
                ask for erasure where no overriding legal reason requires
                retention;
              </li>
              <li>restrict processing in the situations set by law;</li>
              <li>
                object to processing based on legitimate interests and to direct
                marketing (Cambridge TCG does not currently carry out
                direct-marketing profiling);
              </li>
              <li>
                receive data you supplied in a structured, commonly used,
                machine-readable format, and have it transmitted where the
                portability right applies;
              </li>
              <li>
                withdraw consent at any time, without affecting processing
                already lawful before withdrawal; and
              </li>
              <li>
                seek human intervention, express your view and contest a
                qualifying solely automated decision.
              </li>
            </ul>
            <p className="mt-4">
              Email{" "}
              <a
                href="mailto:support@cambridgetcg.com"
                className="text-accent underline"
              >
                support@cambridgetcg.com
              </a>{" "}
              to exercise a right. We may ask for proportionate information to
              verify identity and scope. Rights are not absolute: tax/company
              records, another person&rsquo;s rights, fraud/safety records,
              legal claims and other statutory exceptions can limit a request.
              We normally respond within one month, subject to the extensions
              the law permits for a complex or repeated request.
            </p>
            <h3 className="font-semibold text-ink mt-6 mb-2">
              Data-protection complaints
            </h3>
            <p>
              You can make a complaint about Cambridge TCG&rsquo;s handling of
              personal data through the same privacy email address. Put
              &ldquo;data protection complaint&rdquo; in the subject and explain
              what happened, which data or feature is involved and the outcome
              you seek. Cambridge TCG will acknowledge a data-protection
              complaint within 30 days, make appropriate enquiries, keep you
              informed where the investigation remains open, and communicate the
              outcome without undue delay. A complaint can include a rights
              request; the applicable rights-request time limit remains
              separate.
            </p>
            <p className="mt-3">
              You can also complain to the UK Information Commissioner&rsquo;s
              Office. See the ICO&rsquo;s{" "}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                className="text-accent underline"
              >
                complaint service
              </a>
              . We would welcome the chance to address the issue first, but you
              do not have to contact us before contacting the ICO.
            </p>
            <Callout tone="note" title="Human rights-request workflow">
              There is not yet a single automated export-my-data or
              delete-my-account button. A human scopes and completes the request
              and confirms it by email. Some narrower tools, such as deleting a
              collector observation or switching off a publication choice, are
              available directly in the account interface.
            </Callout>
          </section>
        </div>
      </div>
    </main>
  );
}
