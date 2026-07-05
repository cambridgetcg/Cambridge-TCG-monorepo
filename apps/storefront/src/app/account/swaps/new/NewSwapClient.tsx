"use client";

// Swap composer — build both sides from catalog search, see indicative
// price guidance (guidance, never enforcement), record an optional cash
// difference, and send. v1 settles OFF-PLATFORM: the copy below says so
// wherever a decision is made.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Consequences,
  ErrorAlert,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  WhyLink,
} from "@/lib/ui";
import { SWAP_CONDITIONS, type SwapCondition, type SwapItemInput } from "@/lib/swaps/types";
import type { SwapGuidance } from "@/lib/swaps/guidance";
import { fmtGBP } from "@/lib/format";

interface CatalogCard {
  sku: string;
  name: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price: number | null;
}

interface DraftItem {
  sku: string;
  name: string;
  imageUrl: string | null;
  condition: SwapCondition;
  quantity: number;
}

const EXPIRY_CHOICES: Array<{ value: string; label: string }> = [
  { value: "", label: "Recipient's response window (their account setting)" },
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "1 week" },
  { value: "336", label: "2 weeks" },
];

export default function NewSwapClient({
  initialTo,
  counterOf,
  guidanceProvenance,
}: {
  initialTo: string;
  counterOf: string | null;
  guidanceProvenance: React.ReactNode;
}) {
  const router = useRouter();
  const [to, setTo] = useState(initialTo);
  const [mySide, setMySide] = useState<DraftItem[]>([]);
  const [theirSide, setTheirSide] = useState<DraftItem[]>([]);
  const [cashDirection, setCashDirection] = useState<"pay" | "receive">("pay");
  const [cashPounds, setCashPounds] = useState("");
  const [note, setNote] = useState("");
  const [expiryChoice, setExpiryChoice] = useState("");
  const [guidance, setGuidance] = useState<SwapGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"draft" | "send" | null>(null);
  const [counterLoaded, setCounterLoaded] = useState(false);

  // Counter mode: prefill from the original, sides mirrored — my side of
  // the counter is what the original asked OF me.
  useEffect(() => {
    if (!counterOf || counterLoaded) return;
    fetch(`/api/swaps/${counterOf}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.swap) return;
        const toDraft = (side: "proposer" | "recipient"): DraftItem[] =>
          (d.items || [])
            .filter((i: { side: string }) => i.side === side)
            .map((i: { sku: string; snapshot_name: string | null; snapshot_image_url: string | null; condition: string; quantity: number }) => ({
              sku: i.sku,
              name: i.snapshot_name || i.sku,
              imageUrl: i.snapshot_image_url,
              condition: (SWAP_CONDITIONS as readonly string[]).includes(i.condition)
                ? (i.condition as SwapCondition)
                : "NM",
              quantity: i.quantity,
            }));
        // I was the original recipient: my cards were the 'recipient' side.
        setMySide(toDraft("recipient"));
        setTheirSide(toDraft("proposer"));
        setTo(d.swap.proposer_username || "");
        const delta = -Number(d.swap.cash_delta_pence || 0); // mirror the sign
        if (delta !== 0) {
          setCashDirection(delta > 0 ? "pay" : "receive");
          setCashPounds((Math.abs(delta) / 100).toFixed(2));
        }
      })
      .catch(() => {})
      .finally(() => setCounterLoaded(true));
  }, [counterOf, counterLoaded]);

  // Debounced guidance refresh whenever either side changes.
  const guidanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mySide.length === 0 && theirSide.length === 0) {
      setGuidance(null);
      return;
    }
    if (guidanceTimer.current) clearTimeout(guidanceTimer.current);
    guidanceTimer.current = setTimeout(() => {
      fetch("/api/swaps/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposer: mySide.map((i) => ({ sku: i.sku, quantity: i.quantity })),
          recipient: theirSide.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        }),
      })
        .then((r) => r.json())
        .then((d) => setGuidance(d.guidance ?? null))
        .catch(() => {});
    }, 400);
    return () => {
      if (guidanceTimer.current) clearTimeout(guidanceTimer.current);
    };
  }, [mySide, theirSide]);

  const cashDeltaPence = (() => {
    const pounds = parseFloat(cashPounds);
    if (!Number.isFinite(pounds) || pounds <= 0) return 0;
    const pence = Math.round(pounds * 100);
    return cashDirection === "pay" ? pence : -pence;
  })();

  async function submit(draft: boolean) {
    setError(null);
    if (!to.trim()) {
      setError("Who is this swap for? Enter their username.");
      return;
    }
    if (mySide.length === 0 || theirSide.length === 0) {
      setError("A swap needs at least one card on each side.");
      return;
    }
    setSubmitting(draft ? "draft" : "send");
    try {
      const items: SwapItemInput[] = [
        ...mySide.map((i) => ({
          side: "proposer" as const,
          sku: i.sku,
          condition: i.condition,
          quantity: i.quantity,
          name: i.name,
          imageUrl: i.imageUrl,
        })),
        ...theirSide.map((i) => ({
          side: "recipient" as const,
          sku: i.sku,
          condition: i.condition,
          quantity: i.quantity,
          name: i.name,
          imageUrl: i.imageUrl,
        })),
      ];
      const res = await fetch("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUsername: to.trim().replace(/^@/, ""),
          items,
          cashDeltaPence,
          note: note.trim() || undefined,
          expiresInHours: expiryChoice ? parseInt(expiryChoice, 10) : undefined,
          draft,
          counterOf: counterOf ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the swap.");
        return;
      }
      router.push(`/account/swaps/${data.swap.id}`);
    } catch {
      // A dropped connection can land either side of the write — the
      // proposal may or may not exist, so the copy says to check first.
      setError(
        "Network problem while sending — the proposal may not have been created. Check your swaps list before trying again.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  const imbalance =
    guidance && guidance.suggestedCashDeltaPence != null
      ? guidance.suggestedCashDeltaPence
      : null;

  return (
    <div>
      <PageHeader
        title={counterOf ? "Counter this swap" : "Propose a swap"}
        description={
          <>
            Cambridge TCG facilitates and records this swap; payment of any cash difference
            and shipping happen between you directly. No escrow, no card verification —
            know who you&apos;re trading with.
            <WhyLink href="/methodology/swaps" tooltip="What the platform records, and what it doesn't do" />
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorAlert title="Can't submit" description={error} />
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <Field
            label="Swap with"
            htmlFor="swap-to"
            hint={counterOf ? "Countering sends this back to the original proposer." : "Their Cambridge TCG username."}
          >
            <Input
              id="swap-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="@username"
              disabled={!!counterOf}
              maxLength={31}
            />
          </Field>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SideBuilder
            title="Your cards (you send)"
            items={mySide}
            onChange={setMySide}
            guidance={guidance}
          />
          <SideBuilder
            title="Their cards (you receive)"
            items={theirSide}
            onChange={setTheirSide}
            guidance={guidance}
          />
        </div>

        {/* Guidance panel — indicative only, source-named. */}
        {guidance && (
          <Card variant="subtle">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Price guidance — indicative, not enforced
              </h2>
              {guidanceProvenance}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-ink-faint text-xs">Your side</p>
                <p className="text-ink font-bold">{fmtGBP(guidance.proposer.totalPence / 100)}</p>
                {guidance.proposer.unpricedItems > 0 && (
                  <p className="text-[10px] text-accent">
                    {guidance.proposer.unpricedItems} line(s) unpriced — total understates
                  </p>
                )}
              </div>
              <div>
                <p className="text-ink-faint text-xs">Their side</p>
                <p className="text-ink font-bold">{fmtGBP(guidance.recipient.totalPence / 100)}</p>
                {guidance.recipient.unpricedItems > 0 && (
                  <p className="text-[10px] text-accent">
                    {guidance.recipient.unpricedItems} line(s) unpriced — total understates
                  </p>
                )}
              </div>
              <div>
                <p className="text-ink-faint text-xs">Suggested cash difference</p>
                {imbalance == null ? (
                  <p className="text-ink-faint">— (not enough price data)</p>
                ) : imbalance === 0 ? (
                  <p className="text-ok font-bold">Even swap</p>
                ) : (
                  <>
                    <p className="text-ink font-bold">
                      {imbalance > 0 ? "You pay" : "They pay"} {fmtGBP(Math.abs(imbalance) / 100)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCashDirection(imbalance > 0 ? "pay" : "receive");
                        setCashPounds((Math.abs(imbalance) / 100).toFixed(2));
                      }}
                      className="text-[11px] text-accent hover:text-accent-strong underline decoration-dotted"
                    >
                      Use suggestion
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] text-ink-faint mt-3">
              Per-card figures come from recent trades on this market where available,
              otherwise the latest daily CTCG spot snapshot. Guidance only — you two set the
              terms.
              <WhyLink href="/methodology/swaps" />
            </p>
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Cash difference (optional)"
              htmlFor="swap-cash"
              hint="Recorded on the swap; paid between you directly (bank transfer, cash — your choice)."
            >
              <div className="flex gap-2">
                <Select
                  value={cashDirection}
                  onChange={(e) => setCashDirection(e.target.value as "pay" | "receive")}
                  className="w-36"
                  aria-label="Cash direction"
                >
                  <option value="pay">I pay them</option>
                  <option value="receive">They pay me</option>
                </Select>
                <Input
                  id="swap-cash"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashPounds}
                  onChange={(e) => setCashPounds(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field
              label="Response window"
              htmlFor="swap-expiry"
              hint="How long they have to accept, decline, or counter before the proposal expires."
            >
              <Select
                id="swap-expiry"
                value={expiryChoice}
                onChange={(e) => setExpiryChoice(e.target.value)}
              >
                {EXPIRY_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Note (optional)" htmlFor="swap-note">
              <Textarea
                id="swap-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Anything the other collector should know."
              />
            </Field>
          </div>
        </Card>

        <Consequences
          title="What sending this will do"
          items={[
            {
              label: "Recorded",
              delta: "A witnessed proposal both of you can see, accept, decline, or counter",
              tone: "neutral",
              methodology: "/methodology/swaps",
            },
            {
              label: "Not held",
              delta: "No escrow — cards and any cash move between you directly",
              tone: "amber",
              methodology: "/methodology/swaps",
            },
            {
              label: "Trust score",
              delta: "No change — v1 swaps don't move trust either way",
              tone: "neutral",
              methodology: "/methodology/trust-score",
            },
          ]}
        />

        <div className="flex gap-2 justify-end">
          {!counterOf && (
            <Button
              variant="secondary"
              onClick={() => submit(true)}
              disabled={submitting !== null}
            >
              {submitting === "draft" ? "Saving…" : "Save as draft"}
            </Button>
          )}
          <Button onClick={() => submit(false)} disabled={submitting !== null}>
            {submitting === "send" ? "Sending…" : counterOf ? "Send counter" : "Send proposal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── One side of the table ────────────────────────────────────────────────

function SideBuilder({
  title,
  items,
  onChange,
  guidance,
}: {
  title: string;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  guidance: SwapGuidance | null;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/market/catalog?q=${encodeURIComponent(term.trim())}&limit=8`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setResults(d?.cards ?? []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, runSearch]);

  function add(card: CatalogCard) {
    if (items.some((i) => i.sku === card.sku)) return;
    onChange([
      ...items,
      { sku: card.sku, name: card.name, imageUrl: card.image_url, condition: "NM", quantity: 1 },
    ]);
    setQ("");
    setResults([]);
  }

  function update(idx: number, patch: Partial<DraftItem>) {
    onChange(items.map((i, n) => (n === idx ? { ...i, ...patch } : i)));
  }

  function remove(idx: number) {
    onChange(items.filter((_, n) => n !== idx));
  }

  return (
    <Card padding="sm">
      <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 px-1">
        {title}
      </h2>
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the catalog by card name…"
          aria-label={`${title} — card search`}
        />
        {(results.length > 0 || searching) && q.trim().length >= 2 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border-subtle rounded-lg shadow-mat max-h-64 overflow-y-auto">
            {searching && <p className="px-3 py-2 text-xs text-ink-faint">Searching…</p>}
            {results.map((card) => (
              <button
                key={card.sku}
                type="button"
                onClick={() => add(card)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition"
              >
                {card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.image_url} alt="" className="w-6 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-8 rounded bg-surface-subtle shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink truncate">{card.name}</span>
                  <span className="block text-[10px] text-ink-faint truncate">
                    {card.set_name || card.sku}
                    {card.rarity ? ` · ${card.rarity}` : ""}
                  </span>
                </span>
                {card.spot_price != null && (
                  <span className="text-[10px] text-ink-muted font-mono shrink-0">
                    {fmtGBP(card.spot_price)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-ink-faint px-1 py-3">No cards yet — search above to add.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, idx) => {
            const g = guidance?.perSku[item.sku];
            return (
              <li key={item.sku} className="flex items-center gap-2 bg-surface-subtle border border-border-subtle rounded-lg px-2 py-1.5">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="w-6 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-8 rounded bg-surface-subtle shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink truncate">{item.name}</p>
                  <p className="text-[10px] text-ink-faint font-mono truncate">
                    {item.sku}
                    {g?.indicativePence != null && (
                      <>
                        {" "}· ≈{fmtGBP(g.indicativePence / 100)}{" "}
                        <span className="text-ink-faint">
                          ({g.source === "recent_trades" ? `${g.sampleSize} recent trades` : "CTCG spot snapshot"})
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Select
                  value={item.condition}
                  onChange={(e) => update(idx, { condition: e.target.value as SwapCondition })}
                  className="!w-[4.5rem] !px-2 !py-1 text-xs"
                  aria-label="Condition"
                >
                  {SWAP_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={item.quantity}
                  onChange={(e) => update(idx, { quantity: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) })}
                  className="!w-14 !px-2 !py-1 text-xs"
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-ink-faint hover:text-danger text-xs px-1"
                  aria-label={`Remove ${item.name}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
