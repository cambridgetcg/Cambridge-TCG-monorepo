import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLAY_RESOURCES } from "./resources";
import { GET as getPlayIndex } from "@/app/api/v1/play/index.json/route";
import { GET as getGlossary } from "@/app/api/v1/play/glossary/route";

describe("paused deck validator discovery contract", () => {
  it("marks both API and HTML adoption surface paused", () => {
    const byId = new Map(PLAY_RESOURCES.map((resource) => [resource.id, resource]));
    expect(byId.get("api_deck_validate")?.status).toBe("paused");
    expect(byId.get("page_deck_check")?.status).toBe("paused");

    const page = readFileSync(
      `${process.cwd()}/src/app/play/deck-check/page.tsx`,
      "utf8",
    );
    expect(page).toContain("Deck validation is paused");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("handleSubmit");
  });

  it("propagates paused status through the play index and glossary", async () => {
    const index = await (await getPlayIndex()).json();
    const validator = index.resources.find(
      (resource: { id: string }) => resource.id === "api_deck_validate",
    );
    expect(index.counts.paused).toBeGreaterThanOrEqual(2);
    expect(index.availability_notes.deck_validate).toContain("HTTP 503");
    expect(validator.status).toBe("paused");

    const glossary = await (await getGlossary()).json();
    expect(glossary._links.see_also.deck_validate_status).toContain("paused");
  });
});
