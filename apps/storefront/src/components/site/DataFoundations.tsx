import Link from "next/link";
import { DATA_FOUNDATIONS } from "@/content/platform";
import { Icon } from "@/lib/ui/Icon";

/** Short product pillars; detailed current/next limits live on the roadmap. */
export function DataFoundations() {
  return (
    <ul lang="en" className="grid gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
      {DATA_FOUNDATIONS.map((area) => (
        <li key={area.id} className="bg-surface">
          <Link href={`/roadmap#${area.id}`} className="flex h-full flex-col p-5 hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent sm:p-6">
            <Icon name={area.icon} size={24} className="mb-5 text-accent" />
            <h3 className="text-base font-semibold text-ink">{area.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{area.purpose}</p>
            <span className="mt-auto pt-4 text-xs font-medium text-accent">{area.status} →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
