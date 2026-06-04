/**
 * Structured edits derived from migration-planner suggestions.
 *
 * The patcher emits a `PatchManifest` — a typed list of proposed
 * line-level replacements — plus a human-readable Markdown changelog.
 * Neither artifact modifies source. The developer reviews the manifest,
 * applies the edits manually (or pipes the JSON into a separate
 * applier), and verifies the result.
 *
 * This is the safest possible "writer of changes" — no source mutation,
 * no shell-out, no library-managed diffs that can silently desync.
 */
export interface Edit {
  /** 1-indexed line number where the original token appears. */
  line: number;
  /** Original line content (for human verification). */
  original: string;
  /** What the original token / class name was (e.g. `.rp-mb-card`). */
  find: string;
  /** What to replace it with (e.g. `.rp-card`). */
  replace: string;
}

export interface FilePatch {
  /** Source-relative path. */
  path: string;
  edits: Edit[];
}

export interface PatchManifest {
  /** Target shared primitive being adopted (e.g. `rp-card`). */
  target: string;
  /** Widget-local primitive being replaced (e.g. `rp-mb-card`). */
  source: string;
  /** Per-file groupings of proposed edits. */
  files: FilePatch[];
  /** Total edit count across all files. */
  totalEdits: number;
  /** Notes a reviewer should consider before applying. */
  caveats: string[];
  generatedAt: string;
}
