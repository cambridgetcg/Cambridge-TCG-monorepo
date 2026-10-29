import Link from "next/link";
import { PageHeader } from "@/lib/ui/PageHeader";
import { PageLayout } from "@/lib/ui/PageLayout";

export const metadata = {
  title: "Card images and text — Cambridge TCG",
  description: "How Cambridge labels English reference images, carries publisher credit and handles the limits of its existing image and text publication rules.",
};

const headingClass = "mb-3 font-display text-xl font-semibold text-ink";
const linkClass = "text-accent underline underline-offset-4 hover:text-accent-strong";

export default function CardImagesPolicyPage() {
  return (
    <PageLayout width="reading">
      <div lang="en">
        <PageHeader title="Card images and text" description="A picture can help identify a card without proving which printing it shows. Publisher credit and image context belong beside it." />
        <p className="mb-8 text-sm text-ink-faint">Implementation reviewed 29 September 2026; the section on linked CardRush listing images was added 29 October 2026. This records existing project decisions; it is not a new legal review or reuse licence.</p>

        <div className="space-y-8 text-sm leading-7 text-ink-muted">
          <section>
            <h2 className={headingClass}>Official English references</h2>
            <p>Our shared English image reader covers recorded official sources for One Piece and Dragon Ball Fusion World. It serves eligible images from a Cambridge host, with publisher credit and a clear takedown state. The publisher source link records provenance; it is not used as the image address.</p>
            <p className="mt-3">An English base image may accompany a card listed in another language or as another variant. We label it as a reference image. It does not verify the requested printing, artwork variant, physical condition or authenticity.</p>
            <p className="mt-3">Practice decks request a card number without choosing a printing. Their reference images keep the selected English reprint or parallel identifier and publisher credit. Cards remain playable as text faces when eligible art is unavailable.</p>
          </section>

          <section>
            <h2 className={headingClass}>Recorded publication decisions</h2>
            <p>On 13 July 2026, the project owner approved self-hosted, attributed official images, recording a nominative-use rationale for identifying cards for trade. A later decision that day added official structured card details and attributed effect text. The earlier images-only statement on this page did not reflect that later decision.</p>
            <p className="mt-3">The artwork and text remain their rightsholders&apos; material. Cambridge does not claim ownership or grant permission to reuse them. Attribution, hosting and access to an API do not establish a redistribution licence.</p>
          </section>

          <section>
            <h2 className={headingClass}>Other image paths</h2>
            <p>A separate decision on 16 July retained catalogue photos as a market fallback. These images are labelled unverified: the legacy record does not establish the source and printing evidence required by the official-reference reader.</p>
            <p className="mt-3">Gallery, artist and retained multiplayer readers still have separate limitations. Starter and browser-practice images now use the shared source checks and carry reference context. The <Link href="/roadmap#images" className={linkClass}>image roadmap</Link> tracks the remaining work.</p>
          </section>

          <section>
            <h2 className={headingClass}>Linked CardRush listing images</h2>
            <p>Member price pages may show a CardRush listing&apos;s own image beside that listing&apos;s price, so the item can be checked. Cambridge does not host it: the page links the image at CardRush&apos;s own address, credits it &ldquo;Image: CardRush&rdquo; and links to the listing, and your browser loads it from CardRush. Cambridge does not copy, mirror, proxy or cache it, and it is not part of any Cambridge API or download. The image belongs to CardRush and shows what the listing shows; Cambridge does not verify it. On request, Cambridge stops linking it: the listing&apos;s link is marked withdrawn, and pages read afterwards no longer show it.</p>
          </section>

          <section>
            <h2 className={headingClass}>Text and acquisition</h2>
            <p>Existing English effect text is published with its copyright line under the later July decision. Structured card details also remain available where stored. The automated Bandai ingestion route remains paused; this review did not fetch new publisher material or run manual import scripts.</p>
          </section>

          <section>
            <h2 className={headingClass}>Removal and cached copies</h2>
            <p>Official-image readers exclude disputed or removed rows on a fresh database read. Previously cached responses and image objects require separate removal or invalidation. A database change does not immediately remove every cached copy or previously issued image URL. Consistent removal across all readers, text and caches remains part of the roadmap.</p>
          </section>

          <section>
            <h2 className={headingClass}>Contact</h2>
            <p>Rightsholders can identify the material and the rights they hold through the <Link href="/contact" className={linkClass}>contact page</Link>. Include the page or image address so the relevant publication path can be reviewed.</p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
