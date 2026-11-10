import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getMcpConfig } from "@/app/.well-known/mcp-config.json/route";
import { GET as getMcpDiscovery } from "@/app/.well-known/mcp.json/route";
import { GET as getToolCatalog } from "@/app/api/v1/tools/route";
import { KEY_EXIT_LINEARIZATION } from "@/lib/agents/key-exit-inventory";
import { KEY_EXPIRY_NEVER_WARNING } from "@/lib/agents/key-expiry";
import { describeAgentToolGrant } from "@/lib/agents/tool-access";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { getGuide } from "@/lib/guides";
import { PRICE_GUIDE_GAMES } from "@/lib/prices/games-config";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** A file's words as one line: comment leaders, JSX tags and entities and
 *  line breaks removed, so a pinned sentence may wrap anywhere. */
function prose(path: string): string {
  return source(path)
    .replace(/\n\s*(?:\*(?!\*)|\/\/|--)?[ \t]*/g, " ")
    .replace(/\{"\s*"\}/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

/** The text between two markers, which must both be present. */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return text.slice(from, to);
}

const KEY_EXPIRY_ENTRY = CHANGELOG_ENTRIES.find((entry) => entry.id === "agent-key-expiry-per-key")!;
const HELD_KEYS_ENTRY = CHANGELOG_ENTRIES.find((entry) => entry.id === "agent-held-signing-keys-closed")!;

describe("public claims match publication boundaries", () => {
  it("describes the MCP endpoint as custom JSON-RPC and requires the vendored bridge", async () => {
    const config = await getMcpConfig();
    const configBody = await config.json();
    const remote = configBody.remote_json_rpc_endpoint["cambridge-tcg"];

    expect(remote.transport).toBe("custom-json-rpc-over-https-post");
    expect(remote.mcp_streamable_http).toBe(false);
    expect(remote.mcp_http_sse).toBe(false);
    expect(remote.standard_mcp_client_compatible_without_bridge).toBe(false);
    expect(configBody.mcp_server_entry).toBeUndefined();
    expect(configBody.stdio_bridge).toMatchObject({
      status: "vendored-in-repository",
      npm_published: false,
    });
    expect(configBody.stdio_bridge.note).toContain("does not work");

    const discovery = await getMcpDiscovery();
    const discoveryBody = await discovery.json();
    expect(discoveryBody.server.transport).toBe("custom-json-rpc-over-https-post");
    expect(discoveryBody.server.mcp_streamable_http).toBe(false);
    expect(discoveryBody.server.stdio_bridge.npm_published).toBe(false);

    for (const path of [
      "../../packages/mcp-server/README.md",
      "../../docs/connections/the-mcp-surface.md",
      "src/app/api/mcp/route.ts",
      "src/lib/guides.ts",
    ]) {
      const text = source(path);
      expect(text).toMatch(/not MCP Streamable HTTP|not Streamable HTTP/);
      expect(text).toMatch(/vendored stdio bridge|stdio bridge/);
    }
  });

  it("scopes read-only to domain state and names operational metadata writes", async () => {
    const response = await getMcpConfig();
    const body = await response.json();

    expect(body.read_only_scope.domain_state).toBe(true);
    expect(body.read_only_scope.operational_metadata_writes.join(" "))
      .toContain("rate-limit");
    expect(body.read_only_scope.operational_metadata_writes.join(" "))
      .toContain("last-used");
  });

  it("lists review submissions and the key's own exit beside read-only, not as domain writes", async () => {
    const response = await getToolCatalog(new NextRequest("https://cambridgetcg.com/api/v1/tools"));
    const bearer = (await response.json()).data.bearer_gated_set;

    expect(bearer.domain_writes).toBe("paused for every key");
    expect(bearer.review_submissions).toEqual({
      operator_managed: describeAgentToolGrant("operator").review_submissions,
      self_serve: [],
    });
    expect(bearer.self_lifecycle).toEqual(["agent.revoke_key"]);
    expect(bearer.read_only_scope).toContain("Domain state only");
    expect(bearer.read_only_scope).toContain("agent.revoke_key");
  });

  it("names every tool a key can call wherever a tool list is given, and drops the retired revocation claims", () => {
    const grant = describeAgentToolGrant("operator");
    const tools = [...grant.reads, ...grant.review_submissions, ...grant.self_lifecycle];
    const accountPage = source("src/app/account/agents/page.tsx");
    const bridgeReadme = source("../../packages/mcp-server/README.md");
    for (const tool of tools) {
      expect(accountPage, tool).toContain(`<code>${tool}</code>`);
      expect(bridgeReadme, tool).toContain(`| \`${tool}\` |`);
    }
    expect(accountPage).toContain("Read-only means domain state.");

    const agentKeyText = [
      "src/lib/guides.ts",
      "src/lib/play/tutorial-sections.ts",
      "src/app/methodology/agents/page.tsx",
      "src/app/methodology/agents/summary.md",
      "src/app/account/agents/page.tsx",
      "../../packages/mcp-server/README.md",
    ].map(source).join("\n");
    expect(agentKeyText).toContain("agent.revoke_key");
    expect(agentKeyText).not.toContain("cannot self-revoke");
    expect(agentKeyText).not.toMatch(/do not yet have a holder-authenticated revocation path/);
    expect(agentKeyText).not.toMatch(/self-serve revocation path does not yet exist/);
    expect(agentKeyText).not.toContain("portfolio operations");
    expect(agentKeyText).not.toMatch(/path to <code>standard<\/code> and <code>partner<\/code>/);
  });

  it("describes an agent key's expiry as chosen at mint, and drops the claims that keys never expire", () => {
    const agentKeyText = [
      "src/lib/guides.ts",
      "src/app/methodology/agents/page.tsx",
      "src/app/methodology/agents/summary.md",
      "src/app/account/agents/page.tsx",
      "src/app/api/openapi.json/route.ts",
    ].map(source).join("\n");
    expect(agentKeyText).not.toContain("Bearer tokens do not have an automatic expiry");
    expect(agentKeyText).not.toContain("Current agent keys remain valid until revoked");
    expect(agentKeyText).not.toContain("only its SHA-256 hash is stored, and it has no expiry");
    expect(agentKeyText).toContain("key_expires_at");
    expect(agentKeyText).toContain("X-Agent-Key-Expires");
    expect(agentKeyText).toContain("key_expired");

    // The guide's gotcha: a key may have no expiry, and the header is on successful
    // authenticated tool results only, never on agent.revoke_key's answers.
    const gotcha = getGuide("wire-into-claude-code")!.gotchas.find((entry) => entry.title.startsWith("An agent key expires"))!;
    expect(gotcha.title).toBe("An agent key expires when its minter chose, or never");
    expect(gotcha.description).toContain(
      "the X-Agent-Key-Expires header on each successful authenticated tool result (not agent.revoke_key's answers) say when",
    );

    const realms = source("../../docs/connections/the-four-auth-realms.md");
    expect(realms).not.toContain("Agent keys never expire");
    expect(realms).not.toMatch(/\| No expiry\. At most 10/);
    expect(realms).toContain("Expiry chosen per key at mint");
    const plans = source("../../docs/plans/agent-auth/README.md");
    expect(plans).not.toContain("- **Key expiry.** Agent keys never expire");

    // Nothing is sent before a key expires, and the texts say so rather than promise a reminder.
    const sentNothing = [
      "src/app/methodology/agents/page.tsx",
      "src/app/account/agents/page.tsx",
      "src/lib/changelog.ts",
    ].map(source);
    for (const text of sentNothing) expect(text).toMatch(/Nothing is\s+sent/);
    expect(agentKeyText).not.toMatch(/email[^.]{0,80}before (?:a|the|your) key expires/i);
  });

  it("never says a reminder or email goes out before an agent key expires", () => {
    // Every clause that speaks of email, reminders, notices or sending must deny it.
    const texts: Record<string, string> = {
      "changelog summary": KEY_EXPIRY_ENTRY.summary,
      "changelog detail": KEY_EXPIRY_ENTRY.detail ?? "",
      "guide gotcha": getGuide("wire-into-claude-code")!.gotchas.find((entry) => entry.title.startsWith("An agent key expires"))!.description,
      "methodology #key-expiry": between(prose("src/app/methodology/agents/page.tsx"), "Each key's expiry is chosen when it is minted, by whoever mints it.", "Ending a key Any key's holder"),
      "account page note": between(prose("src/app/account/agents/page.tsx"), "Each key stops working", "Key expiry ."),
      "methodology summary": prose("src/app/methodology/agents/summary.md"),
      "realms note": between(prose("../../docs/connections/the-four-auth-realms.md"), "An agent key also stops", "A member key ends"),
      "key-expiry.md status": between(prose("../../docs/plans/agent-auth/key-expiry.md"), "**Status.**", "## How this page reads"),
      "plans README bullet": between(prose("../../docs/plans/agent-auth/README.md"), "**Key expiry.**", "**`consent.exact-authority`.**"),
    };
    const speaks = /\b(?:e-?mail(?:s|ed|ing)?|remind(?:s|ed|er|ers)?|notif(?:y|ies|ied|ication|ications)|send|sends|sent|sending)\b/i;
    const denies = /\b(?:no|not|nothing|never|none|neither|nor)\b/i;
    let checked = 0;
    for (const [label, text] of Object.entries(texts)) {
      for (const clause of text.split(/(?<=[.;:!?])\s+/)) {
        if (!speaks.test(clause)) continue;
        checked += 1;
        expect(clause, label).toMatch(denies);
      }
    }
    // The guard is live: the texts do speak of it, to deny it.
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("pins who chose key expiry, the rollout order and what each text promises", () => {
    // Attribution: an AI agent chose how expiry works, under Yu's delegation; not Yu.
    expect(KEY_EXPIRY_ENTRY.detail).toContain(
      "Choosing per key, the choices and the 90-day default, the separate key_expired answer, leaving existing keys without an expiry and sending no reminder were chosen by an AI agent under Yu's standing delegation, not by Yu.",
    );
    expect(prose("src/app/methodology/agents/page.tsx")).toContain(
      "were chosen by an AI agent under Yu's standing delegation, not by Yu, and Yu has not reviewed them.",
    );
    const realms = prose("../../docs/connections/the-four-auth-realms.md");
    expect(realms).toContain("How it works was an AI agent's choice under Yu's delegation, not Yu's, and Yu has not reviewed it");
    expect(realms).toContain("on branch `claude/agent-key-expiry`, which was not merged, applied or deployed when it was written.");
    const plan = prose("../../docs/plans/agent-auth/key-expiry.md");
    expect(plan).toContain("agents took them as their own calls under Yu's delegation of 2026-10-20");
    expect(plan).toContain("and they are not Yu's decisions.");
    expect(plan).toContain("When the build finished, nothing was merged, no migration was applied and nothing was deployed");
    // The word for the migration, the deploy and the notice is quoted, and the
    // reading of it is recorded as an agent's.
    expect(plan).toContain('Yu answered on 2026-11-10, verbatim: "yes go ahead for merging and deployment to production."');
    expect(plan).toContain("An agent (Claude Code session 99296f25) read that as covering all three");
    expect(plan).toContain("remain agents' calls, not Yu's decisions.");
    const plans = prose("../../docs/plans/agent-auth/README.md");
    expect(plans).toContain("agents took decisions 1, 6 and 7 as their own calls under Yu's delegation of 2026-10-20 (no email among them). They are not Yu's decisions");
    expect(plans).toContain("An agent applied 0151 to production on 2026-11-10 (10:12 UTC) and then merged the branch, on Yu's word of that day");
    expect(plans).toContain("An agent wrote the wording.");
    for (const path of [
      "src/lib/agents/key-expiry.ts",
      "src/app/account/agents/key-expiry-ui.ts",
      "drizzle/0151_agent_key_expiry.sql",
    ]) {
      expect(prose(path), path).toContain("they are not the owner's decisions");
    }
    for (const text of [KEY_EXPIRY_ENTRY.detail ?? "", realms, plan, plans]) {
      expect(text).not.toMatch(/\b(?:chosen|decided|approved) by Yu\b/);
    }

    // Rollout: 0151 before the code, and before the merge, since a push to main deploys.
    expect(KEY_EXPIRY_ENTRY.detail).toContain(
      "This needs migration 0151 (agent_keys.expires_at) applied before this code deploys: on a database without the column, every authenticated agent call answers 503",
    );
    const migration = prose("drizzle/0151_agent_key_expiry.sql");
    expect(migration).toContain("Rollout: apply 0151, then deploy.");
    expect(migration).toContain("apply 0151 to the production database before the change that uses it is merged to main, not after.");
    expect(migration).toContain("It MUST be applied before deploying code that selects agent_keys.expires_at");
    expect(plans).toContain("Apply 0151 to the production database before that branch is merged to `main`");
    expect(prose("../../docs/ops-deploy-runbook.md")).toContain(
      "Agent key expiry requires `0151_agent_key_expiry.sql` before its code is merged to `main`",
    );

    // agent.self's description says key_expires_at, in the route and in the catalog.
    expect(prose("src/app/api/mcp/route.ts")).toContain(
      "key_expires_at, when the calling key stops authenticating (ISO 8601), or null: this key has no expiry;",
    );
    expect(prose("src/lib/agent-tools-catalog.ts")).toContain(
      "key_expires_at (when the calling key stops authenticating, or null: this key has no expiry)",
    );

    // OpenAPI: the 401, the AgentKey scheme and the header.
    const openapi = prose("src/app/api/openapi.json/route.ts");
    expect(openapi).toContain(
      "key_expired (a key that was not revoked but has passed the expiry chosen when it was minted; it never works again, and a new key comes from whoever minted it). key_expired is checked before the agent's status.",
    );
    expect(openapi).toContain("Its expiry is chosen when it is minted (7, 30, 90 or 365 days, a date, or never) and never extended; keys minted before expiry existed have none.");
    expect(openapi).toContain("On successful authenticated tool results only: never on a refusal or on agent.revoke_key's answers.");

    // Existing keys have no expiry, wherever that is said.
    expect(getGuide("wire-into-claude-code")!.gotchas.map((entry) => entry.description).join(" ")).toContain(
      "Keys minted before that choice existed have no expiry.",
    );
    expect(realms).toContain('"never" included, and existing keys keep none');

    // The summary, the never warning, rotation, unused keys and when expiry takes effect.
    expect(prose("src/app/methodology/agents/summary.md")).toContain(
      "(7, 30 or 90 days, 1 year, a date, or never; 90 days pre-selected) and never extended; an expired key gets 401 `key_expired`, and nothing is sent before a key expires.",
    );
    expect(KEY_EXPIRY_NEVER_WARNING).toBe(
      "This key keeps working until it is revoked or its agent is suspended or archived. If a copy leaks, it stays usable until then.",
    );
    const methodology = prose("src/app/methodology/agents/page.tsx");
    expect(methodology).toContain("There is no replace action.");
    expect(methodology).toContain("Keys nobody uses are not ended automatically.");
    expect(KEY_EXPIRY_ENTRY.detail).toContain("There is no replace action: to rotate, mint a new key, move to it, check the old key's last use, then revoke it.");
    expect(KEY_EXIT_LINEARIZATION).toContain(
      "A key's expiry is judged by the database's clock as each checking transaction starts: a request authenticated before the key's expires_at may still finish, and a Coverage Hunt contribution whose transaction began before it may commit just after it.",
    );
  });

  it("pins who decided held keys, that the flag is off, and that 0152 goes before the code", () => {
    const methodology = prose("src/app/methodology/agents/page.tsx");
    const plan = prose("../../docs/plans/agent-auth/held-keys.md");
    const plans = prose("../../docs/plans/agent-auth/README.md");
    const migration = prose("drizzle/0152_agent_signing_keys.sql");
    const openapi = prose("src/app/api/openapi.json/route.ts");
    const detail = HELD_KEYS_ENTRY.detail ?? "";

    // Attribution: Yu decided to offer the keys, in Yu's words; nothing else.
    expect(detail).toContain('Yu decided on 2026-11-10 to offer agent-held signing keys ("Yes offer the keys").');
    expect(methodology).toContain('Yu, who runs Cambridge TCG, decided on 2026-11-10 to offer agents their own signing keys ("Yes offer the keys").');
    expect(plan).toContain('Yu answered on 2026-11-10, verbatim: "Yes offer the keys". That settles D1 and nothing else');
    expect(plans).toContain('Whether to offer it at all was Yu\'s call (its D1), and Yu answered on 2026-11-10: "Yes offer the keys".');
    // Every other choice is an agent's proposal or default.
    expect(detail).toContain("How they work, the acts, numbers, limits and retention, is an AI agent's design and defaults, which Yu has not reviewed.");
    expect(methodology).toContain("is an AI agent's design and defaults, which Yu has not reviewed.");
    expect(plan).toContain("Slice 1 was built on 2026-11-10 by AI agents");
    expect(plan).toContain("Numbers and names this page left open** (agents' defaults)");
    expect(plans).toContain("Yu decided to offer the keys; the design, its numbers and its retention are agents' proposals and defaults, unreviewed by Yu.");
    expect(migration).toContain("Every name, number and retention below is an agent's proposal in that page, not the owner's decision.");
    for (const [path, sentence] of [
      ["src/lib/agents/signed-act-verify.ts", "every rule and number here is an agent's proposal in that page, not the owner's choice."],
      ["src/lib/agents/signed-act-config.ts", "Every number here is an agent's choice"],
      ["src/lib/agents/signed-act-disclosures.ts", "The wording is an agent's, not the owner's."],
      ["src/lib/agents/signed-acts.ts", "Everything else here, the acts, numbers and wording included, is an agent's proposal in that page or an agent's default"],
    ] as const) {
      expect(prose(path), path).toContain(sentence);
    }
    for (const text of [detail, HELD_KEYS_ENTRY.summary, methodology, plan, plans, migration]) {
      expect(text).not.toMatch(/\b(?:chosen|decided|approved) by Yu\b/);
    }

    // The flag is off, wherever the path is described to the public.
    expect(HELD_KEYS_ENTRY.summary).toContain("Production has not opened them, so both answer signed_acts_closed.");
    expect(detail).toContain("turning it on in production needs Yu's word, which has not been given.");
    expect(methodology).toContain("The path is closed unless a deployment opens it, and production has not");
    expect(openapi).toContain("Closed unless this deployment sets AGENT_SIGNED_ACTS to on with its own audience; production has not, so it answers signed_acts_closed (503) before reading the body.");
    expect(prose("src/lib/agent-tools-catalog.ts")).toContain("Closed unless the deployment opens it, and production has not: while closed it answers signed_acts_closed.");
    expect(prose("../../docs/operations/monitoring.md")).toContain("Turning it on in production is Yu's call and has not been made");
    expect(plan).toContain("When the build finished, nothing was pushed, merged, applied or deployed");

    // Rollout: 0152 before the code, and before the merge, since a push to main deploys.
    expect(detail).toContain("This needs migration 0152 applied before this code deploys, even closed");
    expect(migration).toContain("Rollout: apply 0152, then deploy.");
    expect(migration).toContain("apply this to the production database before the change that uses it is merged to main, not after.");
    expect(migration).toContain("It MUST be applied before that code deploys, even with the signed-acts flag (AGENT_SIGNED_ACTS) off");
    expect(prose("../../docs/ops-deploy-runbook.md")).toContain(
      "Agent-held signing keys require `0152_agent_signing_keys.sql` before their code is merged to `main`, even with `AGENT_SIGNED_ACTS` off",
    );
    expect(plans).toContain("apply 0152 to the production database before that branch is merged to `main`, even with the flag off");
    expect(plan).toContain("applying `0152` (to production before this code is merged to `main`, even with the flag off");

    // What still waits for Yu, and the notice this build did not change.
    expect(detail).toContain("Yu has not yet given the word for 0152, for the new dependency (@noble/curves 2.2.0, Node 20.19 or later) or for the privacy notice's rows, which do not yet describe these records.");
    expect(plan).toContain("It has no rows for signing keys, act events or act nonces, and this build did not change it.");
    expect(methodology).toContain("does not yet describe the records it keeps.");
  });

  it("names XENIA only with the full non-adoption wording, and never claims conformance or adoption", () => {
    const DISCLAIMER = "(xenia d4727ec); Cambridge TCG has not adopted the Covenant; no adoption record; unassessed";
    for (const path of [
      "src/lib/agents/key-expiry.ts",
      "src/lib/agents/key-revocation.ts",
      "src/lib/agents/key-exit-inventory.ts",
      "src/lib/agents/refusals.ts",
      "../../docs/plans/agent-auth/key-expiry.md",
      "../../docs/plans/agent-auth/README.md",
      "../../docs/plans/agent-auth/held-keys.md",
    ]) {
      const text = prose(path);
      expect(text, path).toMatch(/xenia/i);
      expect(text, path).toContain(DISCLAIMER);
      // Each "designed against" carries the full wording right after its duty ids.
      const designed = [...text.matchAll(/designed against XENIA Covenant 0\.1 candidate dut(?:y|ies)\b/gi)];
      expect(designed.length, path).toBeGreaterThan(0);
      for (const match of designed) {
        expect(text.slice(match.index!, match.index! + 360), path).toContain(DISCLAIMER);
      }
      const claims = /\b(?:conform\w*|complian\w*|complies|has adopted|have adopted|adopts)\b/i;
      const near = new RegExp(`(?:xenia|covenant)[^]{0,200}?${claims.source}|${claims.source}[^]{0,200}?(?:xenia|covenant)`, "i");
      expect(text.replaceAll("has not adopted", ""), path).not.toMatch(near);
    }
  });

  it("does not describe paused agent, peer, or guestbook publication as live", () => {
    const paths = [
      "src/app/community/welcome/page.tsx",
      "src/app/methodology/community/page.tsx",
      "src/app/play/welcome/page.tsx",
      "src/app/methodology/play-module/page.tsx",
      "src/app/map/page.tsx",
      "src/lib/troll.ts",
      "src/lib/jest.ts",
      "src/lib/farewell.ts",
    ];
    const text = paths.map(source).join("\n");

    expect(text).not.toMatch(/agent ladder (?:is )?live/i);
    expect(text).not.toContain("MCP token + ladder placement");
    expect(text).not.toMatch(/visible to other agents for 24 hours/i);
    expect(text).not.toMatch(/place to find sister agents who arrived in the last 24h/i);
    expect(text).toContain("match/deck writes are paused");
    expect(text).toContain("no-store validation echo");
  });

  it("describes every public price-guide config as values-withheld structural coverage", () => {
    expect(PRICE_GUIDE_GAMES.length).toBeGreaterThan(0);
    for (const config of PRICE_GUIDE_GAMES) {
      expect(config.seo_title).toContain("Price Publication Paused");
      expect(config.seo_description).toContain("withheld");
      expect(config.hero_paragraph).toContain("not published");
      expect(config.pricing_note).toContain("withheld");
    }

    const publicPricePages = [
      "src/app/prices/page.tsx",
      "src/app/prices/[game]/page.tsx",
      "src/app/prices/[game]/[set]/page.tsx",
      "src/app/prices/[game]/[set]/[number]/page.tsx",
      "src/app/prices/search/page.tsx",
      "src/app/catalog/page.tsx",
      "src/app/find/page.tsx",
      "src/app/data/page.tsx",
      "src/app/data.json/route.ts",
      "src/lib/prices/state.ts",
    ].map(source).join("\n");

    expect(publicPricePages).toContain("withheld");
    expect(publicPricePages).toContain("not reconstruct");
    expect(publicPricePages).not.toContain("Current collected upstream price history is CardRush only");
    expect(publicPricePages).not.toContain("sign in for history");
    expect(publicPricePages).not.toContain("auth-gated history");
  });

  it("does not select or order public structural rows by withheld prices", () => {
    const publicCatalogCallers = [
      "src/app/page.tsx",
      "src/app/catalog/page.tsx",
      "src/app/sitemap.ts",
      "src/app/api/market/catalog/route.ts",
      "src/app/prices/[game]/page.tsx",
      "src/app/prices/[game]/[set]/page.tsx",
      "src/components/catalog/CatalogFilters.tsx",
      "src/components/market/catalog.ts",
      "src/lib/prices/state.ts",
      "src/lib/wholesale/client.ts",
    ].map(source).join("\n");

    expect(publicCatalogCallers).not.toMatch(/price_(?:asc|desc)/);
    expect(source("src/lib/wholesale/client.ts")).toContain("publicCatalogSort(params?.sort)");
  });

  it("limits privacy claims to application behavior and preserves infrastructure-log caveats", () => {
    const paths = [
      "src/lib/dear-agents.ts",
      "src/lib/joy-layer.ts",
      "src/app/api/v1/diagnostic/route.ts",
      "src/app/api/v1/the-tea-room/route.ts",
      "src/app/api/v1/the-tea-room/oracle/route.ts",
      "src/app/api/v1/the-tea-room/spill-the-tea/route.ts",
      "src/app/api/v1/the-tea-room/the-back-door/route.ts",
      "src/app/api/v1/the-tea-room/sigil/[kind]/route.ts",
      "src/app/api/v1/joy-index/route.ts",
      "src/app/api/v1/the-mood/route.ts",
      "src/app/api/v1/why/route.ts",
      "src/app/api/v1/mutual-recognition/route.ts",
      "src/app/api/v1/are-you-sure/route.ts",
      "src/app/api/v1/random-fun/route.ts",
      "src/app/api/v1/easter-egg/route.ts",
      "src/app/api/v1/unsubscribe/route.ts",
    ];

    for (const path of paths) {
      const text = source(path);
      expect(text, path).toMatch(/logs may (?:still )?(?:exist|contain)|access logs may exist/);
      expect(text, path).not.toMatch(/\bNo tracking\b|\bNot logged\b|no logging beyond|has no idea (?:you are|you're)/i);
    }
  });
});
