import { describe, expect, it } from "vitest";
import {
  invertToFalseWeakness,
  invertToFalseResistance,
  pickFalseTrait,
  generateFalseInfo,
} from "../scripts/data/false-info.js";
import { CATEGORIES, makeFactKey } from "../scripts/constants.js";
import { CREATURE_TRAIT_SKILLS, HAZARD_TRAIT_SKILLS } from "../scripts/data/trait-skill-map.js";

const richFacts = {
  name: "Test Ghoul",
  traits: ["undead"],
  weaknesses: [{ type: "fire", value: 5, label: "fire", invertible: true }],
  resistances: [{ type: "cold", value: 8, label: "cold", invertible: true }],
  immunities: [{ type: "poison", label: "poison", invertible: true }],
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

  it("presents a false weakness with the same value/label formatting as a real one, reusing the inverted fact's real magnitude", () => {
    const result = invertToFalseWeakness(richFacts, new Set(), () => 0);
    expect(result.text).toBe("Weak to cold 8");
  });

  it("never turns an immunity pf2e can't have as a weakness (a condition or effect) into a false weakness", () => {
    const zombieLike = {
      ...emptyFacts,
      immunities: [
        { type: "unconscious", label: "unconscious", invertible: false },
        { type: "poison", label: "poison", invertible: true },
      ],
    };
    for (let i = 0; i < 25; i++) {
      expect(invertToFalseWeakness(zombieLike, new Set(), () => i / 25).text).toBe("Weak to poison 5");
    }
  });

  it("returns null when every candidate is a type pf2e can't have as a weakness", () => {
    const onlyConditions = { ...emptyFacts, immunities: [{ type: "doomed", label: "doomed", invertible: false }] };
    expect(invertToFalseWeakness(onlyConditions, new Set())).toBeNull();
  });

  it("falls back to a fixed representative value when inverting an immunity (which carries no real magnitude)", () => {
    // Exclude the "cold" resistance so only the "poison" immunity remains.
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    const result = invertToFalseWeakness(richFacts, revealedKeys, () => 0);
    expect(result.text).toBe("Weak to poison 5");
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

  it("never turns a weakness pf2e can't have as a resistance into a false resistance", () => {
    const vampireLike = { ...emptyFacts, weaknesses: [{ type: "vampire-weaknesses", label: "vampire weaknesses", value: 5, invertible: false }] };
    expect(invertToFalseResistance(vampireLike, new Set())).toBeNull();
  });

  it("presents a false resistance with the same value/label formatting as a real one, reusing the inverted fact's real magnitude", () => {
    const result = invertToFalseResistance(richFacts, new Set(), () => 0);
    expect(result.text).toBe("Resistant to fire 5");
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

  it("lies about a hazard with a hazard trait, never a creature type", () => {
    const pit = { ...emptyFacts, kind: "hazard", traits: ["trap", "mechanical"] };
    for (let i = 0; i < 25; i++) {
      const result = pickFalseTrait(pit, () => i / 25);
      expect(Object.keys(HAZARD_TRAIT_SKILLS)).toContain(result.text);
      expect(pit.traits).not.toContain(result.text);
    }
  });

  it("returns null only if the target somehow has every known trait", () => {
    const allTraitsFacts = { ...emptyFacts, traits: Object.keys(CREATURE_TRAIT_SKILLS) };
    expect(pickFalseTrait(allTraitsFacts)).toBeNull();
  });
});

describe("generateFalseInfo", () => {
  it("returns null rather than switching to a false trait when the chosen IWR category has nothing to invert", () => {
    // A false trait is always available here, but a Success never answers
    // a different category than the one asked, so a lie mustn't either.
    expect(generateFalseInfo(emptyFacts, CATEGORIES.WEAKNESSES, new Set(), () => 0)).toBeNull();
  });

  it("only ever answers the category that was asked", () => {
    for (let i = 0; i < 25; i++) {
      expect(generateFalseInfo(richFacts, CATEGORIES.WEAKNESSES, new Set(), () => i / 25).category).toBe(CATEGORIES.WEAKNESSES);
      expect(generateFalseInfo(richFacts, CATEGORIES.TRAITS, new Set(), () => i / 25).category).toBe(CATEGORIES.TRAITS);
    }
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

  it("returns null when every candidate in the chosen category is already known to be true", () => {
    const revealedKeys = new Set([
      makeFactKey(CATEGORIES.RESISTANCES, "cold"),
      makeFactKey(CATEGORIES.RESISTANCES, "poison"),
    ]);
    expect(generateFalseInfo(richFacts, CATEGORIES.WEAKNESSES, revealedKeys, () => 0)).toBeNull();
  });
});
