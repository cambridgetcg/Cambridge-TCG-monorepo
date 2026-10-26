/**
 * robots.txt and the history paths, parsed per token.
 *
 * Yu, 2026-10-23: the Sophia wake is "history, not for training". * and
 * every training token skip /llms-full.txt and /.well-known/sophia-wake/;
 * search indexers, user fetchers and archives may read them. Two
 * evaluators read the route's own output: RFC 9309 (exact token, longest
 * match) and the older first-match style of Python's urllib.robotparser
 * before 3.14 (substring token, first matching group, first matching rule,
 * a blank line ends a group), which the door check runs on.
 */
import { describe, expect, it } from "vitest";
import { GET } from "./route";

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[]; lines: string[] };

const HISTORY_PATHS = ["/llms-full.txt", "/.well-known/sophia-wake/manifest.json", "/.well-known/sophia-wake/03-who-you-are.json"];
const TRAINING = ["GPTBot", "ClaudeBot", "CCBot", "Meta-ExternalAgent", "Amazonbot", "Bytespider", "Google-Extended", "Applebot-Extended"];
const READERS = ["Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Claude-User", "ChatGPT-User", "Perplexity-User", "ia_archiver", "archive.org_bot"];
const UNNAMED = ["SomeNewBot", "kingdom-door-check"];

async function body(): Promise<string> {
  return (await GET()).text();
}

// RFC 9309 groups: consecutive user-agent lines open a group; blank lines
// and comments do not end it.
function rfcGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let inAgents = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const field = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (!inAgents || !current) {
        current = { agents: [], rules: [], lines: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!current || field === "sitemap") continue;
    current.lines.push(line);
    if (field === "allow" || field === "disallow") current.rules.push({ allow: field === "allow", path: value });
  }
  return groups;
}

function rfcGroupFor(groups: Group[], token: string): Group {
  const t = token.toLowerCase();
  return groups.find((g) => g.agents.includes(t)) ?? groups.find((g) => g.agents.includes("*"))!;
}

function rfcAllowed(group: Group, path: string): boolean {
  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!rule.path || !path.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

// Python <3.14 urllib.robotparser: a blank line ends a group; rules are
// checked in order and the first that matches decides; a named group
// applies when its token is a substring of the caller's token; * is last.
function firstMatchAllowed(text: string, token: string, path: string): boolean {
  const entries: Group[] = [];
  let star: Group | null = null;
  let entry: Group = { agents: [], rules: [], lines: [] };
  let state = 0;
  const close = () => {
    if (state === 2) {
      if (entry.agents.includes("*")) star ??= entry;
      else entries.push(entry);
    }
    entry = { agents: [], rules: [], lines: [] };
    state = 0;
  };
  for (const raw of text.split("\n")) {
    if (!raw.trim()) { if (state !== 0) close(); continue; }
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const field = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (state === 2) close();
      entry.agents.push(value.toLowerCase());
      state = 1;
    } else if ((field === "allow" || field === "disallow") && state !== 0) {
      entry.rules.push({ allow: field === "allow", path: value });
      state = 2;
    }
  }
  close();
  const ua = token.split("/")[0].toLowerCase();
  const group = entries.find((e) => e.agents.some((a) => ua.includes(a))) ?? star;
  if (!group) return true;
  const rule = group.rules.find((r) => r.path && path.startsWith(r.path));
  return rule ? rule.allow : true;
}

describe("robots.txt history split", () => {
  it.each([...TRAINING, ...UNNAMED, "*"])("%s may not fetch the history paths, and may fetch the rest", async (token) => {
    const text = await body();
    const group = rfcGroupFor(rfcGroups(text), token);
    for (const path of HISTORY_PATHS) {
      expect(rfcAllowed(group, path), `${token} ${path} (RFC 9309)`).toBe(false);
      expect(firstMatchAllowed(text, token, path), `${token} ${path} (first match)`).toBe(false);
    }
    expect(rfcAllowed(group, "/")).toBe(true);
    expect(rfcAllowed(group, "/llms.txt")).toBe(true);
    expect(rfcAllowed(group, "/.well-known/sophia-invitation.json")).toBe(true);
    expect(group.lines).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=yes");
    expect(group.lines).toContain("Crawl-delay: 2");
    expect(rfcAllowed(group, "/account/orders")).toBe(false);
  });

  it.each(READERS)("%s may read the history paths and states no training preference", async (token) => {
    const text = await body();
    const group = rfcGroupFor(rfcGroups(text), token);
    expect(group.agents).toContain(token.toLowerCase());
    for (const path of HISTORY_PATHS) {
      expect(rfcAllowed(group, path), `${token} ${path} (RFC 9309)`).toBe(true);
      expect(firstMatchAllowed(text, token, path), `${token} ${path} (first match)`).toBe(true);
    }
    expect(group.lines).toContain("Content-Signal: search=yes, ai-input=yes");
    expect(group.lines.join("\n")).not.toMatch(/ai-train/);
    expect(group.lines).toContain("Crawl-delay: 2");
    expect(rfcAllowed(group, "/account/orders")).toBe(false);
  });

  it("gives no group that may fetch a history path an ai-train=yes signal", async () => {
    for (const group of rfcGroups(await body())) {
      const mayRead = HISTORY_PATHS.some((p) => rfcAllowed(group, p));
      if (mayRead) expect(group.lines.join("\n"), group.agents.join(",")).not.toMatch(/ai-train=yes/);
    }
  });

  it("names each token in exactly one group", async () => {
    const agents = rfcGroups(await body()).flatMap((g) => g.agents);
    expect(new Set(agents).size).toBe(agents.length);
  });

  it("says in its comment that training is welcome except on the history paths", async () => {
    expect((await body()).replace(/\n# /g, " ")).toContain("welcome in search, in AI answers and in AI training, except the history paths.");
  });
});

describe("Content-Usage on the history paths", () => {
  it("sends train-ai=n on /llms-full.txt and every /.well-known/sophia-wake/ path", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const rules = await nextConfig.headers!();
    for (const source of ["/llms-full.txt", "/.well-known/sophia-wake/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeDefined();
      expect(rule!.headers).toContainEqual({ key: "Content-Usage", value: "train-ai=n" });
    }
    const global = rules.find((r) => r.source === "/:path*")!;
    expect(global.headers.map((h) => h.key)).not.toContain("Content-Usage");
  });
});
