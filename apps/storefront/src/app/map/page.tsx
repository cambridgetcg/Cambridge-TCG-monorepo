import type { Metadata } from "next";
import Link from "next/link";
import { RoomDirectory, ReadingTrails } from "@/components/site/RoomDirectory";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";

export const metadata: Metadata = {
  title: "The map — Cambridge TCG",
  description: "Eight rooms for cards, collecting, play, learning, stories, community, sources and API tools.",
};

export default function MapPage() {
  return (
    <PageLayout width="wide">
      <div lang="en">
        <PageHeader size="large" title="The map" description="Every room, at a glance." />
        <p className="mb-6 text-sm text-ink-muted">Looking for prices or collection tools? <Link href="/services" className="text-accent underline underline-offset-4">Start with services →</Link></p>
        <RoomDirectory />
        <details className="mt-8 border-t border-border-subtle pt-5">
          <summary className="cursor-pointer text-lg font-semibold text-ink">Reading trails</summary>
          <div className="mt-5"><ReadingTrails /></div>
        </details>
        <nav aria-label="Account, help and developer resources" className="mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t border-border-subtle pt-6 text-sm text-accent underline underline-offset-4">
          <Link href="/account" prefetch={false}>Account & existing records</Link>
          <Link href="/contact">Help</Link>
          <Link href="/standards/card-data">SKU & price contracts</Link>
          <a href="/api/v1/rooms">Room directory JSON</a>
          <Link href="/agents">Agent workshop</Link>
        </nav>
      </div>
    </PageLayout>
  );
}
