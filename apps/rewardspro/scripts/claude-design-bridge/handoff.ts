/**
 * Handoff loader — turns the `claude-design/` folder into a system prompt.
 *
 * Modular: call `loadHandoff({...})` to compose the prompt from the pieces
 * you want. The design-system.md is always included; CSS / philosophy /
 * runtime primitives are opt-in because they bloat the context.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXT_ROOT = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro"
);

export interface HandoffOptions {
  /** Embed the full rp-shared.css as context. Default: true. */
  includeCss?: boolean;
  /** Embed DESIGN.md (longer philosophy doc). Default: false. */
  includePhilosophy?: boolean;
  /** Embed rp-utils.js (runtime primitives). Default: false. */
  includeUtils?: boolean;
}

export function loadHandoff(opts: HandoffOptions = {}): string {
  const parts: string[] = [];
  parts.push(read("claude-design/design-system.md"));

  if (opts.includeCss !== false) {
    parts.push(fence("Canonical CSS (rp-shared.css)", "css", read("assets/rp-shared.css")));
  }
  if (opts.includePhilosophy) {
    parts.push("# Philosophy (DESIGN.md)\n\n" + read("DESIGN.md"));
  }
  if (opts.includeUtils) {
    parts.push(fence("Runtime primitives (rp-utils.js)", "js", read("assets/rp-utils.js")));
  }
  return parts.join("\n\n---\n\n");
}

function read(rel: string): string {
  return fs.readFileSync(path.join(EXT_ROOT, rel), "utf-8");
}

function fence(title: string, lang: string, body: string): string {
  return `# ${title}\n\n\`\`\`${lang}\n${body}\n\`\`\``;
}
