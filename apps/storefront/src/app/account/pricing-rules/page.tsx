"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Palettes } from "@/lib/ui";
import { formatRelativeTime } from "@/lib/format";

import { Audience } from "@/lib/ui";
interface PricingRule {
  id: string;
  name: string;
  listing_filter: {
    sku_pattern?: string;
    set_codes?: string[];
    conditions?: string[];
    min_ask?: number;
    max_ask?: number;
  };
  rule_type: "auto_decline" | "auto_counter";
  threshold_pct: string;
  counter_pct: string | null;
  response_message: string | null;
  status: "active" | "paused" | "archived";
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<PricingRule["status"], string> = {
  active:   "Active",
  paused:   "Paused",
  archived: "Archived",
};

export default function PricingRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/market/pricing-rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules || []))
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function act(ruleId: string, path: string, method: "POST" | "DELETE" = "POST") {
    setBusy(ruleId);
    setError(null);
    try {
      const res = await fetch(`/api/market/pricing-rules/${ruleId}${path ? "/" + path : ""}`, { method });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Action failed");
      else load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-display font-semibold text-ink mb-2">Pricing Rules</h1>
      <p className="text-sm text-ink-muted mb-6">
        Rules you set up before new offers were retired on 23 September 2026. No new offers
        arrive, so rules no longer fire; you can pause or archive them.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-surface rounded-lg p-8 text-center">
          <p className="text-ink-muted text-sm">No rules on record.</p>
          <Link href="/account/offers" className="inline-block mt-3 text-accent text-xs font-semibold hover:text-accent-strong">
            View incoming offers →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              busy={busy === r.id}
              onAct={(path, method) => act(r.id, path, method)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  busy,
  onAct,
}: {
  rule: PricingRule;
  busy: boolean;
  onAct: (path: string, method?: "POST" | "DELETE") => void;
}) {
  // Filter summary line
  const filter = rule.listing_filter;
  const filterParts: string[] = [];
  if (filter.sku_pattern) filterParts.push(`SKU like ${filter.sku_pattern}`);
  if (filter.set_codes?.length) filterParts.push(`set ${filter.set_codes.join(", ")}`);
  if (filter.conditions?.length) filterParts.push(`condition ${filter.conditions.join("/")}`);
  if (filter.min_ask !== undefined && filter.max_ask !== undefined) filterParts.push(`ask £${filter.min_ask}-£${filter.max_ask}`);
  else if (filter.min_ask !== undefined) filterParts.push(`ask ≥ £${filter.min_ask}`);
  else if (filter.max_ask !== undefined) filterParts.push(`ask ≤ £${filter.max_ask}`);
  const filterSummary = filterParts.length > 0 ? filterParts.join(" · ") : "all my asks";

  // Action summary
  const action = rule.rule_type === "auto_decline"
    ? `Auto-decline if offer < ${rule.threshold_pct}% of ask`
    : `Auto-counter at ${rule.counter_pct}% of ask if offer < ${rule.threshold_pct}%`;

  return (
    <div className="bg-surface rounded-lg p-4 border border-border-subtle">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-ink font-semibold text-sm truncate">{rule.name}</p>
          <p className="text-xs text-ink-faint mt-0.5">Applies to {filterSummary}</p>
        </div>
        <Badge status={rule.status} palette={Palettes.PricingRuleStatusPalette} labels={STATUS_LABELS} />
      </div>

      <div className="bg-surface-subtle rounded p-2 mb-2">
        <p className={`text-xs ${rule.rule_type === "auto_counter" ? "text-info" : "text-accent"}`}>
          {action}
        </p>
        {rule.response_message && (
          <p className="text-xs text-ink-muted italic mt-1">“{rule.response_message}”</p>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-ink-faint flex-wrap">
        <span>
          Fired{" "}
          <span className="text-ink-muted font-mono">{rule.trigger_count}</span>
          {rule.trigger_count === 1 ? " time" : " times"}
        </span>
        <span>
          Last fired{" "}
          <span className="text-ink-muted">{rule.last_triggered_at ? formatRelativeTime(rule.last_triggered_at) : "never"}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {rule.status === "active" && (
          <button
            disabled={busy}
            onClick={() => onAct("pause")}
            className="px-3 py-1.5 text-xs font-medium bg-surface-subtle text-ink-muted rounded-md hover:bg-surface-subtle transition disabled:opacity-50"
          >
            Pause
          </button>
        )}
        {rule.status !== "archived" && (
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("Archive this rule? It stops firing on new offers but the trigger history is preserved.")) {
                onAct("", "DELETE");
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-danger hover:text-danger transition"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
