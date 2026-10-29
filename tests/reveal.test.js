import { describe, expect, it } from "vitest";
import { resolveReveal } from "../scripts/reveal.js";
import { CATEGORIES, DEGREES, NOTHING_NOTABLE_KEY, makeFactKey } from "../scripts/constants.js";

const facts = {
  name: "Test Ghoul",
  traits: ["undead"],
  weaknesses: [{ type: "fire", value: 5, label: "fire", invertible: true }],
  resistances: [{ type: "cold", value: 5, label: "cold", invertible: true }],
  immunities: [{ type: "poison", label: "poison", invertible: true }],
};

describe("resolveReveal", () => {
  it("failure reveals nothing and records no new keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.FAILURE, new Set(), false);
    expect(reveal).toEqual({ baseline: null, facts: [], revealedKeys: [] });
  });

  it("success includes a baseline and one fact, and records that fact's key", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), false, () => 0);
    expect(reveal.baseline).toEqual({ name: "Test Ghoul", trait: "undead" });
    expect(reveal.facts).toEqual(["Weak to fire 5"]);
    expect(reveal.revealedKeys).toEqual([makeFactKey(CATEGORIES.WEAKNESSES, "fire")]);
  });

  it("critical success includes a baseline plus two distinct facts from different categories, with both keys recorded", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_SUCCESS, new Set(), false, () => 0);
    expect(reveal.facts).toHaveLength(2);
    expect(new Set(reveal.facts).size).toBe(2); // no duplicate fact text
    expect(reveal.revealedKeys).toHaveLength(2);
    expect(new Set(reveal.revealedKeys).size).toBe(2); // no duplicate keys
  });

  it("critical failure on an ALREADY-IDENTIFIED target reveals one false fact and records no new (true) keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), true, () => 0);
    expect(reveal.facts).toHaveLength(1);
    expect(reveal.revealedKeys).toEqual([]);
  });

  it("a lie carries the same baseline sentence a Success would, so it reads like one", () => {
    const success = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), true, () => 0);
    const lie = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), true, () => 0);
    expect(lie.baseline).toEqual(success.baseline);
  });

  it("a lie with nothing safe to claim in the chosen category says nothing notable, like an empty Success", () => {
    // Asked about weaknesses; the only resistance can't be a pf2e weakness
    // type, so no believable false weakness exists. Must not answer with a
    // trait or a resistance instead.
    const noInvertible = { ...facts, weaknesses: [], resistances: [], immunities: [{ type: "unconscious", label: "unconscious", invertible: false }] };
    for (let i = 0; i < 25; i++) {
      const lie = resolveReveal(noInvertible, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), true, () => i / 25);
      expect(lie.baseline).not.toBeNull();
      expect(lie.facts).toEqual([]);
    }
  });

  it("a lie never claims 'nothing notable' about a category where the character already knows a true fact", () => {
    // Werewolf: one weakness, nothing to invert into a false weakness. The
    // player already learned "Weak to silver 5"; "nothing notable" now would
    // contradict it, so the lie repeats the known (true) fact instead.
    const werewolf = { name: "Werewolf", traits: ["beast"], weaknesses: [{ type: "silver", value: 5, label: "silver", invertible: true }], resistances: [], immunities: [] };
    const known = new Set([makeFactKey(CATEGORIES.WEAKNESSES, "silver")]);
    const lie = resolveReveal(werewolf, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, known, true, () => 0);
    expect(lie.facts).toEqual(["Weak to silver 5"]);
  });

  it("a lie stays 'nothing notable' in a category a Success already reported as nothing notable", () => {
    const unicorn = { name: "Unicorn", traits: ["beast"], weaknesses: [], resistances: [], immunities: [] };
    const success = resolveReveal(unicorn, CATEGORIES.TRAITS, DEGREES.SUCCESS, new Set(), false, () => 0);
    expect(success.facts).toEqual([]);

    const known = new Set(success.revealedKeys);
    for (let i = 0; i < 25; i++) {
      const lie = resolveReveal(unicorn, CATEGORIES.TRAITS, DEGREES.CRITICAL_FAILURE, known, true, () => i / 25);
      expect(lie.facts).toEqual([]);
    }
  });

  it("a plain Success on an empty category says nothing notable instead of answering a different category", () => {
    const onlyTraits = { name: "Werewolf", traits: ["beast", "werecreature"], weaknesses: [], resistances: [], immunities: [] };
    for (let i = 0; i < 25; i++) {
      const reveal = resolveReveal(onlyTraits, CATEGORIES.RESISTANCES, DEGREES.SUCCESS, new Set(), false, () => i / 25);
      expect(reveal.facts).toEqual([]);
      expect(reveal.revealedKeys).toEqual([makeFactKey(CATEGORIES.RESISTANCES, NOTHING_NOTABLE_KEY)]);
    }
  });

  it("a Critical Success on an empty category still falls back to another category", () => {
    const onlyTraits = { name: "Werewolf", traits: ["beast", "werecreature"], weaknesses: [], resistances: [], immunities: [] };
    const reveal = resolveReveal(onlyTraits, CATEGORIES.RESISTANCES, DEGREES.CRITICAL_SUCCESS, new Set(), false, () => 0);
    expect(reveal.facts).toEqual(["werecreature"]);
  });

  it("critical failure on a target NOT YET identified is treated exactly like a Failure — no baseline, no fact, real or false", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), false, () => 0);
    expect(reveal).toEqual({ baseline: null, facts: [], revealedKeys: [] });
  });

  it("regression: critical failure never contradicts a fact already revealed true this encounter", () => {
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    for (let i = 0; i < 25; i++) {
      const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, revealedKeys, true, () => i / 25);
      expect(reveal.facts.join(" ")).not.toContain("cold");
    }
  });

  it("success on an empty category still gives the baseline, with no facts", () => {
    const emptyFacts = { name: "Blank", traits: [], weaknesses: [], resistances: [], immunities: [] };
    const reveal = resolveReveal(emptyFacts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), false);
    expect(reveal.baseline).toEqual({ name: "Blank", trait: "creature" });
    expect(reveal.facts).toEqual([]);
  });

  it("names the creature type in the baseline, not the alphabetically-first trait", () => {
    const zombie = { ...facts, name: "Zombie Shambler", traits: ["mindless", "undead"] };
    const reveal = resolveReveal(zombie, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), false, () => 0);
    expect(reveal.baseline.trait).toBe("undead");
  });

  it("says nothing notable for Traits when the only trait is the one the baseline already named", () => {
    const unicorn = { name: "Unicorn", traits: ["beast"], weaknesses: [], resistances: [], immunities: [] };
    const reveal = resolveReveal(unicorn, CATEGORIES.TRAITS, DEGREES.SUCCESS, new Set(), false, () => 0);
    expect(reveal.baseline.trait).toBe("beast");
    expect(reveal.facts).toEqual([]);
  });

  it("never repeats the baseline's trait as the Traits fact", () => {
    const unicorn = { name: "Unicorn", traits: ["beast", "fey"], weaknesses: [], resistances: [], immunities: [] };
    for (let i = 0; i < 25; i++) {
      const reveal = resolveReveal(unicorn, CATEGORIES.TRAITS, DEGREES.SUCCESS, new Set(), false, () => i / 25);
      expect(reveal.facts).toEqual(["fey"]);
    }
  });
});
