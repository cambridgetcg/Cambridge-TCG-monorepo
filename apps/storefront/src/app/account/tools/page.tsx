/**
 * /account/tools — the "More tools" hub (Stage 1 of the account-centre
 * simplification).
 *
 * The primary sidebar now carries only the dozen surfaces members live in;
 * everything else moved here. This page is a plain directory — server
 * component, no data fetching, auth-gated by the account layout — so every
 * demoted page keeps a discoverable front door at its original URL.
 * Grouped to match how members think: selling, reputation, community,
 * collection extras, and the admin-ish rest.
 *
 * Each description is one plain-English line answering "what would I come
 * here to do?" — sourced from the destination page's own header copy so
 * the map doesn't drift from the territory.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, Card, PageHeader } from "@/lib/ui";

export const metadata: Metadata = {
  title: "More tools",
  other: audienceMetadata("consumer", ["account"]),
};

interface ToolLink {
  href: string;
  label: string;
  /** One plain-English line: what you'd come here to do. */
  description: string;
}

interface ToolGroup {
  label: string;
  links: ToolLink[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "Selling & trading",
    links: [
      {
        href: "/account/trader",
        label: "Trader dashboard",
        description: "Your selling overview — exposure, performance, fees, and listings that need attention.",
      },
      {
        href: "/account/auctions",
        label: "My auctions",
        description: "Auctions you're running and bids you've placed.",
      },
      {
        href: "/account/auctions/won",
        label: "Auction wins",
        description: "Auctions you've won and what happens to them next.",
      },
      {
        href: "/account/lots",
        label: "My lots",
        description: "Bulk lots you've put up for sale.",
      },
      {
        href: "/account/pricing-rules",
        label: "Pricing rules",
        description: "Auto-decline or auto-counter incoming offers so you don't answer each one by hand.",
      },
      {
        href: "/account/vacation",
        label: "Vacation mode",
        description: "Pause your listings and push back deadlines while you're away.",
      },
      {
        href: "/account/searches",
        label: "Saved searches",
        description: "Stock alerts — we scan new listings every minute and notify you on a match.",
      },
      {
        href: "/account/offers",
        label: "Offers",
        description: "Price negotiations you've made and received on market asks.",
      },
      {
        href: "/account/returns",
        label: "Returns",
        description: "No-fault returns on completed trades — changed your mind, send it back.",
      },
      {
        href: "/account/trade-cancels",
        label: "Cancellations",
        description: "Cancel a trade before payment, or respond to the other side's request.",
      },
    ],
  },
  {
    label: "Reputation",
    links: [
      {
        href: "/account/trust",
        label: "Trust score",
        description: "Where your score stands and exactly how it's computed.",
      },
      {
        href: "/account/reviews",
        label: "Reviews",
        description: "Reviews you've received and given — your average feeds your trust score.",
      },
      {
        href: "/account/verify",
        label: "Verification",
        description: "Verify your identity to unlock higher limits.",
      },
      {
        href: "/account/external-rep",
        label: "External rep",
        description: "Link your accounts on other marketplaces for extra trust points.",
      },
    ],
  },
  {
    label: "Community",
    links: [
      {
        href: "/account/messages",
        label: "Messages",
        description: "Direct messages with other traders.",
      },
      {
        href: "/account/followers",
        label: "Followers",
        description: "People who follow your collection.",
      },
      {
        href: "/account/following",
        label: "Following",
        description: "Traders whose activity shows up in your feed.",
      },
      {
        href: "/account/collectives",
        label: "Collectives",
        description: "Shops, clubs, and guilds you belong to — or start one.",
      },
      {
        href: "/account/journey",
        label: "Activity journey",
        description: "A timeline of everything you've done on the platform.",
      },
    ],
  },
  {
    label: "Collection extras",
    links: [
      {
        href: "/account/portfolio/value",
        label: "Collection value",
        description: "What your collection is worth, with an exportable certificate.",
      },
      {
        href: "/account/sets",
        label: "Set progress",
        description: "Completion checklists for every set you collect.",
      },
      {
        href: "/account/vault",
        label: "Vault",
        description: "Cards stored with us — history, redemptions, and sell-backs.",
      },
      {
        href: "/account/proofs",
        label: "My proofs",
        description: "Draw receipts with browser-side consistency checks.",
      },
      {
        href: "/account/watchlist",
        label: "Watchlist",
        description: "Price alerts on specific cards you're watching.",
      },
      {
        href: "/account/rewards",
        label: "Prizes",
        description: "Physical prizes you've won and their shipping status.",
      },
    ],
  },
  {
    label: "Other",
    links: [
      {
        href: "/account/emails",
        label: "Email preferences",
        description: "Choose which emails we send you.",
      },
      {
        href: "/account/chargebacks",
        label: "Chargebacks",
        description: "Bank disputes filed against charges on your account.",
      },
      {
        href: "/account/payment-issues",
        label: "Payment issues",
        description: "Payments that didn't go through and how to fix them.",
      },
      {
        href: "/account/standing",
        label: "Account standing",
        description: "Active flags or restrictions on your account, and how to clear them.",
      },
      {
        href: "/account/agents",
        label: "Agents & API keys",
        description: "For developers — manage agents and API access to your account.",
      },
    ],
  },
];

export default function MoreToolsPage() {
  return (
    <div>
      <PageHeader
        title="More tools"
        description="Everything beyond the everyday essentials. Each tool keeps its own page — this is just the map."
      />

      <div className="space-y-8">
        {TOOL_GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.links.map((link) => (
                <Link key={link.href} href={link.href} className="group block">
                  <Card className="h-full transition group-hover:border-accent/40">
                    <div className="text-sm font-semibold text-ink group-hover:text-accent transition">
                      {link.label} →
                    </div>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                      {link.description}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
