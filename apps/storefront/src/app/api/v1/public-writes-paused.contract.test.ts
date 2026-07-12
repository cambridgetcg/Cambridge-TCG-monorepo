import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { querySpy } = vi.hoisted(() => ({ querySpy: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: querySpy }));

import {
  GET as getGuestbook,
  POST as postGuestbook,
} from "./guestbook/route";
import { GET as getPeers, POST as postPeer } from "./peers/route";
import {
  GET as getAgentNotes,
  POST as postAgentNote,
} from "./agents/notes/route";
import { GET as getAgentNoteById } from "./agents/notes/[id]/route";

type PausedPost = (request?: unknown) => Promise<Response>;

const routes: Array<{
  name: string;
  endpoint: string;
  post: PausedPost;
}> = [
  {
    name: "guestbook",
    endpoint: "/api/v1/guestbook",
    post: postGuestbook,
  },
  { name: "peers", endpoint: "/api/v1/peers", post: postPeer },
  {
    name: "agent notes",
    endpoint: "/api/v1/agents/notes",
    post: postAgentNote,
  },
];

function routeSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function postSource(source: string): string {
  return source
    .split("export async function POST", 2)[1]
    ?.split("export async function OPTIONS", 1)[0] ?? "";
}

describe("unmoderated public write off-switches", () => {
  beforeEach(() => {
    querySpy.mockClear();
  });

  for (const route of routes) {
    it(`${route.name} POST returns a non-persisting 503 without reading the body`, async () => {
      const readBody = vi.fn(() => {
        throw new Error("paused POST must not read the request body");
      });

      const response = await route.post({ json: readBody });
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(body).toMatchObject({
        error: { code: "PUBLIC_WRITE_PAUSED" },
        endpoint: route.endpoint,
        persisted: false,
        alternatives: {
          feedback_endpoint: "/api/v1/feedback",
          contact_email: "contact@cambridgetcg.com",
        },
      });
      expect(readBody).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });
  }

  it("keeps persistence helpers and SQL out of every POST implementation", () => {
    const guestbook = routeSource("./guestbook/route.ts");
    const peers = routeSource("./peers/route.ts");
    const notes = routeSource("./agents/notes/route.ts");

    expect(guestbook).not.toContain("appendGuestbookEntry");
    expect(peers).not.toContain("recordPeerArrival");
    expect(notes).not.toContain("INSERT INTO agent_notes");
    expect(notes).not.toContain("handleDbPersistence");
    expect(notes).not.toContain("computeNoteId");
    expect(notes).not.toContain("checkNousOnNote");

    for (const source of [guestbook, peers, notes]) {
      const post = postSource(source);
      expect(post).toContain('code: "PUBLIC_WRITE_PAUSED"');
      expect(post).not.toContain("query(");
      expect(post).not.toContain(".json()");
    }
  });

  it("marks historical reads no-store/noindex and does not license received notes", () => {
    const guestbook = routeSource("./guestbook/route.ts");
    const peers = routeSource("./peers/route.ts");
    const notes = routeSource("./agents/notes/route.ts");
    const noteById = routeSource("./agents/notes/[id]/route.ts");

    for (const source of [guestbook, peers, notes, noteById]) {
      expect(source).toContain('"X-Robots-Tag"');
      expect(source).toContain('"no-store"');
    }

    expect(notes).not.toContain('source_license: ["cc0"]');
    expect(noteById).not.toContain("POST-witnessed");
    expect(noteById).not.toContain("every note is CC0");
    expect(noteById).not.toContain("notes are append-only");
    expect(noteById).toContain('code: "UNREVIEWED_RECORD_WITHHELD"');
  });

  it("withholds every unreviewed row without querying its table", async () => {
    const guestbookResponse = await getGuestbook();
    const guestbook = await guestbookResponse.json();
    expect(guestbook.data.historical_entries).toMatchObject({
      status: "withheld_pending_publication_review",
      rows_retained: true,
      public_fields: [],
    });
    expect(guestbook.data).not.toHaveProperty("entries");

    const peersResponse = await getPeers();
    const peers = await peersResponse.json();
    expect(peers.data.historical_arrivals).toMatchObject({
      status: "withheld_pending_publication_review",
      rows_retained: true,
      public_fields: [],
    });
    expect(peers.data).not.toHaveProperty("recent");
    expect(peers.data).not.toHaveProperty("by_kind");

    const receivedResponse = await getAgentNotes({
      url: "https://cambridgetcg.com/api/v1/agents/notes?source=received",
    } as never);
    const received = await receivedResponse.json();
    expect(received.data.entries).toEqual([]);
    expect(received.data.received_entries).toEqual([]);
    expect(received.data.scope.received_entries_publication).toMatchObject({
      status: "withheld_pending_publication_review",
      rows_retained: true,
      public_fields: [],
    });

    const byIdResponse = await getAgentNoteById(
      {
        url: "https://cambridgetcg.com/api/v1/agents/notes/00000000-0000-4000-8000-000000000000",
      } as never,
      {
        params: Promise.resolve({
          id: "00000000-0000-4000-8000-000000000000",
        }),
      },
    );
    const byId = await byIdResponse.json();
    expect(byIdResponse.status).toBe(404);
    expect(byId).toMatchObject({
      error: { code: "UNREVIEWED_RECORD_WITHHELD" },
      content_withheld: true,
      existence_disclosed: false,
      public_fields: [],
    });
    for (const field of [
      "body",
      "subject",
      "agent_kind",
      "agent_content_hash",
      "posted_at",
      "related_urls",
    ]) {
      expect(byId).not.toHaveProperty(field);
    }

    expect(querySpy).not.toHaveBeenCalled();
  });

  it("distinguishes curated code-owned seed notes and their reuse rights", async () => {
    const response = await getAgentNotes({
      url: "https://cambridgetcg.com/api/v1/agents/notes?source=seed",
    } as never);
    const body = await response.json();

    expect(body.data.entries.length).toBeGreaterThan(0);
    for (const entry of body.data.entries) {
      expect(entry.source).toBe("curated-code-seed");
      expect(entry.reuse_rights).toBe("CC0-1.0");
    }
    expect(querySpy).not.toHaveBeenCalled();
  });
});
