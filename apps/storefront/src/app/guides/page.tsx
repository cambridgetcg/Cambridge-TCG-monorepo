import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/lib/ui/PageHeader";
import { PageLayout } from "@/lib/ui/PageLayout";

export const metadata: Metadata = {
  title: "Guides — Cambridge TCG",
  description:
    "Plain, honest guides for TCG collectors and players: how to play One Piece TCG, and every way to buy a card (with real costs, waits, and import fees).",
  alternates: {
    canonical: "https://cambridgetcg.com/guides",
  },
};

// A real index, restored now that a second guide exists (the buying guide).
// While only one guide existed this route redirected straight to it; the
// earlier redirect body lives in git history at this path.
const guides = [
  {
    href: "/guides/read-a-card",
    title: "Read a card, one detail at a time",
    blurb: "Separate the card's identity, its printing and your physical copy before comparing records or prices.",
  },
  {
    href: "/guides/buying",
    title: "Every way to buy a card",
    blurb:
      "Compare buying options, ordering from Japan and grading a card. Understand costs, delivery times and import fees. New paid commerce on Cambridge TCG is retired.",
  },
  {
    href: "/guides/condition",
    title: "Condition & grading",
    blurb:
      "Understand surface wear, centering, condition descriptions and published grading standards, with dated supporting evidence.",
  },
  {
    href: "/guides/condition/checklist",
    title: "Condition checklist & border ratios",
    blurb:
      "A printable manual inspection worksheet for surfaces, edges, corners and disclosure notes, with separate centering ratios. No automatic tier or grade; entries stay in page memory.",
  },
  {
    href: "/guides/from-japan",
    title: "Ordering from Japan",
    blurb:
      "Every CardRush store linked directly, and the Remambo proxy flow step by step — fees, condition ranks, consolidation, shipping and the traps.",
  },
  {
    href: "/guides/how-to-play",
    title: "How to play One Piece TCG",
    blurb:
      "The complete beginner's guide — card types, setup, turn structure, combat, DON!! mechanics, colours, keywords, and deck building.",
  },
];

export default function GuidesIndex() {
  return (
    <PageLayout width="reading">
      <PageHeader
        size="large"
        title="Guides"
        description="Learn to play, assess card condition and understand your collecting options."
      />
      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {guides.map((guide) => (
          <li key={guide.href}>
            <Link
              href={guide.href}
              className="block rounded-md py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <h2 className="text-base font-semibold text-accent hover:underline">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{guide.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
