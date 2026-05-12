"use client";

/**
 * ChannelEditor — inline editor for a single channel_pricing row.
 *
 * Six numeric fields + a "Preview" button that computes the breakdown
 * for a sample card (¥1000 @ 185 GBP/JPY) so operators see the
 * downstream effect of a change before saving.
 *
 * Submit calls `updateChannelPricing()` via Server Action; success
 * triggers a router refresh (the action's `revalidate` does the rest).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateChannelPricing, previewChannelPrice } from "./_actions";

interface ChannelEditorProps {
  channelId: number;
  channel: string;
  marginMultiplier: number;
  flatFeeSingles: number;
  flatFeeSealed: number;
  vatMultiplier: number;
  retailMultiplier: number;
  roundTo: number;
}

interface Breakdown {
  baseGbp: number;
  exVat: number;
  vat: number;
  preRound: number;
  price: number;
}

export function ChannelEditor(props: ChannelEditorProps) {
  const [margin, setMargin] = useState(props.marginMultiplier);
  const [feeSingles, setFeeSingles] = useState(props.flatFeeSingles);
  const [feeSealed, setFeeSealed] = useState(props.flatFeeSealed);
  const [vat, setVat] = useState(props.vatMultiplier);
  const [retail, setRetail] = useState(props.retailMultiplier);
  const [round, setRound] = useState(props.roundTo);
  const [preview, setPreview] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    margin !== props.marginMultiplier ||
    feeSingles !== props.flatFeeSingles ||
    feeSealed !== props.flatFeeSealed ||
    vat !== props.vatMultiplier ||
    retail !== props.retailMultiplier ||
    round !== props.roundTo;

  function reset() {
    setMargin(props.marginMultiplier);
    setFeeSingles(props.flatFeeSingles);
    setFeeSealed(props.flatFeeSealed);
    setVat(props.vatMultiplier);
    setRetail(props.retailMultiplier);
    setRound(props.roundTo);
    setPreview(null);
    setError(null);
  }

  function onPreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewChannelPrice({
        channel: props.channel,
        marginMultiplier: margin,
        flatFeeSingles: feeSingles,
        flatFeeSealed: feeSealed,
        vatMultiplier: vat,
        retailMultiplier: retail,
        roundTo: round,
      });
      setPreview({
        baseGbp: result.baseGbp,
        exVat: result.exVat,
        vat: result.vat,
        preRound: result.preRound,
        price: result.price,
      });
    });
  }

  function onSave() {
    const reason = window.prompt(
      `Reason for editing ${props.channel}?  (Logged to admin_actions_log.)`,
    );
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const result = await updateChannelPricing({
        channelId: props.channelId,
        marginMultiplier: margin,
        flatFeeSingles: feeSingles,
        flatFeeSealed: feeSealed,
        vatMultiplier: vat,
        retailMultiplier: retail,
        roundTo: round,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setPreview(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <NumField label="Margin ×" value={margin} step={0.01} onChange={setMargin} />
        <NumField label="VAT ×" value={vat} step={0.01} onChange={setVat} />
        <NumField label="Retail ×" value={retail} step={0.01} onChange={setRetail} />
        <NumField label="Fee singles £" value={feeSingles} step={0.01} onChange={setFeeSingles} />
        <NumField label="Fee sealed £" value={feeSealed} step={0.01} onChange={setFeeSealed} />
        <NumField label="Round £" value={round} step={0.01} onChange={setRound} />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={pending}
          className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 disabled:opacity-50"
        >
          {pending ? "…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
          >
            Reset
          </button>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {preview && (
        <div className="text-xs bg-neutral-900 border border-neutral-800 rounded px-3 py-2 space-y-1">
          <div className="text-neutral-500 uppercase tracking-wider mb-1">
            Preview · ¥1000 @ 185 GBP/JPY · singles
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-neutral-300 font-mono">
            <span>base</span><span className="text-right">£{preview.baseGbp.toFixed(4)}</span>
            <span>ex VAT</span><span className="text-right">£{preview.exVat.toFixed(4)}</span>
            <span>VAT</span><span className="text-right">£{preview.vat.toFixed(4)}</span>
            <span>pre-round</span><span className="text-right">£{preview.preRound.toFixed(4)}</span>
            <span className="text-emerald-400 font-medium">price</span>
            <span className="text-right text-emerald-400 font-medium">£{preview.price.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-neutral-200 font-mono text-sm focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}
