import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HandSimulator, { type SimCard } from "./HandSimulator";

const card = (number: string): SimCard => ({
  sku: `op-${number.toLowerCase()}-en`, card_number: number, name: number, rarity: "C",
  image_url: `https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-${number}-EN.png`,
});

describe("HandSimulator", () => {
  it("prints the credit of the pictures it deals", () => {
    const entries = [{ card: card("OP01-002"), quantity: 4 }, { card: card("OP01-003"), quantity: 4 }];
    const markup = renderToStaticMarkup(<HandSimulator leader={card("OP01-001")} entries={entries} credits={["© One", "© One"]} onClose={() => {}} />);
    expect(markup).toMatch(/OP-OP01-00[23]-EN\.png/);
    expect(markup).toContain("English reference images · printing not verified · © One</p>");
  });
});
