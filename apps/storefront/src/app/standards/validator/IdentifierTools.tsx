"use client";

import { useState } from "react";
import { GAMES } from "@cambridge-tcg/sku";
import { Button } from "@/lib/ui/Button";
import { Card } from "@/lib/ui/Card";
import { Field, Input, Select, Textarea } from "@/lib/ui/Input";
import {
  buildIdentifier,
  IDENTIFIER_MAX_LENGTH,
  PUBLIC_IDENTIFIER_GAME_CODES,
  validateIdentifier,
  type IdentifierBuilderFields,
  type IdentifierBuildResult,
  type IdentifierValidationResult,
} from "@/lib/identifier-validation";

const STATUS_LABELS = {
  strict_canonical: "Strict canonical structure",
  normalization_suggested: "Normalization suggested",
  invalid: "Invalid structure",
};

function ValidationResult({ result }: { result: IdentifierValidationResult }) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-display text-lg text-ink">{STATUS_LABELS[result.status]}</h3>
      <p>Input (quoted to make whitespace visible): <code className="break-all whitespace-pre-wrap">{JSON.stringify(result.identifier)}</code></p>
      <p>Strict parser: {result.strict_parse_valid ? "accepted" : "not accepted"}. Canonical status also requires normalization to leave the input unchanged.</p>
      {result.status === "normalization_suggested" && (
        <p>Suggested identifier: <code className="break-all">{result.normalized_identifier}</code>. Your input has not been replaced.</p>
      )}
      {result.parts && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Game</dt><dd>{result.game?.name} (<code>{result.parts.game}</code>) — {result.game?.status}</dd>
          <dt>Set</dt><dd className="font-mono break-all">{result.parts.set}</dd>
          <dt>Number</dt><dd className="font-mono break-all">{result.parts.number}</dd>
          <dt>Language</dt><dd><code>{result.parts.lang}</code> — {result.language?.listed_for_game ? "listed" : "unlisted"} for this game</dd>
          <dt>Variant tokens</dt><dd className="font-mono break-all">{result.variant_tokens.join(" / ") || "none"}</dd>
        </dl>
      )}
      {result.status === "normalization_suggested" && <p>Fields above describe the suggestion, not the original input.</p>}
      <ul className="list-disc pl-5 space-y-2 text-ink-muted">
        {result.annotations.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <p className="text-ink-muted">Structure only. This does not establish catalog existence, card identity, authenticity, or deck legality.</p>
    </div>
  );
}

const BUILDER_FIELDS = [
  { field: "set", label: "Set code", hint: "Publisher set code, e.g. op01. No spaces or hyphens." },
  { field: "number", label: "Card number", hint: "Alphanumeric, e.g. 001. Leading zeroes are preserved." },
  { field: "lang", label: "Language", hint: "Two letters, e.g. ja or en. Shape is checked, not ISO membership." },
  { field: "variant", label: "Variant (optional)", hint: "Hyphen-joined alphanumeric tokens, e.g. alt-art. Not proof of a printing." },
] as const;

export default function IdentifierTools() {
  const [identifier, setIdentifier] = useState("");
  const [validation, setValidation] = useState<IdentifierValidationResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [fields, setFields] = useState<IdentifierBuilderFields>({ game: "op", set: "", number: "", lang: "", variant: "" });
  const [built, setBuilt] = useState<IdentifierBuildResult | null>(null);
  const fieldError = built && !built.ok ? built : null;

  function changeField(field: keyof IdentifierBuilderFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setBuilt(null);
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="check-heading">
        <Card padding="lg" className="space-y-5">
          <h2 id="check-heading" className="font-display text-2xl">Check an identifier</h2>
          <p className="text-sm text-ink-muted">Checks run in your browser. This tool does not send or save your input. Whitespace is preserved, not trimmed. Up to {IDENTIFIER_MAX_LENGTH} characters.</p>
          <form noValidate onSubmit={(event) => {
            event.preventDefault();
            if (identifier.length > IDENTIFIER_MAX_LENGTH) {
              setValidation(null);
              setInputError(`Use at most ${IDENTIFIER_MAX_LENGTH} characters. Your input has not been shortened.`);
            } else {
              setInputError(null);
              setValidation(validateIdentifier(identifier));
            }
          }} className="space-y-4">
            <Field label="Identifier" htmlFor="identifier-input" error={inputError ? <span id="identifier-error">{inputError}</span> : undefined}>
              <Textarea id="identifier-input" rows={2} value={identifier} placeholder="op-op01-001-ja" autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "identifier-error" : undefined} onChange={(event) => {
                setIdentifier(event.target.value);
                setValidation(null);
                setInputError(null);
              }} />
            </Field>
            <Button type="submit">Check structure</Button>
          </form>
          <div role="status" aria-live="polite" aria-atomic="true">
            {validation && <ValidationResult result={validation} />}
            {inputError && <p className="text-sm text-danger">Identifier exceeds the tool limit.</p>}
          </div>
        </Card>
      </section>

      <section aria-labelledby="build-heading">
        <Card padding="lg" className="space-y-5">
          <h2 id="build-heading" className="font-display text-2xl">Build from known fields</h2>
          <p className="text-sm text-ink-muted">Bring the identity; the builder only joins it. The package lowercases set, number, language and variant fields. It does not trim spaces or resolve language aliases; any further normalization appears separately below.</p>
          <form noValidate onSubmit={(event) => {
            event.preventDefault();
            setBuilt(buildIdentifier({ ...fields, variant: fields.variant === "" ? undefined : fields.variant }));
          }} className="space-y-4">
            <Field label="Game" htmlFor="builder-game" error={fieldError?.field === "game" ? <span id="builder-game-error">{fieldError.message}</span> : undefined}>
              <Select id="builder-game" value={fields.game} onChange={(event) => changeField("game", event.target.value)} aria-invalid={fieldError?.field === "game"} aria-describedby={fieldError?.field === "game" ? "builder-game-error" : undefined}>
                {PUBLIC_IDENTIFIER_GAME_CODES.map((code) => <option key={code} value={code}>{GAMES[code].name} ({code})</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {BUILDER_FIELDS.map(({ field, label, hint }) => (
                <Field key={field} label={label} htmlFor={`builder-${field}`} hint={<span id={`builder-${field}-hint`}>{hint}</span>} error={fieldError?.field === field ? <span id={`builder-${field}-error`}>{fieldError.message}</span> : undefined}>
                  <Input id={`builder-${field}`} value={fields[field] ?? ""} autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" aria-invalid={fieldError?.field === field} aria-describedby={`builder-${field}-${fieldError?.field === field ? "error" : "hint"}`} onChange={(event) => changeField(field, event.target.value)} />
                </Field>
              ))}
            </div>
            <Button type="submit" variant="secondary">Build identifier</Button>
          </form>
          <div role="status" aria-live="polite" aria-atomic="true">
            {fieldError && <p className="text-sm text-danger">{fieldError.field === "identifier" ? fieldError.message : `Check the ${fieldError.field} field. The package reports its first error; correct it and build again.`}</p>}
            {built?.ok && <div className="space-y-4"><p className="text-sm">Built identifier: <code className="break-all">{built.identifier}</code></p><ValidationResult result={built.validation} /></div>}
          </div>
        </Card>
      </section>
      <noscript><p>The reference below is readable without JavaScript. Enable JavaScript to run the local checker and builder, or use the documented API separately.</p></noscript>
    </div>
  );
}
