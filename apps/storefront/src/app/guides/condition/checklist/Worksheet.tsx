"use client";

import { useState } from "react";
import { Button } from "@/lib/ui/Button";
import { Card } from "@/lib/ui/Card";
import { Field, Input, Select, Textarea } from "@/lib/ui/Input";
import { BORDER_ERRORS, calculateCenteringRatio, formatBorderPercent } from "@/lib/condition/centering";
import styles from "./worksheet.module.css";

const inspections = [
  { id: "front-surface", title: "Front surface", hint: "Look for face whitening, scratches, scuffing or clouding, print lines, grime and ink. Record location and extent, not just a defect name." },
  { id: "back-surface", title: "Back surface", hint: "Inspect the reverse separately for the same surface defects. A clean front does not describe the back." },
  { id: "edges", title: "Edges", hint: "Check all four edges on both faces for whitening, chipping, nicks, fraying and rough cuts. Distinguish edge wear from wear on the face." },
  { id: "corners", title: "Corners", hint: "Check all four corners on both faces for fraying, wear and bends. Name the corner and the face in your notes." },
  { id: "structure", title: "Structure", hint: "Look for creases, bends or warping, liquid exposure, peeling or separation, foil bubbles and crimps. Do not bend or alter the card to test it." },
] as const;

function PrintValue({ value, inline = false }: { value: string; inline?: boolean }) {
  return <span className={`${styles.printValue} ${inline ? styles.checkValue : ""}`}>{value || "Not recorded"}</span>;
}

function NoteField({ id, label, multiline = false }: { id: string; label: string; multiline?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <Field htmlFor={id} label={label}>
      {multiline ? (
        <Textarea id={id} rows={3} value={value} onChange={(event) => setValue(event.target.value)} />
      ) : (
        <Input id={id} value={value} onChange={(event) => setValue(event.target.value)} />
      )}
      <PrintValue value={value} />
    </Field>
  );
}

function ReviewCheck({ id, label }: { id: string; label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <label htmlFor={id} className="flex min-h-11 items-start gap-3 py-2 text-sm text-ink">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
      <span><PrintValue value={checked ? "[Checked] " : "[Not checked] "} inline />{label}</span>
    </label>
  );
}

type AxisProps = {
  face: "Front" | "Back";
  axis: "horizontal" | "vertical";
  measurable: boolean;
  initialValues?: readonly [string, string];
};

/** Exported for server-rendered validation/print tests; no browser-only work in render. */
export function BorderAxis({ face, axis, measurable, initialValues = ["", ""] }: AxisProps) {
  const [values, setValues] = useState<[string, string]>([...initialValues]);
  const [touched, setTouched] = useState(false);
  const result = calculateCenteringRatio(values[0], values[1], measurable);
  const labels = axis === "horizontal" ? ["Left", "Right"] : ["Top", "Bottom"];
  const id = `${face.toLowerCase()}-${axis}`;
  const showErrors = touched || values.some((value) => value !== "");
  const errors = result.status === "invalid" ? [result.firstError, result.secondError] : [];
  let summary = "Not measured — enter both border widths.";
  if (result.status === "not-measurable") summary = "Not measurable — no ratio calculated.";
  if (result.status === "invalid" && showErrors) {
    summary = result.pairError === "zero-total"
      ? "No ratio: both borders are zero. At least one width must be greater than zero."
      : "No ratio: check the border widths below.";
  }
  if (result.status === "measured") {
    summary = `${labels[0]} / ${labels[1]}: ${formatBorderPercent(result.firstPercent)} / ${formatBorderPercent(result.secondPercent)} (%)`;
  }
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold text-ink">{face} {axis}</legend>
      <p id={`${id}-result`} role="status" aria-live="polite" className="text-sm text-ink font-mono">{summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {labels.map((label, index) => {
          const error = showErrors && errors[index];
          return (
            <Field key={label} htmlFor={`${id}-${index}`} label={`${face} ${label.toLowerCase()} border width`}>
              <Input
                id={`${id}-${index}`}
                type="text"
                inputMode="decimal"
                value={values[index]}
                disabled={!measurable}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-result${error ? ` ${id}-${index}-error` : ""}`}
                onBlur={() => setTouched(true)}
                onChange={(event) => {
                  const next: [string, string] = [...values];
                  next[index] = event.target.value;
                  setValues(next);
                }}
              />
              <PrintValue value={values[index]} />
              {error && <p id={`${id}-${index}-error`} className="text-sm text-ink">{BORDER_ERRORS[error]}</p>}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}

function FaceMeasurements({ face }: { face: "Front" | "Back" }) {
  const [measurable, setMeasurable] = useState(true);
  const id = `${face.toLowerCase()}-measurable`;
  return (
    <fieldset className="min-w-0 space-y-5 border-t border-border-subtle pt-4">
      <legend className="font-semibold text-ink">{face} borders</legend>
      <Field htmlFor={id} label={`${face} measurement availability`}>
        <Select id={id} value={measurable ? "measurable" : "not-measurable"} onChange={(event) => setMeasurable(event.target.value === "measurable")}>
          <option value="measurable">Opposing borders can be measured</option>
          <option value="not-measurable">Borderless / irregular / not measurable</option>
        </Select>
        <PrintValue value={measurable ? "Opposing borders can be measured" : "Borderless / irregular / not measurable; entered widths are not used"} />
      </Field>
      <BorderAxis face={face} axis="horizontal" measurable={measurable} />
      <BorderAxis face={face} axis="vertical" measurable={measurable} />
    </fieldset>
  );
}

export default function Worksheet() {
  const [includeBack, setIncludeBack] = useState(false);
  return (
    <form autoComplete="off" onSubmit={(event) => event.preventDefault()} className="space-y-8" aria-label="Manual card condition worksheet">
      <div className={styles.screenOnly}>
        <Button onClick={async () => {
          await document.fonts.ready;
          window.print();
        }}>Print worksheet</Button>
        <p className="mt-2 text-sm text-ink-muted">Print now for a blank paper worksheet, or fill it in first. Your browser may offer Save as PDF.</p>
      </div>

      <Card padding="lg">
        <fieldset className="min-w-0 space-y-4">
          <legend className="font-display text-xl text-ink">Card identity</legend>
          <p className="text-sm text-ink-muted">Record the printing you inspected. These details are your notes, not an identity or authenticity check.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <NoteField id="card-name" label="Game and card name" />
            <NoteField id="card-number" label="Set and card number / identifier" />
            <NoteField id="card-printing" label="Language, variant and finish" />
            <NoteField id="inspection-date" label="Inspection date (as recorded by you)" />
          </div>
        </fieldset>
      </Card>

      <section aria-labelledby="inspection-heading" className="space-y-5">
        <h2 id="inspection-heading" className="font-display text-2xl text-ink">Look, then describe</h2>
        <p className="text-sm text-ink-muted">House practice: use one light source and gently tilt to see marks at different angles. A tick means you reviewed an area, not that it passed. Unticked means not recorded, not defect-free.</p>
        {inspections.map(({ id, title, hint }) => (
          <fieldset key={id} className="min-w-0 border-t border-border-subtle pt-4 space-y-2">
            <legend className="text-lg font-semibold text-ink">{title}</legend>
            <p className="text-sm text-ink-muted">{hint}</p>
            <ReviewCheck id={`${id}-reviewed`} label={`${title} reviewed`} />
            <NoteField id={`${id}-notes`} label={`${title} observations and uncertainty`} multiline />
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="centering-heading" className="space-y-5">
        <h2 id="centering-heading" className="font-display text-2xl text-ink">Centering: border ratios only</h2>
        <p className="text-sm text-ink-muted">Measure each border from the outer card edge to the corresponding printed-frame edge. Use the same unit within each pair (for example, millimetres with millimetres, not millimetres with pixels). Keep the card face upright and compare corresponding points; an angled photo or uneven frame can make the comparison misleading.</p>
        <MeasurementDiagram />
        <p className="text-sm text-ink-muted">Left ÷ (left + right) × 100 gives the left percentage; the same calculation applies to the right, top and bottom. Horizontal and vertical are independent, as are front and back. Numbers are rounded to at most two decimal places for display, not measurement precision. A single zero width is valid (100 / 0 or 0 / 100); two zeros are not.</p>
        <NoteField id="measurement-method" label="Measurement unit and method (note any differences between pairs)" />
        <FaceMeasurements face="Front" />
        <label htmlFor="include-back" className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input id="include-back" type="checkbox" checked={includeBack} onChange={(event) => setIncludeBack(event.target.checked)} className="h-4 w-4" />
          <span><PrintValue value={includeBack ? "[Included] " : "[Not included] "} inline />Include optional back measurements</span>
        </label>
        <div hidden={!includeBack}><FaceMeasurements face="Back" /></div>
        <NoteField id="centering-notes" label="Centering uncertainty / why borders cannot be measured" multiline />
        <p className="text-sm text-ink-muted">Computed from your entries only. This tool assigns no condition tier, issuer grade, authenticity finding or price. Borderless or irregular designs may have no meaningful ratio; choose not measurable rather than inventing a border.</p>
      </section>

      <fieldset className="min-w-0 border-t border-border-subtle pt-4 space-y-3">
        <legend className="font-display text-xl text-ink">Notes, photos and disclosure</legend>
        <p className="text-sm text-ink-muted">Keep photos yourself; there is no upload here. These reminders record your own review and do not send a listing or message.</p>
        <ReviewCheck id="photo-front-back" label="Clear front and back photos prepared" />
        <ReviewCheck id="photo-details" label="Close-ups of defects and uncertain areas prepared" />
        <ReviewCheck id="disclosure-reviewed" label="Observed defects, alterations and uncertainty included in my disclosure" />
        <NoteField id="disclosure-notes" label="Photo references, disclosure notes and anything not inspected" multiline />
      </fieldset>
      <noscript><p>JavaScript is off. Print a blank worksheet and record your observations on paper; calculated ratios and the print button need JavaScript. Use your browser’s Print command.</p></noscript>
    </form>
  );
}

function MeasurementDiagram() {
  // An original location schematic, not a plot of entered data or a card image.
  // Identity is carried by direct labels; no categorical palette or grade colors.
  return (
    <figure className="space-y-2">
      <svg className={styles.diagram} viewBox="0 0 320 230" role="img" aria-labelledby="border-diagram-title border-diagram-description">
        <title id="border-diagram-title">Where to measure opposing borders</title>
        <desc id="border-diagram-description">An outer rectangle is the card edge and an inner rectangle is the printed frame. Left and right are horizontal gaps; top and bottom are vertical gaps. Schematic only, not to scale.</desc>
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="75" y="20" width="170" height="190" rx="4" />
          <rect x="100" y="45" width="120" height="140" />
          <path d="M75 115H100 M220 115H245 M160 20V45 M160 185V210" />
        </g>
        <g fill="currentColor" fontSize="14" textAnchor="middle">
          <text x="40" y="120">Left</text><text x="280" y="120">Right</text>
          <text x="160" y="15">Top</text><text x="160" y="227">Bottom</text>
          <text x="160" y="105">Printed</text><text x="160" y="125">frame</text>
        </g>
      </svg>
      <figcaption className="text-sm text-ink-muted">Original schematic, not to scale. Outer rectangle: card edge. Inner rectangle: printed frame. Left and right are horizontal gaps; top and bottom are vertical gaps. Measure each face separately.</figcaption>
    </figure>
  );
}
