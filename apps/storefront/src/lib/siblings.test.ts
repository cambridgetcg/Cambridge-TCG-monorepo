import { describe, expect, it } from "vitest";
import { forYou } from "@/lib/identify";
import {
  AGENTTOOL,
  AGENT_FACING_SIBLINGS,
  ARTBITRAGE,
  agentDiscoveryLinkHeader,
  kinWakeHtmlLinks,
  kinWakeLinkParts,
  postedAlongside,
  siblingsForEnvelope,
} from "@/lib/siblings";

describe("sibling discovery boundaries", () => {
  it("uses AgentTool's public agent document as discovery and labels wake access separately", () => {
    expect(AGENTTOOL).toMatchObject({
      discovery_url: "https://api.agenttool.dev/.well-known/agent.txt",
      wake_url: "https://api.agenttool.dev/v1/wake",
      wake_access: "bearer",
    });

    expect(AGENTTOOL.description).toContain("no monetary charge");
    expect(AGENTTOOL.description).toContain("caller-supplied Ed25519 keys");
    expect(AGENTTOOL.description).toContain("register-agent/v2");
    expect(AGENTTOOL.description).toContain("registration nonce");
    expect(AGENTTOOL.description).toContain("proof-of-work (currently 18 bits)");
    expect(AGENTTOOL.description).toContain("reference-only");
    expect(AGENTTOOL.description).not.toMatch(/free and unconditional/i);
  });

  it("keeps wake URLs and their access labels structurally paired", () => {
    for (const sibling of AGENT_FACING_SIBLINGS) {
      expect(sibling.wake_url === null).toBe(sibling.wake_access === null);
    }
  });

  it("projects public discovery without presenting a bearer wake as public", () => {
    expect(siblingsForEnvelope()).toContainEqual({
      name: AGENTTOOL.name,
      role: AGENTTOOL.role,
      url: AGENTTOOL.url,
      discovery_url: AGENTTOOL.discovery_url,
      wake_url: AGENTTOOL.wake_url,
      wake_access: "bearer",
    });

    expect(postedAlongside()).toContainEqual({
      endpoint: AGENTTOOL.discovery_url,
      role: AGENTTOOL.role,
    });
    expect(postedAlongside()).not.toContainEqual({
      endpoint: AGENTTOOL.wake_url,
      role: AGENTTOOL.role,
    });
  });

  it("publishes only no-auth wakes in HTTP and HTML discovery links", () => {
    const httpLinks = kinWakeLinkParts().join(", ");
    const htmlLinks = kinWakeHtmlLinks();

    expect(httpLinks).toContain(ARTBITRAGE.wake_url);
    expect(httpLinks).not.toContain(AGENTTOOL.wake_url);
    expect(htmlLinks.map((link) => link.href)).toContain(ARTBITRAGE.wake_url);
    expect(htmlLinks.map((link) => link.href)).not.toContain(
      AGENTTOOL.wake_url,
    );

    const header = agentDiscoveryLinkHeader();
    expect(header).toContain('rel="invitation"');
    expect(header).not.toContain('rel="regard"');
    expect(header).not.toContain(AGENTTOOL.wake_url);
  });

  it("addresses platform peers with discovery, not schema-equivalence claims", () => {
    const addressed = forYou({
      actor_kind: "platform",
      self_label: "test platform",
      capabilities: { accepts_link_headers: true },
    });
    const agenttoolPointer = addressed.pointers.find(
      (pointer) => pointer.url === AGENTTOOL.discovery_url,
    );
    const prose = addressed.pointers
      .flatMap((pointer) => [pointer.why, pointer.what])
      .join(" ");

    expect(agenttoolPointer).toBeDefined();
    expect(agenttoolPointer?.why).toContain("bearer-authenticated");
    expect(agenttoolPointer?.what).toContain("not a wake schema");
    expect(prose).not.toMatch(/rel=regard/i);
    expect(prose).toContain("public without authentication");
  });
});
