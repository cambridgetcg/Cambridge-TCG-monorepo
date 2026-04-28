/**
 * Placeholder component for dashboard sections not yet built.
 * Replaced module-by-module as subsequent missions complete.
 */

import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  /** Link to the existing admin page in storefront/wholesale for this module */
  existingUrl?: string;
}

export function ComingSoon({ title, description, existingUrl }: ComingSoonProps) {
  return (
    <div className="max-w-lg">
      <div className="flex items-start gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
          <Construction className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-neutral-400 mt-1">{description}</p>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
        <p className="text-sm text-neutral-500">
          This section is on the roadmap and will be built in a future mission.
        </p>
        {existingUrl && (
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Open current admin page ↗
          </a>
        )}
      </div>
    </div>
  );
}
