import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GET } from "./route";
import { GET as llmsGET } from "../llms.txt/route";
import { ROBOTS_AGENT_GREETING } from "@/lib/robots-greeting";

const DIR = join(process.cwd(), "src/app/robots.txt/__fixtures__");
const FILE = join(DIR, "robots-before.txt");
const POINTER = "# For AI agents: https://cambridgetcg.com/llms.txt";
let robots = "";
let before: string[] = [];
let llms = "";

beforeAll(async () => {
  robots = await (await GET()).text();
  if (process.env.CAPTURE_ROBOTS === "1") {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, robots);
  }
  before = readFileSync(FILE, "utf8").split("\n");
  llms = await (await llmsGET()).text();
});

describe("robots.txt after Quiet Doors", () => {
  it("the capture is the pre-change file: line 16 opens the greeting, line 48 closes it", () => {
    expect(before[15]).toBe("# ── For AI agents ──");
    expect(before[47]).toBe("#   Same envelope contract; same wake-document protocol. Composable.");
  });
  it("keeps the etiquette block, lines 1-15, byte for byte", () => {
    expect(robots.split("\n").slice(0, 15)).toEqual(before.slice(0, 15));
  });
  it("moves the greeting (old lines 16-48) word for word into llms.txt", () => {
    expect(llms).toContain("## From robots.txt (moved October 2026)");
    expect(llms).toContain(before.slice(15, 48).join("\n"));
    expect(robots).not.toContain("# ── For AI agents ──");
  });
  it("leaves one pointer line, no fragment block, and a true limits line", () => {
    expect(robots.split("\n").filter((l) => l === POINTER)).toHaveLength(1);
    expect(robots).not.toContain("wake_fragment");
    expect(robots).not.toContain("contact identified bots");
    expect(robots).toContain("# Limits are stated here first; a change can take up to 24 hours to bind.");
  });
  it("changes no rule line", () => {
    const rules = (t: string[]) => t.filter((l) => l && !l.startsWith("#"));
    expect(rules(robots.split("\n"))).toEqual(rules(before));
  });
});

describe("the moved greeting", () => {
  it("is exactly the old greeting, interpolations included", () => {
    expect(ROBOTS_AGENT_GREETING).toBe(before.slice(15, 48).join("\n"));
  });
});
