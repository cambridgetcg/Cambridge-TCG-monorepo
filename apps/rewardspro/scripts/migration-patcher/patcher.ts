/**
 * Pure: given a `(source, target, files)` triple, produce a typed
 * `PatchManifest` describing every proposed line-level edit.
 *
 * Read-only — never mutates `files`. The manifest is *advice*; the
 * developer reviews and applies it.
 */
import type { ScannedFile } from "../usage-analyzer/types";
import type { Edit, FilePatch, PatchManifest } from "./types";

export interface PatcherInputs {
  /** Widget-local primitive being replaced (e.g. `rp-mb-card`). */
  source: string;
  /** Shared primitive being adopted (e.g. `rp-card`). */
  target: string;
  /** All widget files to scan for occurrences of `source`. */
  files: ScannedFile[];
  /** Override for testing — defaults to `new Date().toISOString()`. */
  now?: string;
}

export function patch(inputs: PatcherInputs): PatchManifest {
  const filePatches: FilePatch[] = [];
  let totalEdits = 0;

  // Match boundaries:
  //   - CSS selector: `.<source>` followed by non-class character (whitespace, comma, brace, etc.)
  //   - JSX/HTML attr: word boundary on each side (handled by the class= scanner)
  //   - classList.X("<source>"): exact string match
  //
  // We build line-level edits — each occurrence becomes one `Edit`.
  for (const file of inputs.files) {
    const lines = file.content.split("\n");
    const edits: Edit[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (containsSource(line, inputs.source)) {
        edits.push({
          line: i + 1,
          original: line,
          find: inputs.source,
          replace: inputs.target,
        });
      }
    }
    if (edits.length > 0) {
      filePatches.push({ path: file.path, edits });
      totalEdits += edits.length;
    }
  }

  return {
    source: inputs.source,
    target: inputs.target,
    files: filePatches,
    totalEdits,
    caveats: buildCaveats(inputs.source, inputs.target),
    generatedAt: inputs.now ?? new Date().toISOString(),
  };
}

/** Render the manifest as a Markdown changelog suitable for PR review. */
export function renderMarkdown(manifest: PatchManifest): string {
  const lines: string[] = [];
  lines.push(`# Migration: \`.${manifest.source}\` → \`.${manifest.target}\``);
  lines.push("");
  lines.push(
    `Generated: ${manifest.generatedAt} · ${manifest.totalEdits} edit(s) across ${manifest.files.length} file(s)`
  );
  lines.push("");
  if (manifest.caveats.length > 0) {
    lines.push(`## Caveats — review before applying`);
    lines.push("");
    for (const c of manifest.caveats) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push(`## Proposed edits`);
  lines.push("");
  for (const fp of manifest.files) {
    lines.push(`### \`${fp.path}\``);
    lines.push("");
    for (const e of fp.edits) {
      lines.push(`- Line ${e.line}: replace \`${e.find}\` with \`${e.replace}\``);
      lines.push(`  \`\`\``);
      lines.push(`  ${e.original.trim()}`);
      lines.push(`  \`\`\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function containsSource(line: string, source: string): boolean {
  // Three matching contexts (the same set the planner counts):
  //   1. CSS selector: `.<source>` not followed by an identifier char
  //   2. class= / className= attr: source is a whitespace-delimited token
  //   3. classList.X("<source>"): exact-string match
  const dotted = new RegExp(`\\.${escapeRegex(source)}(?![a-z0-9_-])`, "i");
  if (dotted.test(line)) return true;

  // class= / className= attribute scan
  const attrRe = /class(?:Name)?\s*=\s*["']([^"']+)["']/gi;
  for (const m of line.matchAll(attrRe)) {
    if (m[1].split(/\s+/).includes(source)) return true;
  }

  // classList.add/remove/toggle/contains/replace("<source>")
  const listRe = /classList\.\w+\s*\(\s*["']([^"']+)["']/gi;
  for (const m of line.matchAll(listRe)) {
    if (m[1] === source) return true;
  }
  return false;
}

function buildCaveats(source: string, target: string): string[] {
  const out: string[] = [];
  out.push(
    `String-level replacement only — verify the target's CSS shape matches the source (padding, border-radius, min-height, etc.) before applying.`
  );
  // BEM-style elements (`__name`) on the source primitive likely don't
  // exist on the target. Surface that explicitly.
  if (!source.includes("__") && !target.includes("__")) {
    out.push(
      `If \`.${source}\` has BEM elements (\`.${source}__title\`, \`.${source}__icon\`), those are NOT covered by this patch — handle them in a follow-up migration.`
    );
  }
  out.push(
    `Test the affected widget visually (open it in a Shopify theme preview) before merging.`
  );
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
