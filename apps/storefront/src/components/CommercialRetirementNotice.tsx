import { NEW_PAID_COMMERCE_RETIRED_MESSAGE } from "@/lib/release/commercial-retirement";

/** `replacesSiteNotice`: this is the page's one retirement notice, so the
 *  site notice above it steps aside (globals.css). */
export default function CommercialRetirementNotice({ replacesSiteNotice = false }: { replacesSiteNotice?: boolean }) {
  return (
    <div
      role="status"
      data-replaces-site-notice={replacesSiteNotice ? "" : undefined}
      className="rounded-lg border border-border-subtle bg-surface p-6 text-sm text-ink-muted"
    >
      {NEW_PAID_COMMERCE_RETIRED_MESSAGE}
    </div>
  );
}
