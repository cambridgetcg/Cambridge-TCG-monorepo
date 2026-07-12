import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/culture/answering-rhymes/route";
import {
  ANSWERING_RHYME_KINDS,
  ANSWERING_RHYMES,
  ANSWERING_RHYMES_RESPONSE_RIGHTS,
  getAnsweringRhyme,
  getAnsweringRhymesBySku,
  type InfluenceAssessment,
} from "../answering-rhymes";

function expectDocumentedInfluenceToCarryEvidence(
  influence: InfluenceAssessment,
) {
  if (influence.status === "documented") {
    expect(influence.evidence_urls.length).toBeGreaterThan(0);
  } else {
    expect(influence.status).toBe("not-claimed");
    expect(influence.evidence_urls).toEqual([]);
  }
}

describe("Answering Rhymes corpus", () => {
  it("keys a real Cambridge manga-background SKU to an Artbitrage museum identity", () => {
    const relation = ANSWERING_RHYMES[0];

    expect(relation.card.sku).toBe("OP-OP05-119-JP-V11F7");
    expect(relation.card.name).toBe("モンキー・D・ルフィ(/漫画背景/漫画絵)");
    expect(relation.artwork.source).toBe("artic");
    expect(relation.artwork.id).toBe("77333");
    expect(relation.artwork.identity).toBe("artic:77333");
    expect(relation.key).toBe(
      `${relation.card.sku}::${relation.artwork.identity}`,
    );
    expect(getAnsweringRhyme(relation.key)).toBe(relation);
  });

  it("carries evidence for identity, rights, and the historical/material context", () => {
    const relation = ANSWERING_RHYMES[0];
    const supportedFacts = new Set(
      relation.evidence.map((item) => item.supports),
    );

    expect(supportedFacts).toEqual(
      new Set([
        "card-identity",
        "artwork-identity-and-rights",
        "material-and-historical-context",
      ]),
    );
    expect(relation.evidence.length).toBeGreaterThanOrEqual(3);
    for (const item of relation.evidence) {
      expect(item.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps relation kinds and documented influence as separate claims", () => {
    for (const relation of ANSWERING_RHYMES) {
      for (const kind of relation.relation.kinds) {
        expect(ANSWERING_RHYME_KINDS).toContain(kind);
      }
      expect(relation.relation.kinds).not.toContain("documented-influence");

      expectDocumentedInfluenceToCarryEvidence(
        relation.relation.documented_influence,
      );
    }
  });

  it("does not let the open annotation or artwork rights leak onto the card image", () => {
    const relation = ANSWERING_RHYMES[0];

    expect(relation.card.rights).toMatchObject({
      status: "unverified",
      license: "NOASSERTION",
      use: "reference-only",
      image_reuse: false,
    });
    expect(relation.artwork.rights).toMatchObject({
      status: "public-domain-per-source",
      public_domain: true,
      image_reuse: true,
    });
    expect(relation.artwork.rights.license).toContain("Public Domain");
    expect(relation.provenance.artbitrage_record_url).toBe(
      "https://artbitrage.io/api/museum/artic/77333",
    );
    expect(relation.rights.annotation_license).toBe("CC0-1.0");
    expect(relation.rights.boundary).toContain(
      "does not license the card image",
    );
    expect(ANSWERING_RHYMES_RESPONSE_RIGHTS.license).toBe("NOASSERTION");
  });

  it("filters by SKU without making case another identity boundary", () => {
    expect(getAnsweringRhymesBySku("op-op05-119-jp-v11f7")).toHaveLength(1);
    expect(getAnsweringRhymesBySku("OP-DOES-NOT-EXIST")).toEqual([]);
    expect(getAnsweringRhymesBySku()).toHaveLength(ANSWERING_RHYMES.length);
  });
});

describe("GET /api/v1/culture/answering-rhymes", () => {
  it("filters optionally and declares the mixed-rights response NOASSERTION", async () => {
    const req = new NextRequest(
      "https://cambridgetcg.com/api/v1/culture/answering-rhymes?sku=OP-OP05-119-JP-V11F7",
    );
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.count).toBe(1);
    expect(body.data.relations[0].card.sku).toBe("OP-OP05-119-JP-V11F7");
    expect(body.data.rights_boundary.license).toBe("NOASSERTION");
    expect(body._meta.license).toBe("NOASSERTION");
  });

  it("returns the whole corpus when no SKU filter is supplied", async () => {
    const req = new NextRequest(
      "https://cambridgetcg.com/api/v1/culture/answering-rhymes",
    );
    const body = await (await GET(req)).json();

    expect(body.data.filter.sku).toBeNull();
    expect(body.data.count).toBe(ANSWERING_RHYMES.length);
  });
});
