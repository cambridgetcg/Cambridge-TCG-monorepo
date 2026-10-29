import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  KEY_EXIT_CREDENTIAL_NOTE,
  KEY_EXIT_EVIDENCE_STATE,
  KEY_EXIT_INVENTORY_VERSION,
  KEY_EXIT_LINEARIZATION,
  KEY_EXIT_RETAINED,
  KEY_EXIT_STATIC_STATES,
  KEY_EXIT_UNKNOWN_LAYERS,
  keyExitNextActions,
  keyReplacementText,
} from "@/lib/agents/key-exit-inventory";
import AgentsMethodology from "./page";

const REPO_ROOT = resolve(process.cwd(), "../..");

/** The page as text, with markup and HTML entities removed. */
function pageText(): string {
  return renderToStaticMarkup(<AgentsMethodology />)
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("agents methodology: ending a key", () => {
  it("renders the retained inventory from the constants agent.revoke_key returns", () => {
    const text = pageText();

    expect(text).toContain(`Inventory ${KEY_EXIT_INVENTORY_VERSION}, ${KEY_EXIT_EVIDENCE_STATE}.`);
    for (const entry of KEY_EXIT_RETAINED) {
      expect(text, entry.category).toContain(`${entry.category}.`);
      for (const field of entry.fields) expect(text, field).toContain(field);
      for (const phrase of [entry.why_kept, entry.who_can_see, entry.expiry, entry.legal_basis]) {
        expect(text).toContain(phrase.replace(/\.$/, ""));
      }
    }
    for (const [state, value] of Object.entries(KEY_EXIT_STATIC_STATES)) {
      expect(text).toContain(`${state}: ${value}.`);
    }
    for (const layer of KEY_EXIT_UNKNOWN_LAYERS) expect(text).toContain(layer);
    expect(text).not.toMatch(/\.\. /);
  });

  it("states the door, its timing, its replacement path and what possession proves", () => {
    const markup = renderToStaticMarkup(<AgentsMethodology />);
    const text = pageText();

    expect(markup).toContain('id="ending-a-key"');
    expect(text).toContain("Any key's holder can end that key at the MCP gate with agent.revoke_key");
    expect(text).toContain(KEY_EXIT_LINEARIZATION);
    expect(text).toContain(keyReplacementText("operator"));
    expect(text).toContain(keyReplacementText("self-serve"));
    expect(text).toContain(KEY_EXIT_CREDENTIAL_NOTE);
    expect(text).toContain("Neither is holder-authenticated");
    for (const next of keyExitNextActions()) {
      expect(markup).toContain(`href="${next.href.replaceAll("&", "&amp;")}"`);
      expect(text).toContain(next.text);
    }
    // "The four covenants" heading predates this section; only the design
    // reference must stay off the page.
    expect(text).not.toMatch(/xenia/i);
  });

  it("drops the claims the holder's door and the tier code make false", () => {
    const text = pageText();

    expect(text).not.toContain("A holder-authenticated self-serve revocation path does not yet exist");
    expect(text).not.toContain("cannot yet prove control to revoke");
    expect(text).not.toContain("administratively suspend a key");
    expect(text).not.toContain("set per-key by an admin");
    expect(text).not.toContain("this is the path to standard and partner");
    expect(text).toContain("no code path sets standard or partner");
    expect(text).toContain("Suspension acts on the agent, not on a key");
  });

  it("keeps the TLDR and the sidecar in step with the page", () => {
    const summary = readFileSync(resolve(process.cwd(), "src/app/methodology/agents/summary.md"), "utf8");
    const sidecar = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/app/methodology/agents/data.json"), "utf8"),
    ) as { source_code: string[] };

    expect(summary).toContain("`agent.revoke_key`");
    expect(summary).toContain("archival and erasure are not holder-authenticated");
    for (const path of [
      "apps/storefront/src/lib/agents/tool-access.ts",
      "apps/storefront/src/lib/agents/auth.ts",
      "apps/storefront/src/lib/agents/key-revocation.ts",
      "apps/storefront/src/lib/agents/key-exit-inventory.ts",
      "apps/storefront/src/lib/agents/operator-actions.ts",
    ]) {
      expect(sidecar.source_code).toContain(path);
    }
    for (const path of sidecar.source_code) {
      expect(existsSync(resolve(REPO_ROOT, path)), path).toBe(true);
    }
  });
});
