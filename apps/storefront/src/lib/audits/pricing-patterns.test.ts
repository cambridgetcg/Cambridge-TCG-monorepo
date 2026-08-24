import { describe, expect, it } from "vitest";
import { findHardcodedPricingMath } from "./pricing-patterns";

describe("hardcoded pricing-math signals", () => {
  it.each([
    "const retailPrice = baseGbp * 1.15;",
    "const ebayPrice = amount * 1.25;",
    "const totalWithVat = subtotal * 1.20;",
    "const cashOffer = wholesale * 0.55;",
    "const tradeInCredit = price * 0.77;",
  ])("flags a multiplier in pricing context: %s", (body) => {
    expect(findHardcodedPricingMath(body)).not.toBeNull();
  });

  it("recognises a pricing identifier on an adjacent line", () => {
    expect(
      findHardcodedPricingMath("const retailPrice =\n  baseGbp * 1.15;"),
    ).not.toBeNull();
  });

  it.each([
    "const controlPoint = radius * 1.15;",
    "const volume = gain * 0.55;",
    "const probability = sample * 0.77;",
    "x + Math.cos(angle) * radius * 1.20",
  ])("ignores the same number in non-pricing math: %s", (body) => {
    expect(findHardcodedPricingMath(body)).toBeNull();
  });

  it.each([
    "const margin = 24;\nconst radius = x * 1.15;",
    "const amount = particles.length;\nconst radius = x * 1.15;",
    "const cost = path.length;\nconst opacity = alpha * 0.55;",
  ])("ignores pricing-like words in an adjacent completed statement: %s", (body) => {
    expect(findHardcodedPricingMath(body)).toBeNull();
  });
});
