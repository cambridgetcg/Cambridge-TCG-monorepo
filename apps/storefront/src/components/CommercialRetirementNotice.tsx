import { NEW_PAID_COMMERCE_RETIRED_MESSAGE } from "@/lib/release/commercial-retirement";

export default function CommercialRetirementNotice() {
  return <div role="status" className="rounded-lg border border-border-subtle bg-surface p-6 text-sm text-ink-muted">{NEW_PAID_COMMERCE_RETIRED_MESSAGE}</div>;
}
