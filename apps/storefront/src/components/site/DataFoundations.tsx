import Link from "next/link";
import { DATA_FOUNDATIONS } from "@/content/platform";

/** Short product pillars; detailed current/next limits live on the roadmap. */
export function DataFoundations() {
  return (
    <ul lang="en" className="grid gap-px border-y border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
      {DATA_FOUNDATIONS.map((area, index) => (
        <li key={area.id} className="bg-page">
          <Link href={`/roadmap#${area.id}`} className="relative flex h-full flex-col p-5 hover:bg-surface-subtle focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent sm:p-6">
            <span aria-hidden="true" className="font-mono text-xs text-accent">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 font-display text-xl font-medium text-ink">{area.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{area.purpose}</p>
            <span className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs">
              <span className="rounded-full border border-border-subtle px-2.5 py-0.5 font-medium text-ink-muted">{area.status}</span>
              <span aria-hidden="true" className="text-accent">→</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
