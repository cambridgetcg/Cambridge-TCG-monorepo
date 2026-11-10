import { NEW_PAID_COMMERCE_RETIRED_MESSAGE, NEW_PAID_COMMERCE_RETIRED_NOTICE } from "@/lib/release/commercial-retirement";

/** `replacesSiteNotice`: this is the page's one retirement notice, so the
 *  site notice above it steps aside where this one is in the first screen
 *  (globals.css), and it says where records are, as the site notice does. */
export default function CommercialRetirementNotice({ replacesSiteNotice = false }: { replacesSiteNotice?: boolean }) {
  return (
    <div
      role="status"
      data-replaces-site-notice={replacesSiteNotice ? "" : undefined}
      className="rounded-lg border border-border-subtle bg-surface p-6 text-sm text-ink-muted"
    >
      {replacesSiteNotice ? NEW_PAID_COMMERCE_RETIRED_NOTICE : NEW_PAID_COMMERCE_RETIRED_MESSAGE}
    </div>
  );
}
