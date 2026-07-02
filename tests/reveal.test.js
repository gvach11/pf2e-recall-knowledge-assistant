import { describe, expect, it } from "vitest";
import { resolveReveal } from "../scripts/reveal.js";
import { CATEGORIES, DEGREES, makeFactKey } from "../scripts/constants.js";

const facts = {
  name: "Test Ghoul",
  traits: ["undead"],
  weaknesses: [{ type: "fire", value: 5, label: "fire" }],
  resistances: [{ type: "cold", value: 5, label: "cold" }],
  immunities: [{ type: "poison", label: "poison" }],
};

describe("resolveReveal", () => {
  it("failure reveals nothing and records no new keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.FAILURE, new Set());
    expect(reveal).toEqual({ baseline: null, facts: [], isFalse: false, revealedKeys: [] });
  });

  it("success includes a baseline and one fact, and records that fact's key", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), () => 0);
    expect(reveal.baseline).toContain("Test Ghoul");
    expect(reveal.facts).toEqual(["Weak to fire 5"]);
    expect(reveal.revealedKeys).toEqual([makeFactKey(CATEGORIES.WEAKNESSES, "fire")]);
    expect(reveal.isFalse).toBe(false);
  });

  it("critical success includes a baseline plus two distinct facts from different categories, with both keys recorded", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_SUCCESS, new Set(), () => 0);
    expect(reveal.facts).toHaveLength(2);
    expect(new Set(reveal.facts).size).toBe(2); // no duplicate fact text
    expect(reveal.revealedKeys).toHaveLength(2);
    expect(new Set(reveal.revealedKeys).size).toBe(2); // no duplicate keys
  });

  it("critical failure reveals one false fact and records no new (true) keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), () => 0);
    expect(reveal.baseline).toBeNull();
    expect(reveal.facts).toHaveLength(1);
    expect(reveal.isFalse).toBe(true);
    expect(reveal.revealedKeys).toEqual([]);
  });

  it("regression: critical failure never contradicts a fact already revealed true this encounter", () => {
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    for (let i = 0; i < 25; i++) {
      const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, revealedKeys, () => i / 25);
      expect(reveal.facts.join(" ")).not.toContain("cold");
    }
  });

  it("success on an empty category still gives the baseline, with no facts", () => {
    const emptyFacts = { name: "Blank", traits: [], weaknesses: [], resistances: [], immunities: [] };
    const reveal = resolveReveal(emptyFacts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set());
    expect(reveal.baseline).toContain("Blank");
    expect(reveal.facts).toEqual([]);
  });
});
