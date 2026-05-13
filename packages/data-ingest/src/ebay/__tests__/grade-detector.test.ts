import { describe, expect, it } from "vitest";
import { detectGrade, isGraded } from "../grade-detector.js";

describe("grade-detector", () => {
  it("detects PSA 10 with optional whitespace", () => {
    expect(detectGrade("Charizard PSA 10 1st Edition")).toEqual({
      grade_company: "PSA",
      grade_value: "10",
    });
    expect(detectGrade("Charizard PSA10")).toEqual({
      grade_company: "PSA",
      grade_value: "10",
    });
  });

  it("detects PSA half-grades", () => {
    for (const g of ["9.5", "8.5", "7.5", "6.5", "5.5"]) {
      expect(detectGrade(`Card PSA ${g}`)).toEqual({ grade_company: "PSA", grade_value: g });
    }
  });

  it("detects BGS Black Label 10", () => {
    expect(detectGrade("Pikachu BGS BLACK LABEL 10")).toEqual({
      grade_company: "BGS",
      grade_value: "BGS_BLACK_LABEL_10",
    });
  });

  it("detects BGS Pristine 10", () => {
    expect(detectGrade("Pikachu BGS Pristine 10")).toEqual({
      grade_company: "BGS",
      grade_value: "BGS_PRISTINE_10",
    });
  });

  it("detects bare BGS grade", () => {
    expect(detectGrade("Lightning Bolt BGS 9.5")).toEqual({
      grade_company: "BGS",
      grade_value: "9.5",
    });
  });

  it("detects CGC Pristine 10", () => {
    expect(detectGrade("Charizard CGC PRISTINE 10")).toEqual({
      grade_company: "CGC",
      grade_value: "CGC_PRISTINE_10",
    });
    expect(detectGrade("Charizard CGC Perfect 10")).toEqual({
      grade_company: "CGC",
      grade_value: "CGC_PRISTINE_10",
    });
  });

  it("detects CGC standard grade", () => {
    expect(detectGrade("Charizard CGC 9.5")).toEqual({
      grade_company: "CGC",
      grade_value: "9.5",
    });
  });

  it("detects SGC", () => {
    expect(detectGrade("Card SGC 10")).toEqual({ grade_company: "SGC", grade_value: "10" });
    expect(detectGrade("Card SGC 9.5")).toEqual({ grade_company: "SGC", grade_value: "9.5" });
  });

  it("detects HGA / ARS / TAG", () => {
    expect(detectGrade("Card HGA 10")).toEqual({ grade_company: "HGA", grade_value: "10" });
    expect(detectGrade("Card ARS 9.5")).toEqual({ grade_company: "ARS", grade_value: "9.5" });
    expect(detectGrade("Card TAG 9")).toEqual({ grade_company: "TAG", grade_value: "9" });
  });

  it("returns null when no grade present", () => {
    expect(detectGrade("Charizard 1st Edition Shadowless")).toEqual({
      grade_company: null,
      grade_value: null,
    });
    expect(detectGrade("")).toEqual({ grade_company: null, grade_value: null });
  });

  it("isGraded returns boolean", () => {
    expect(isGraded("PSA 10 Card")).toBe(true);
    expect(isGraded("BGS 9.5 Card")).toBe(true);
    expect(isGraded("Raw Charizard")).toBe(false);
    expect(isGraded("")).toBe(false);
  });
});
