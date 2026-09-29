/** Task shortcuts only: a listed destination is not a service-health claim. */
export interface CollectionService {
  id: string;
  title: string;
  description: string;
  href: string;
  accessLabel: string;
  featured: boolean;
}

export const COLLECTION_SERVICES = [
  {
    id: "prices",
    title: "Discover prices",
    description: "Find a card, then browse permitted source prices.",
    href: "/prices",
    accessLabel: "Public catalog · sign-in for prices",
    featured: true,
  },
  {
    id: "collection",
    title: "Organise your collection",
    description: "Record quantities, condition and notes for the cards you own.",
    href: "/account/portfolio",
    accessLabel: "Existing account",
    featured: true,
  },
  {
    id: "condition",
    title: "Check card condition",
    description: "Use a manual checklist and calculate border ratios.",
    href: "/guides/condition/checklist",
    accessLabel: "No sign-in",
    featured: true,
  },
  {
    id: "downloads",
    title: "Download price data",
    description: "Export permitted source prices for your spreadsheet.",
    href: "/account/data",
    accessLabel: "Existing account",
    featured: true,
  },
  {
    id: "history",
    title: "Review price history",
    description: "Inspect retained observations by source, currency and date.",
    href: "/prices?mode=history#member-prices-heading",
    accessLabel: "Existing account",
    featured: false,
  },
] as const satisfies readonly CollectionService[];
