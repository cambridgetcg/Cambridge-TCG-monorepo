import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  KEY_EXIT_COMPLETENESS,
  KEY_EXIT_CREDENTIAL_NOTE,
  KEY_EXIT_EVIDENCE_STATE,
  KEY_EXIT_INVENTORY_VERSION,
  KEY_EXIT_LINEARIZATION,
  KEY_EXIT_RETAINED,
  KEY_EXIT_STATIC_STATES,
  KEY_EXIT_UNKNOWN_LAYERS,
  KEY_EXPIRED_REPLACEMENT_CASE,
  KEY_REPLACEMENT_CASES,
  keyExitNextActions,
} from "@/lib/agents/key-exit-inventory";
import { KEY_EXPIRY_DATE_MAX_DAYS, KEY_EXPIRY_PRESETS } from "@/lib/agents/key-expiry";
import { AGENT_DOCS_URL, authRefusal, SIGNED_ACTS_DOCS_URL, signedActRefusal } from "@/lib/agents/refusals";
import AgentsMethodology from "./page";

const REPO_ROOT = resolve(process.cwd(), "../..");

/** The page as text, with markup and HTML entities removed. */
function pageText(): string {
  return renderToStaticMarkup(<AgentsMethodology />)
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
    expect(text).toContain(KEY_EXIT_COMPLETENESS);
    expect(text).not.toMatch(/\.\. /);
  });

  it("scopes the inventory to the answers that carry it", () => {
    const text = pageText();

    expect(text).toContain(
      "The tool returns the same list with a preview of an unrevoked key, live or expired, and with a performed revocation",
    );
    expect(text).toContain("the not-active answer carries only its message and the docs link");
    expect(text).not.toContain("every preview and every revocation");
    expect(text).not.toContain("One answer for every string");
    expect(text).toContain("suspended_with_agent");
    expect(text).toContain("archived_with_agent");
  });

  it("states the door, its timing, its replacement path and what possession proves", () => {
    const markup = renderToStaticMarkup(<AgentsMethodology />);
    const text = pageText();

    expect(markup).toContain('id="ending-a-key"');
    expect(text).toContain("Any key's holder can end that key at the MCP gate with agent.revoke_key");
    expect(text).toContain(KEY_EXIT_LINEARIZATION);
    // Every replacement case, so the page never states the active one alone.
    for (const entry of [...KEY_REPLACEMENT_CASES, KEY_EXPIRED_REPLACEMENT_CASE]) {
      expect(text).toContain(`${entry.label}: ${entry.text}`);
    }
    // The 403 reason holds for unexpired keys only; an expired key's answers say nothing of status.
    expect(text).toContain("A preview of an unexpired key can show that its agent is suspended or archived");
    expect(text).toContain("so the answers for an expired key say nothing of that status either");
    expect(text).not.toContain("A preview of a live key can show");
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
    expect(summary).toContain("`key_expired`");
    expect(summary).toContain("nothing is sent before a key expires");
    for (const path of [
      "apps/storefront/src/lib/agents/tool-access.ts",
      "apps/storefront/src/lib/agents/auth.ts",
      "apps/storefront/src/lib/agents/key-revocation.ts",
      "apps/storefront/src/lib/agents/key-exit-inventory.ts",
      "apps/storefront/src/lib/agents/operator-actions.ts",
      "apps/storefront/src/lib/agents/key-expiry.ts",
      "apps/storefront/drizzle/0151_agent_key_expiry.sql",
    ]) {
      expect(sidecar.source_code).toContain(path);
    }
    for (const path of sidecar.source_code) {
      expect(existsSync(resolve(REPO_ROOT, path)), path).toBe(true);
    }
  });
});

describe("agents methodology: key expiry", () => {
  it("has the section the key_expired refusal links to", () => {
    const markup = renderToStaticMarkup(<AgentsMethodology />);
    const refusal = authRefusal({ ok: false, status: 401, reason_code: "key_expired", error: "key expired" });
    const href = refusal.next_actions[0]?.href ?? "";
    expect(href.startsWith(`${AGENT_DOCS_URL}#`)).toBe(true);
    expect(markup).toContain(`id="${href.split("#")[1]}"`);
    expect(markup).toContain('id="key-expiry"');
  });

  it("states the choices, the default, the clock, and what the holder and operator see", () => {
    const text = pageText();

    // The sentence names the parser's presets and date bound; if those move, it must too.
    expect(KEY_EXPIRY_PRESETS.map((preset) => preset.days)).toEqual([7, 30, 90, 365]);
    expect(KEY_EXPIRY_DATE_MAX_DAYS).toBe(366);
    expect(text).toContain("an operator picks 7, 30 or 90 days or 1 year from the moment of minting");
    expect(text).toContain("a date from tomorrow to 366 days ahead (the key stops at 00:00 UTC on that date), or never");
    expect(text).toContain("the form pre-selects 90 days");
    expect(text).toContain("by the database's clock");
    expect(text).toContain("It is fixed at mint and never extended.");
    expect(text).toContain("Keys minted before this option existed have no expiry");
    expect(text).toContain("agent.self returns key_expires_at");
    expect(text).toContain("X-Agent-Key-Expires");
    expect(text).toContain(
      "Nothing is sent to anyone when a key nears or reaches its expiry: no email and no other message.",
    );
  });

  it("answers expiry as the gate does, keeps revoked keys merged, and says how to rotate", () => {
    const text = pageText();

    expect(text).toContain("The gate answers 401 with reason_code key_expired, whatever the agent's status");
    expect(text).toContain('error_description="The access token expired"');
    expect(text).toContain("A key that was revoked gets unknown_or_revoked_key, whether or not it had also expired.");
    expect(text).toContain(
      "mint a new key, move the agent to it, check the old key's last use at /account/agents, then revoke the old key",
    );
    expect(text).toContain("It ends the key's authority and deletes nothing");
    expect(text).toContain("or expired when the key has passed its expiry, whatever the agent's status");
  });

  it("says an AI agent chose the options, not Yu", () => {
    const text = pageText();

    expect(text).toContain("were chosen by an AI agent under Yu's standing delegation, not by Yu");
    expect(text).toContain("Yu has not reviewed them");
  });

  it("drops the claims expiry makes false", () => {
    const text = pageText();

    expect(text).not.toContain("Rejects with 401 if the key is unknown or revoked. A known key");
    expect(text).toContain("or if it has passed its expiry (key_expired");
    expect(text).not.toContain("5 active keys each");
    expect(text).toContain("5 live keys each; a revoked or expired key does not count");
    expect(text).not.toContain("not a live key.");
    expect(text).not.toContain("the docs link. The tool tells nobody");
    expect(text).not.toContain("with a preview of a live key and");
  });
});

describe("agents methodology: signed acts", () => {
  it("carries the anchor every signed-act refusal points at", () => {
    const html = renderToStaticMarkup(<AgentsMethodology />);
    const anchor = new URL(SIGNED_ACTS_DOCS_URL).hash.slice(1);
    expect(anchor).toBe("signed-acts");
    expect(html).toContain(`id="${anchor}"`);
    expect(html).toContain('id="where-to-keep-your-key"');
    for (const code of ["signed_acts_closed", "act_unverified", "signing_key_ended", "key_cap_reached"] as const) {
      const hrefs = signedActRefusal(code).next_actions.map((next) => next.href).filter(Boolean);
      for (const href of hrefs) expect(href).toBe(SIGNED_ACTS_DOCS_URL);
    }
  });

  it("says who decided what, that it is closed in production, and what the privacy notice lacks", () => {
    const text = pageText();
    expect(text).toContain('Yu, who runs Cambridge TCG, decided on 2026-11-10 to offer agents their own signing keys ("Yes offer the keys").');
    expect(text).toContain("is an AI agent's design and defaults, which Yu has not reviewed.");
    expect(text).toContain("The path is closed unless a deployment opens it, and production has not");
    expect(text).toContain("Since 10 November 2026 the privacy notice describes the records it keeps, in words an AI agent wrote.");
    expect(text).not.toMatch(/\b(?:chosen|decided|approved) by Yu\b/);
  });

  it("says where a key can be kept only as far as it has been run", () => {
    const text = pageText();
    expect(text).toContain("examples/agents/held-key-signer.mjs");
    expect(text).toContain("it has not been run against a deployment with signed acts open.");
    expect(text).toContain(
      "A vault. One that only stores a key and attaches it to requests cannot sign with it; one that signs inside itself was not tried here.",
    );
    expect(text).toContain(
      "A hosted chat app. Not run. A chat app has nowhere to keep a private key out of the conversation. The MCP endpoint is custom JSON-RPC over HTTPS, not a standard remote MCP server.",
    );
    // Nothing that was not run is stated as fact either way.
    expect(text).not.toContain("Does not reach this door");
    expect(text).not.toContain("A key that stays in a vault cannot sign");
    expect(text).toContain("nothing a client says about itself is treated as identity");
  });
});

describe("agents methodology: spaces in the production build", () => {
  it("keeps the space after every tag that text follows", async () => {
    // Next's production compiler drops the leading space of a JSX text that
    // wraps over lines and holds an entity ("</code>takes an act ..."), and
    // Vitest's does not, so this asks the production compiler itself
    // (scripts/jsx-entity-space-audit.mjs). The fix is an explicit {" "}.
    const { findDroppedSpaces } = (await import(
      pathToFileURL(resolve(process.cwd(), "scripts/jsx-entity-space-audit.mjs")).href
    )) as { findDroppedSpaces: (target: string) => Promise<{ hits: unknown[]; unknown: unknown[] }> };
    const found = await findDroppedSpaces(resolve(process.cwd(), "src/app/methodology/agents/page.tsx"));
    expect(found.hits).toEqual([]);
    expect(found.unknown).toEqual([]);
  });
});
