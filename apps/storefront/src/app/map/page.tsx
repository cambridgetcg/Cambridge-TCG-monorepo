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
        <PageHeader size="large" title="The map" description="Find a room by what you want to do. Each entrance leads to its current pages; those pages explain their data and access limits." />
        <RoomDirectory />
        <section aria-labelledby="map-trails" className="mt-12">
          <h2 id="map-trails" className="mb-6 font-display text-2xl font-semibold text-ink">A few ways through</h2>
          <ReadingTrails />
        </section>
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
