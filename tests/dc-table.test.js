import { describe, expect, it } from "vitest";
import {
  LEVEL_DC_TABLE,
  RARITY_ADJUSTMENT,
  computeHiddenDC,
  computeDegreeOfSuccess,
  computeLikelihood,
} from "../scripts/data/dc-table.js";
import { DEGREES, LIKELIHOODS } from "../scripts/constants.js";

describe("LEVEL_DC_TABLE", () => {
  it("matches known official values", () => {
    expect(LEVEL_DC_TABLE[0]).toBe(14);
    expect(LEVEL_DC_TABLE[1]).toBe(15);
    expect(LEVEL_DC_TABLE[9]).toBe(26);
    expect(LEVEL_DC_TABLE[17]).toBe(36);
    expect(LEVEL_DC_TABLE[25]).toBe(50);
  });
});

describe("computeHiddenDC", () => {
  it("uses pf2e's own identificationDCs for NPCs", () => {
    const npc = { type: "npc", identificationDCs: { standard: { dc: 24 } } };
    expect(computeHiddenDC(npc)).toBe(24);
  });

  it("computes level-DC + rarity adjustment for hazards", () => {
    const hazard = {
      type: "hazard",
      level: 5,
      system: { traits: { rarity: "uncommon" } },
    };
    expect(computeHiddenDC(hazard)).toBe(LEVEL_DC_TABLE[5] + RARITY_ADJUSTMENT.uncommon);
  });

  it("clamps hazard level lookups to the table's range", () => {
    const hazard = { type: "hazard", level: 999, system: { traits: { rarity: "common" } } };
    expect(computeHiddenDC(hazard)).toBe(LEVEL_DC_TABLE[25]);
  });
});

describe("computeDegreeOfSuccess", () => {
  it("resolves the four base degrees relative to DC", () => {
    const dc = 20;
    expect(computeDegreeOfSuccess(30, dc, 10)).toBe(DEGREES.CRITICAL_SUCCESS);
    expect(computeDegreeOfSuccess(20, dc, 10)).toBe(DEGREES.SUCCESS);
    expect(computeDegreeOfSuccess(15, dc, 10)).toBe(DEGREES.FAILURE);
    expect(computeDegreeOfSuccess(10, dc, 10)).toBe(DEGREES.CRITICAL_FAILURE);
  });

  it("steps a degree up on a natural 20", () => {
    const dc = 20;
    expect(computeDegreeOfSuccess(15, dc, 20)).toBe(DEGREES.SUCCESS);
    expect(computeDegreeOfSuccess(20, dc, 20)).toBe(DEGREES.CRITICAL_SUCCESS);
  });

  it("cannot step up past critical success on a natural 20", () => {
    expect(computeDegreeOfSuccess(30, 20, 20)).toBe(DEGREES.CRITICAL_SUCCESS);
  });

  it("steps a degree down on a natural 1", () => {
    const dc = 20;
    expect(computeDegreeOfSuccess(20, dc, 1)).toBe(DEGREES.FAILURE);
    expect(computeDegreeOfSuccess(15, dc, 1)).toBe(DEGREES.CRITICAL_FAILURE);
  });

  it("cannot step down past critical failure on a natural 1", () => {
    expect(computeDegreeOfSuccess(5, 20, 1)).toBe(DEGREES.CRITICAL_FAILURE);
  });
});

describe("computeLikelihood", () => {
  it("is always unfamiliar when untrained, regardless of modifier", () => {
    expect(computeLikelihood(50, 10, false)).toBe(LIKELIHOODS.UNFAMILIAR);
  });

  it("buckets by an expected roll total (modifier + ~10), not modifier alone vs. DC", () => {
    const dc = 20;
    expect(computeLikelihood(10, dc, true)).toBe(LIKELIHOODS.CONFIDENT); // succeeds on an average roll
    expect(computeLikelihood(9, dc, true)).toBe(LIKELIHOODS.UNCERTAIN); // just misses an average roll
    expect(computeLikelihood(1, dc, true)).toBe(LIKELIHOODS.UNCERTAIN); // fails on average, not critically
    expect(computeLikelihood(0, dc, true)).toBe(LIKELIHOODS.UNFAMILIAR); // critically fails on an average roll
  });

  it("regression: legendary (+9) vs. a low DC (13) reads Confident, not Unfamiliar", () => {
    // A bare modifier-vs-DC comparison (9 - 13 = -4) would wrongly read
    // Unfamiliar even though this character trounces the DC on any
    // reasonable roll — the DC must be beaten by roll + modifier.
    expect(computeLikelihood(9, 13, true)).toBe(LIKELIHOODS.CONFIDENT);
  });
});
