"use client";

/**
 * The listing wizard — /market/list's client half.
 *
 * Three steps: pick a card (search-as-you-type over the catalog API),
 * price it (condition + price with guidance from the catalog row already
 * in hand + returns opt-in), posted (the live listing with links onward).
 *
 * Signed-out collectors can build the whole listing; posting routes
 * through /login (the API's 401 is the single source of truth for
 * "signed out" — the server-rendered prop can go stale in a bfcache
 * restore). The draft lives in localStorage because the magic-link
 * sign-in opens in a NEW tab of the same browser; sessionStorage is
 * per-tab and would lose it.
 */

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Callout, EmptyState, ErrorAlert, Field, Icon, Input, Money, Palettes, Select, WhyLink } from "@/lib/ui";
import { formatDate } from "@/lib/format";
import {
  buildCatalogSearch,
  parseCatalogError,
  DEFAULT_GAME,
  type CatalogCard,
  type CatalogSource,
} from "./catalog";
import {
  CONDITIONS,
  DEFAULT_RETURN_WINDOW_DAYS,
  LISTING_DRAFT_KEY,
  RETURN_WINDOW_CHOICES,
  draftCardFromCatalog,
  parseListingDraft,
  priceGuidance,
  serializeListingDraft,
  validateListing,
  type Condition,
  type DraftCard,
  type ListingErrors,
} from "./listing-draft";

interface ListingWizardProps {
  game: string;
  /** ?sku= deep link — e.g. the "list yours" affordance on /market rows. */
  initialSku: string | null;
  isSignedIn: boolean;
  /** Commission bounds (percent), resolved server-side from the tier table. */
  commissionMinPct: number;
  commissionMaxPct: number;
  /** Pre-rendered <Provenance> nodes, keyed by catalog source. */
  sourceBadges: Record<CatalogSource, ReactNode>;
}

type Step = "pick" | "details" | "done";

interface PostedResult {
  order: {
    id: string;
    sku: string;
    price: string | number;
    quantity: number;
    filled_quantity: number;
    condition: string;
    expires_at: string | null;
    status: string;
  };
  matched: number;
}

interface SearchState {
  status: "idle" | "loading" | "ok" | "error";
  results: CatalogCard[];
  source: CatalogSource | null;
  message?: string;
}

export default function ListingWizard({
  game,
  initialSku,
  isSignedIn,
  commissionMinPct,
  commissionMaxPct,
  sourceBadges,
}: ListingWizardProps) {
  const [step, setStep] = useState<Step>("pick");
  const [searchInput, setSearchInput] = useState("");
  const [searchNonce, setSearchNonce] = useState(0); // bumped by "Try again"
  const [search, setSearch] = useState<SearchState>({ status: "idle", results: [], source: null });

  const [picked, setPicked] = useState<DraftCard | null>(null);
  const [condition, setCondition] = useState<Condition>("NM");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [acceptsReturns, setAcceptsReturns] = useState(false);
  const [returnWindowDays, setReturnWindowDays] = useState<number>(DEFAULT_RETURN_WINDOW_DAYS);

  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<ListingErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PostedResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loginHref = `/login?return=${encodeURIComponent(
    game !== DEFAULT_GAME ? `/market/list?game=${game}` : "/market/list",
  )}`;

  const runSearch = useCallback(
    async (q: string, limit = 12): Promise<{ cards: CatalogCard[]; source: CatalogSource } | { error: string }> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/market/catalog?${buildCatalogSearch({ game, q, set: null, sort: "name_asc", page: 1, view: "table" }, limit)}`,
          { signal: controller.signal },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) return { error: parseCatalogError(body).message };
        return {
          cards: (body?.cards ?? []) as CatalogCard[],
          source: (body?.source as CatalogSource) ?? "unavailable",
        };
      } catch (err) {
        if ((err as Error).name === "AbortError") return { error: "__aborted__" };
        return { error: "Network problem while searching — try again." };
      }
    },
    [game],
  );

  // Mount: restore a saved draft (login round-trip), else honor ?sku=.
  useEffect(() => {
    const draft = parseListingDraft(localStorage.getItem(LISTING_DRAFT_KEY));
    if (draft && draft.game === game) {
      setPicked(draft.card);
      setCondition(draft.condition);
      setPrice(draft.price);
      setQuantity(draft.quantity);
      setAcceptsReturns(draft.acceptsReturns);
      setReturnWindowDays(draft.returnWindowDays);
      setRestored(true);
      setStep("details");
      return;
    }
    if (initialSku) {
      setSearchInput(initialSku);
      void (async () => {
        setSearch({ status: "loading", results: [], source: null });
        const r = await runSearch(initialSku, 5);
        if ("error" in r) {
          if (r.error !== "__aborted__") setSearch({ status: "error", results: [], source: null, message: r.error });
          return;
        }
        const exact = r.cards.find((c) => c.sku.toLowerCase() === initialSku.toLowerCase());
        if (exact) {
          setPicked(draftCardFromCatalog(exact, r.source));
          setStep("details");
        } else {
          setSearch({ status: "ok", results: r.cards, source: r.source });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search-as-you-type on the pick step.
  useEffect(() => {
    if (step !== "pick") return;
    const q = searchInput.trim();
    if (q.length < 2) {
      setSearch({ status: "idle", results: [], source: null });
      return;
    }
    const t = setTimeout(async () => {
      setSearch((s) => ({ ...s, status: "loading" }));
      const r = await runSearch(q);
      if ("error" in r) {
        if (r.error !== "__aborted__") setSearch({ status: "error", results: [], source: null, message: r.error });
        return;
      }
      setSearch({ status: "ok", results: r.cards, source: r.source });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, step, runSearch, searchNonce]);

  // Keep the draft saved while the details form is being edited, so the
  // login round-trip (and accidental tab reloads) lose nothing.
  useEffect(() => {
    if (!picked || step !== "details") return;
    localStorage.setItem(
      LISTING_DRAFT_KEY,
      serializeListingDraft({
        v: 1,
        game,
        card: picked,
        condition,
        price,
        quantity,
        acceptsReturns,
        returnWindowDays,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [picked, condition, price, quantity, acceptsReturns, returnWindowDays, step, game]);

  function pick(card: CatalogCard, source: CatalogSource) {
    setPicked(draftCardFromCatalog(card, source));
    setSubmitError(null);
    setErrors({});
    setStep("details");
  }

  function reset() {
    localStorage.removeItem(LISTING_DRAFT_KEY);
    setPicked(null);
    setPrice("");
    setQuantity("1");
    setCondition("NM");
    setAcceptsReturns(false);
    setReturnWindowDays(DEFAULT_RETURN_WINDOW_DAYS);
    setRestored(false);
    setPosted(null);
    setSubmitError(null);
    setErrors({});
    setSearchInput("");
    setSearch({ status: "idle", results: [], source: null });
    setStep("pick");
  }

  async function submit() {
    if (!picked) return;
    const nextErrors = validateListing(price, quantity);
    setErrors(nextErrors);
    if (nextErrors.price || nextErrors.quantity) return;

    // No isSignedIn short-circuit: the prop is frozen at server render and
    // goes stale (bfcache restore after the magic-link round trip). The
    // POST's 401 branch below is the one truth for "signed out"; the prop
    // only drives button copy. Draft is already in localStorage via the
    // effect above.
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/market/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: "ask",
          sku: picked.sku,
          cardName: picked.name,
          setCode: picked.set_code,
          setName: picked.set_name,
          imageUrl: picked.image_url,
          condition,
          price: Number.parseFloat(price),
          quantity: Number(quantity),
          // Returns opt-in — camelCase per the orders API contract, which
          // 400s if returnWindowDays arrives without acceptsReturns: true.
          acceptsReturns,
          ...(acceptsReturns ? { returnWindowDays } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        // Session lapsed since the page rendered — same path as signed-out.
        window.location.assign(loginHref);
        return;
      }
      if (!res.ok) {
        setSubmitError(
          typeof body?.error === "string" && body.error ? body.error : "Failed to post the listing. Try again.",
        );
        return;
      }
      localStorage.removeItem(LISTING_DRAFT_KEY);
      setPosted({ order: body.order, matched: body.matched ?? 0 });
      setStep("done");
    } catch {
      setSubmitError("Network problem while posting — your draft is still saved in this browser.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------------------------------------------------- */

  return (
    <div className="max-w-2xl mx-auto">
      <StepRail step={step} />

      {step === "pick" && (
        <section aria-label="Pick your card">
          <div className="relative mb-4">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Card name, number, or SKU…"
              aria-label="Search for the card to list"
              autoFocus
              className="w-full pl-9 pr-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition text-sm"
            />
          </div>

          {search.status === "idle" && (
            <p className="text-sm text-ink-faint">
              Type at least two characters — the set and card art help you confirm it&rsquo;s the right printing.
            </p>
          )}

          {search.status === "loading" && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="wardrobe-mat rounded-lg p-3 h-[72px] animate-pulse" />
              ))}
            </div>
          )}

          {search.status === "error" && (
            <ErrorAlert
              title="Search unavailable"
              description={search.message}
              action={
                <button
                  onClick={() => setSearchNonce((n) => n + 1)}
                  className="px-4 py-2 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition text-sm"
                >
                  Try again
                </button>
              }
            />
          )}

          {search.status === "ok" && search.results.length === 0 && (
            <EmptyState
              title="No cards match"
              description="Try the exact card number (e.g. OP01-001) or a shorter part of the name."
            />
          )}

          {search.status === "ok" && search.results.length > 0 && (
            <div>
              <p className="text-[10px] text-ink-faint mb-2 flex items-center gap-1.5">
                prices {search.source ? sourceBadges[search.source] : null}
              </p>
              <ul className="space-y-2">
                {search.results.map((card) => (
                  <li key={card.sku}>
                    <button
                      onClick={() => pick(card, search.source ?? "unavailable")}
                      className="w-full wardrobe-mat rounded-lg p-3 flex items-center gap-3 text-left hover:bg-surface-subtle transition"
                    >
                      <ResultThumb card={card} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink truncate">{card.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-faint font-mono truncate">
                          {card.card_number} · {card.set_name}
                          {card.rarity && (
                            <Badge status={card.rarity.toUpperCase()} palette={Palettes.RarityPalette} size="sm" />
                          )}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        {card.best_ask != null ? (
                          <span className="block text-xs text-ask font-mono tabular-nums">
                            ask <Money value={card.best_ask} />
                          </span>
                        ) : (
                          <span className="block text-[10px] text-ink-faint">no asks yet</span>
                        )}
                        <span className="block text-[10px] text-ink-faint font-mono tabular-nums">
                          spot <Money value={card.spot_price} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {step === "details" && picked && (
        <section aria-label="Price your listing">
          {restored && (
            <div className="mb-4">
              <Callout tone="note" title="Draft restored">
                We kept the listing you were building in this browser.
              </Callout>
            </div>
          )}

          {!isSignedIn && (
            <div className="mb-4">
              <Callout tone="note" title="You're signed out">
                Build the listing now — posting will ask you to sign in first. Your draft stays
                saved in this browser while you do, so it survives the sign-in link opening in
                a new tab. (Signing in on a different device won&rsquo;t carry it over.)
              </Callout>
            </div>
          )}

          {/* Card confirmation */}
          <div className="wardrobe-mat rounded-lg p-4 flex items-center gap-4 mb-5">
            <ResultThumb card={picked} large />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-ink truncate">{picked.name}</h2>
              <p className="flex items-center gap-1.5 text-xs text-ink-faint font-mono">
                {picked.card_number} · {picked.set_name} ({picked.set_code})
                {picked.rarity && (
                  <Badge status={picked.rarity.toUpperCase()} palette={Palettes.RarityPalette} size="sm" />
                )}
              </p>
              <button
                onClick={() => setStep("pick")}
                className="mt-2 text-xs text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
              >
                Not this card? Search again
              </button>
            </div>
          </div>

          {/* Reference prices — from the catalog row already fetched */}
          <div className="wardrobe-mat rounded-lg p-4 mb-5">
            <p className="text-[10px] text-ink-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
              Reference prices {sourceBadges[picked.source]}
              <WhyLink href="/methodology/market" tooltip="Where these numbers come from" />
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-ink-faint mb-0.5">Best ask</p>
                <p className="text-sm font-bold text-ask font-mono tabular-nums">
                  {picked.best_ask != null ? <Money value={picked.best_ask} /> : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-0.5">Best bid</p>
                <p className="text-sm font-bold text-bid font-mono tabular-nums">
                  {picked.best_bid != null ? <Money value={picked.best_bid} /> : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-0.5">Spot (ref)</p>
                <p className="text-sm font-bold text-ink-muted font-mono tabular-nums">
                  <Money value={picked.spot_price} />
                </p>
              </div>
            </div>
          </div>

          {/* The form */}
          <div className="space-y-4 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Condition" htmlFor="listing-condition">
                <Select
                  id="listing-condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as Condition)}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Price (GBP)" htmlFor="listing-price" error={errors.price}>
                <Input
                  id="listing-price"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field label="Quantity" htmlFor="listing-qty" error={errors.quantity}>
                <Input
                  id="listing-qty"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
            </div>

            <PriceHints price={price} card={picked} />

            {/* Returns opt-in */}
            <label className="flex items-start gap-3 wardrobe-mat rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsReturns}
                onChange={(e) => setAcceptsReturns(e.target.checked)}
                className="mt-0.5 accent-current"
              />
              <span className="text-sm">
                <span className="text-ink font-medium">Accept returns</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  Buyers on trades from this listing can request a no-fault return within the
                  window after the trade completes. Off by default.
                  <WhyLink href="/methodology/trade-completion" tooltip="How returns interact with trade completion" />
                </span>
                {acceptsReturns && (
                  <span className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                    Return window:
                    <Select
                      value={String(returnWindowDays)}
                      onChange={(e) => setReturnWindowDays(Number(e.target.value))}
                      className="!w-auto"
                      aria-label="Return window in days"
                    >
                      {RETURN_WINDOW_CHOICES.map((d) => (
                        <option key={d} value={d}>{d} days</option>
                      ))}
                    </Select>
                  </span>
                )}
              </span>
            </label>
          </div>

          {submitError && (
            <div className="mb-4">
              <ErrorAlert title="Could not post" description={submitError} />
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitting ? "Posting…" : isSignedIn ? "Post listing" : "Sign in to post — draft is saved"}
          </button>

          <p className="text-xs text-ink-faint leading-relaxed mt-3">
            Free to list. A commission of {commissionMinPct}–{commissionMaxPct}% (by trust tier)
            is deducted when a sale settles
            <WhyLink href="/methodology/commission-rate" tooltip="How commission is computed" />
            . If your price meets an open bid, it can fill the moment you post. Listings expire
            automatically — the exact date shows once posted — and you can cancel anytime from
            your trades page.
          </p>
        </section>
      )}

      {step === "done" && posted && picked && (
        <section aria-label="Listing posted">
          <PostedPanel posted={posted} card={picked} condition={condition} onReset={reset} />
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepRail({ step }: { step: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "pick", label: "Pick a card" },
    { id: "details", label: "Price it" },
    { id: "done", label: "Live" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 mb-6 text-xs" aria-label="Listing steps">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center font-mono tabular-nums text-[10px] ${
              i <= idx ? "bg-accent text-page font-bold" : "bg-surface-subtle text-ink-faint"
            }`}
          >
            {i + 1}
          </span>
          <span className={i <= idx ? "text-ink font-medium" : "text-ink-faint"}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-ink-faint" aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}

function ResultThumb({ card, large }: { card: { image_url: string | null; name: string }; large?: boolean }) {
  const w = large ? 64 : 40;
  const h = large ? 90 : 56;
  return card.image_url ? (
    <Image
      src={card.image_url}
      alt={card.name}
      width={w}
      height={h}
      className={`${large ? "w-16" : "w-10"} object-cover rounded border border-border-subtle shrink-0`}
    />
  ) : (
    <span
      className={`${large ? "w-16 h-[90px]" : "w-10 h-14"} bg-surface-subtle border border-border-subtle rounded flex items-center justify-center shrink-0`}
    >
      <span className="text-ink-faint text-[8px]">N/A</span>
    </span>
  );
}

function PriceHints({ price, card }: { price: string; card: DraftCard }) {
  const hints = priceGuidance(Number.parseFloat(price), card);
  if (hints.length === 0) return null;
  return (
    <ul className="space-y-1">
      {hints.map((h) => (
        <li key={h.kind} className="text-xs text-ink-muted flex items-start gap-1.5">
          <Icon name="info" size={12} className="text-accent mt-0.5 shrink-0" />
          <span>
            {h.kind === "meets_bid" && (
              <>Meets the best open bid (<Money value={h.bid} />) — this can fill the moment you post it.</>
            )}
            {h.kind === "undercuts_best_ask" && (
              <>Below the current best ask (<Money value={h.ask} />) — yours becomes the lowest ask.</>
            )}
            {h.kind === "at_or_above_best_ask" && (
              <>At or above the current best ask (<Money value={h.ask} />) — buyers see cheaper copies first.</>
            )}
            {h.kind === "first_ask" && <>No open asks — yours would be the first, and sets the price.</>}
            {h.kind === "above_spot" && (
              <>Above the shop&rsquo;s spot reference (<Money value={h.spot} />) — buyers can compare against it.</>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PostedPanel({
  posted,
  card,
  condition,
  onReset,
}: {
  posted: PostedResult;
  card: DraftCard;
  condition: Condition;
  onReset: () => void;
}) {
  const { order, matched } = posted;
  const fullyFilled = order.filled_quantity >= order.quantity;
  const title = fullyFilled
    ? "Sold — your ask matched instantly"
    : matched > 0
      ? "Partly matched — the rest is live"
      : "Your listing is live";

  return (
    <div>
      <Callout tone="substrate" title={title}>
        {fullyFilled ? (
          <>
            It matched {matched} existing bid{matched !== 1 ? "s" : ""}. Payment and delivery now
            run through the trade — pick it up in Your Trades.
          </>
        ) : matched > 0 ? (
          <>
            {order.filled_quantity} of {order.quantity} matched existing bids immediately; the
            remaining {order.quantity - order.filled_quantity} stay listed on the card page.
          </>
        ) : (
          <>Buyers see it on the card page from now on.</>
        )}
      </Callout>

      <div className="wardrobe-mat rounded-lg p-4 flex items-center gap-4 my-5">
        <ResultThumb card={card} large />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-ink truncate">{card.name}</p>
          <p className="text-xs text-ink-faint font-mono">{card.card_number} · {card.set_code}</p>
          <p className="mt-1 text-ink-muted">
            <span className="text-ask font-bold font-mono tabular-nums"><Money value={order.price} /></span>
            {" · "}{condition}{" · "}qty <span className="font-mono tabular-nums">{order.quantity}</span>
          </p>
          {!fullyFilled && order.expires_at && (
            <p className="text-xs text-ink-faint mt-1">
              Open until {formatDate(order.expires_at)} unless filled or cancelled.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          href={`/market/${order.sku}`}
          className="flex-1 text-center px-4 py-2.5 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition text-sm"
        >
          View on the card page
        </Link>
        <Link
          href="/account/trades"
          className="flex-1 text-center px-4 py-2.5 bg-surface border border-border-subtle text-ink font-medium rounded-lg hover:bg-surface-subtle transition text-sm"
        >
          Your trades
        </Link>
        <button
          onClick={onReset}
          className="flex-1 px-4 py-2.5 bg-surface border border-border-subtle text-ink-muted font-medium rounded-lg hover:bg-surface-subtle transition text-sm"
        >
          List another card
        </button>
      </div>
    </div>
  );
}
