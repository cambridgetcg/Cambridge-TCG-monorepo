import Link from "next/link";
import { ComingSoon } from "@/lib/admin/ui";
import { PageHeader, SectionHeading } from "@/lib/admin/ui";

export const metadata = { title: "Card Catalog" };

/**
 * /admin/catalog/cards — landing page for the card-catalog module.
 *
 * The full Manager surface (browse, import, edit) is queued under
 * kingdom-026 and rendered as ComingSoon below. The classification
 * sub-module (kingdom-089) is live, so it gets its own panel above
 * — substrate-honest about what works today vs. what's queued.
 */

const LIVE_TOOLS = [
  {
    href: "/admin/catalog/cards/coverage-hunt",
    title: "Review Coverage Hunts",
    description:
      "Read the scout, checker, and mirror turns; record a proposal-only human resolution. Nothing applies itself.",
    status: "live",
  },
  {
    href: "/admin/catalog/cards/classify",
    title: "Classify card editions",
    description:
      "Override edition_variant + promo_origin per card. Layered priority: publisher > operator > heuristic > default. Append-only witness log.",
    status: "live",
  },
  {
    href: "/admin/catalog/cards/classify/review",
    title: "Review queue",
    description:
      "Stale low-confidence heuristic winners that need operator confirmation. Empty is the resting state.",
    status: "live",
  },
] as const;

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Card Catalog"
        description="Browse, import, and manage the unified card catalog. The Manager surface is queued; the sub-modules below are live."
      />

      <section>
        <SectionHeading>Live tools</SectionHeading>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LIVE_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="block rounded-md border border-neutral-800 bg-neutral-900 p-4 hover:border-blue-700 hover:bg-neutral-800/60"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    {tool.title}
                  </h3>
                  <span className="rounded bg-emerald-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-800">
                    {tool.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  {tool.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ComingSoon
        title="Catalog Manager"
        description="Browse, import, and bulk-edit cards across all games. The classification sub-module above is the first ship of this surface."
        missionId="kingdom-026"
      />
    </div>
  );
}
