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
  const [showNew, setShowNew] = useState(false);

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
      <h1 className="text-2xl font-black text-ink mb-2">Pricing Rules</h1>
      <p className="text-sm text-ink-muted mb-6">
        Auto-respond to incoming offers. Filter by listing criteria and either reject offers
        below a threshold (auto-decline) or send back a counter at a fixed percentage of your
        ask (auto-counter). Rules fire inline when the buyer submits — no waiting on you.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNew((s) => !s)}
          className="px-4 py-2 text-xs font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition"
        >
          {showNew ? "Cancel" : "+ New rule"}
        </button>
      </div>

      {showNew && <NewRuleForm onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 text-center">
          <p className="text-ink-muted text-sm">
            No rules yet. Save time on lowball offer triage by creating one above.
          </p>
          <Link href="/account/offers" className="inline-block mt-3 text-accent-strong text-xs font-semibold hover:text-accent-strong">
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
    <div className="bg-surface rounded-xl p-4 border border-border-subtle">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-ink font-semibold text-sm truncate">{rule.name}</p>
          <p className="text-xs text-ink-faint mt-0.5">Applies to {filterSummary}</p>
        </div>
        <Badge status={rule.status} palette={Palettes.PricingRuleStatusPalette} labels={STATUS_LABELS} />
      </div>

      <div className="bg-page/40 rounded p-2 mb-2">
        <p className={`text-xs ${rule.rule_type === "auto_counter" ? "text-blue-300" : "text-accent-strong"}`}>
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
            className="px-3 py-1.5 text-xs font-medium bg-surface-elevated text-ink-muted rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
          >
            Pause
          </button>
        )}
        {rule.status === "paused" && (
          <button
            disabled={busy}
            onClick={() => onAct("resume")}
            className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
          >
            Resume
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
            className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

function NewRuleForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<"auto_decline" | "auto_counter">("auto_decline");
  const [thresholdPct, setThresholdPct] = useState("80");
  const [counterPct, setCounterPct] = useState("90");
  const [skuPattern, setSkuPattern] = useState("");
  const [setCodes, setSetCodes] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [minAsk, setMinAsk] = useState("");
  const [maxAsk, setMaxAsk] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleCondition(c: string) {
    setConditions((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const filter: Record<string, unknown> = {};
      if (skuPattern.trim()) filter.sku_pattern = skuPattern.trim();
      const setList = setCodes.split(",").map((s) => s.trim()).filter(Boolean);
      if (setList.length > 0) filter.set_codes = setList;
      if (conditions.length > 0) filter.conditions = conditions;
      if (minAsk) filter.min_ask = parseFloat(minAsk);
      if (maxAsk) filter.max_ask = parseFloat(maxAsk);

      const body: Record<string, unknown> = {
        name,
        listingFilter: filter,
        ruleType,
        thresholdPct: parseFloat(thresholdPct),
        responseMessage: responseMessage.trim() || undefined,
      };
      if (ruleType === "auto_counter") {
        body.counterPct = parseFloat(counterPct);
      }

      const res = await fetch("/api/market/pricing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-accent/30 p-5 mb-4">
      <h2 className="text-sm font-bold text-accent-strong uppercase tracking-wide mb-3">New rule</h2>

      <label className="block text-xs text-ink-faint mb-1">Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Charizard floor at 80%"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
      />

      {/* Rule type radio */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {([
          ["auto_decline", "Auto-decline", "Reject below threshold"],
          ["auto_counter", "Auto-counter", "Send a counter offer back"],
        ] as const).map(([v, label, hint]) => (
          <button
            key={v}
            type="button"
            onClick={() => setRuleType(v)}
            className={`text-left px-3 py-2 rounded-lg border transition ${
              ruleType === v
                ? "border-accent/40 bg-accent/10"
                : "border-border-strong bg-surface-elevated/40 hover:bg-surface-elevated"
            }`}
          >
            <div className={`text-sm font-bold ${ruleType === v ? "text-accent-strong" : "text-ink-muted"}`}>
              {label}
            </div>
            <div className="text-[11px] text-ink-faint">{hint}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-faint mb-1">
            Threshold (% of ask) — reject below this
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={thresholdPct}
            onChange={(e) => setThresholdPct(e.target.value)}
            className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
          />
        </div>
        {ruleType === "auto_counter" && (
          <div>
            <label className="block text-xs text-ink-faint mb-1">
              Counter (% of ask) — must be {">"} threshold
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={counterPct}
              onChange={(e) => setCounterPct(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
            />
          </div>
        )}
      </div>

      {/* Filter section */}
      <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2 mt-4">
        Apply to (leave empty for all asks)
      </h3>

      <label className="block text-xs text-ink-faint mb-1">SKU pattern (% wildcard)</label>
      <input
        type="text"
        value={skuPattern}
        onChange={(e) => setSkuPattern(e.target.value)}
        placeholder="OP01-%"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono uppercase"
      />

      <label className="block text-xs text-ink-faint mb-1">Set codes (comma-separated)</label>
      <input
        type="text"
        value={setCodes}
        onChange={(e) => setSetCodes(e.target.value)}
        placeholder="OP01, OP02"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono uppercase"
      />

      <label className="block text-xs text-ink-faint mb-2">Conditions</label>
      <div className="flex gap-1 mb-3 flex-wrap">
        {["NM", "M", "LP", "MP", "HP", "DMG"].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggleCondition(c)}
            className={`text-xs px-2.5 py-1 rounded-full transition ${
              conditions.includes(c)
                ? "bg-accent text-black font-bold"
                : "bg-surface-elevated text-ink-muted hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-faint mb-1">Min ask price (£)</label>
          <input
            type="number"
            step="0.01"
            value={minAsk}
            onChange={(e) => setMinAsk(e.target.value)}
            className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Max ask price (£)</label>
          <input
            type="number"
            step="0.01"
            value={maxAsk}
            onChange={(e) => setMaxAsk(e.target.value)}
            className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
          />
        </div>
      </div>

      <label className="block text-xs text-ink-faint mb-1">
        Optional message attached to the auto-response
      </label>
      <input
        type="text"
        value={responseMessage}
        onChange={(e) => setResponseMessage(e.target.value)}
        placeholder="Sorry, can't go lower than 80% on this card."
        maxLength={200}
        className="w-full px-3 py-2 mb-4 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
      />

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

      <div className="flex justify-end gap-2">
        <button
          disabled={submitting || !name.trim()}
          onClick={submit}
          className="px-4 py-2 text-xs font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save rule"}
        </button>
      </div>
    </div>
  );
}
