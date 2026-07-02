import { describe, expect, it } from "vitest";
import {
  invertToFalseWeakness,
  invertToFalseResistance,
  pickFalseTrait,
  generateFalseInfo,
} from "../scripts/data/false-info.js";
import { CATEGORIES, makeFactKey } from "../scripts/constants.js";
import { CREATURE_TRAIT_SKILLS } from "../scripts/data/trait-skill-map.js";

const richFacts = {
  name: "Test Ghoul",
  traits: ["undead"],
  weaknesses: [{ type: "fire", value: 5, label: "fire" }],
  resistances: [{ type: "cold", value: 5, label: "cold" }],
  immunities: [{ type: "poison", label: "poison" }],
};

const emptyFacts = { name: "Blank Slate", traits: [], weaknesses: [], resistances: [], immunities: [] };

describe("invertToFalseWeakness", () => {
  it("only ever claims a weakness to something the target actually resists/is immune to", () => {
    for (let i = 0; i < 25; i++) {
      const result = invertToFalseWeakness(richFacts, new Set(), () => i / 25);
      expect(result).not.toBeNull();
      expect(result.text).toMatch(/cold|poison/);
    }
  });

  it("returns null when there's nothing to invert", () => {
    expect(invertToFalseWeakness(emptyFacts, new Set())).toBeNull();
  });

  it("excludes a candidate whose true fact has already been revealed to this character", () => {
    // Only "cold" resistance and "poison" immunity are available to invert.
    // If "cold" was already truthfully revealed, only "poison" is safe.
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    for (let i = 0; i < 25; i++) {
      const result = invertToFalseWeakness(richFacts, revealedKeys, () => i / 25);
      expect(result).not.toBeNull();
      expect(result.text).toContain("poison");
      expect(result.text).not.toContain("cold");
    }
  });

  it("returns null when every candidate's true fact has already been revealed", () => {
    const revealedKeys = new Set([
      makeFactKey(CATEGORIES.RESISTANCES, "cold"),
      makeFactKey(CATEGORIES.RESISTANCES, "poison"),
    ]);
    expect(invertToFalseWeakness(richFacts, revealedKeys)).toBeNull();
  });
});

describe("invertToFalseResistance", () => {
  it("only ever claims resistance to something the target is actually weak to", () => {
    const result = invertToFalseResistance(richFacts, new Set(), () => 0);
    expect(result).not.toBeNull();
    expect(result.text).toContain("fire");
  });

  it("returns null when there's nothing to invert", () => {
    expect(invertToFalseResistance(emptyFacts, new Set())).toBeNull();
  });

  it("excludes a candidate whose true fact has already been revealed to this character", () => {
    const revealedKeys = new Set([makeFactKey(CATEGORIES.WEAKNESSES, "fire")]);
    expect(invertToFalseResistance(richFacts, revealedKeys)).toBeNull();
  });
});

describe("pickFalseTrait", () => {
  it("never returns a trait the target actually has", () => {
    for (let i = 0; i < 25; i++) {
      const result = pickFalseTrait(richFacts, () => i / 25);
      expect(result).not.toBeNull();
      expect(richFacts.traits).not.toContain(result.text);
      expect(Object.keys(CREATURE_TRAIT_SKILLS)).toContain(result.text);
    }
  });

  it("returns null only if the target somehow has every known trait", () => {
    const allTraitsFacts = { ...emptyFacts, traits: Object.keys(CREATURE_TRAIT_SKILLS) };
    expect(pickFalseTrait(allTraitsFacts)).toBeNull();
  });
});

describe("generateFalseInfo", () => {
  it("falls back to a false trait when the chosen IWR category has nothing to invert", () => {
    const result = generateFalseInfo(emptyFacts, CATEGORIES.WEAKNESSES, new Set(), () => 0);
    expect(result).not.toBeNull();
    expect(result.category).toBe(CATEGORIES.TRAITS);
  });

  it("uses the chosen category's inversion when material exists", () => {
    const result = generateFalseInfo(richFacts, CATEGORIES.RESISTANCES, new Set(), () => 0);
    expect(result.category).toBe(CATEGORIES.RESISTANCES);
  });

  it("regression: never contradicts a fact already revealed as true this encounter", () => {
    // Reported bug: character crit-succeeded and truthfully learned "Resistant
    // to cold". A later critical failure on the Weaknesses category must not
    // claim "Weak to cold" — it must fall back to something else entirely.
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    for (let i = 0; i < 25; i++) {
      const result = generateFalseInfo(richFacts, CATEGORIES.WEAKNESSES, revealedKeys, () => i / 25);
      expect(result).not.toBeNull();
      expect(result.text).not.toContain("cold");
    }
  });

  it("falls back through every category and returns null if truly nothing is safe to invent", () => {
    // Every IWR fact already revealed, and every possible trait already
    // actually possessed by the target (so no false trait is available
    // either) — nothing safe left to claim.
    const allTraits = { ...richFacts, traits: Object.keys(CREATURE_TRAIT_SKILLS) };
    const revealedKeys = new Set([
      makeFactKey(CATEGORIES.WEAKNESSES, "fire"),
      makeFactKey(CATEGORIES.RESISTANCES, "cold"),
      makeFactKey(CATEGORIES.RESISTANCES, "poison"),
    ]);
    expect(generateFalseInfo(allTraits, CATEGORIES.WEAKNESSES, revealedKeys, () => 0)).toBeNull();
  });
});
