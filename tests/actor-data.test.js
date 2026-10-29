import { describe, expect, it } from "vitest";
import {
  listCategoryEntries,
  pickCategoryEntry,
  pickFactFromOtherCategory,
  getRelevantSkills,
} from "../scripts/actor-data.js";
import { CATEGORIES } from "../scripts/constants.js";

const facts = {
  name: "Test Ooze",
  traits: ["ooze"],
  weaknesses: [{ type: "fire", value: 5, label: "fire" }],
  resistances: [{ type: "cold", value: 5, label: "cold" }],
  immunities: [{ type: "poison", label: "poison" }],
};

const emptyFacts = { name: "Nothing Notable", traits: [], weaknesses: [], resistances: [], immunities: [] };

describe("pickFactFromOtherCategory", () => {
  it("skips the excluded category and any empty categories", () => {
    const onlyTraits = { name: "X", traits: ["undead"], weaknesses: [], resistances: [], immunities: [] };
    const result = pickFactFromOtherCategory(onlyTraits, CATEGORIES.WEAKNESSES);
    expect(result).not.toBeNull();
    expect(result.category).toBe(CATEGORIES.TRAITS);
  });

  it("returns null when every other category is empty", () => {
    expect(pickFactFromOtherCategory(emptyFacts, CATEGORIES.WEAKNESSES)).toBeNull();
  });

  it("accepts multiple excluded categories, avoiding a fact already used elsewhere", () => {
    const onlyTraits = { name: "X", traits: ["undead"], weaknesses: [], resistances: [], immunities: [] };
    const result = pickFactFromOtherCategory(onlyTraits, [CATEGORIES.WEAKNESSES, CATEGORIES.TRAITS]);
    expect(result).toBeNull();
  });

  it("includes a stable key alongside the text, identifying which specific fact was picked", () => {
    const onlyTraits = { name: "X", traits: ["undead"], weaknesses: [], resistances: [], immunities: [] };
    const result = pickFactFromOtherCategory(onlyTraits, CATEGORIES.WEAKNESSES);
    expect(result.key).toBe("undead");
  });
});

describe("listCategoryEntries", () => {
  it("returns a stable key, label, and value alongside the display text for each real fact", () => {
    const entries = listCategoryEntries(facts, CATEGORIES.RESISTANCES);
    expect(entries).toContainEqual({ key: "cold", label: "cold", value: 5, text: "Resistant to cold 5" });
    expect(entries).toContainEqual({ key: "poison", label: "poison", value: undefined, text: "Immune to poison" });
  });

  it("keys weaknesses and traits by their type/slug too", () => {
    expect(listCategoryEntries(facts, CATEGORIES.WEAKNESSES)).toContainEqual({
      key: "fire",
      label: "fire",
      value: 5,
      text: "Weak to fire 5",
    });
    expect(listCategoryEntries(facts, CATEGORIES.TRAITS)).toContainEqual({
      key: "ooze",
      label: "ooze",
      value: undefined,
      text: "ooze",
    });
  });
});

describe("pickCategoryEntry", () => {
  it("returns null for an empty category", () => {
    expect(pickCategoryEntry(emptyFacts, CATEGORIES.WEAKNESSES)).toBeNull();
  });

  it("returns the category, key, and text for a real fact", () => {
    const entry = pickCategoryEntry(facts, CATEGORIES.WEAKNESSES);
    expect(entry).toEqual({ category: CATEGORIES.WEAKNESSES, key: "fire", text: "Weak to fire 5" });
  });
});

describe("getRelevantSkills", () => {
  it("uses pf2e's own identificationDCs.skills for NPCs", () => {
    const npc = { type: "npc", identificationDCs: { skills: ["religion"] } };
    expect(getRelevantSkills(npc, facts)).toEqual(["religion"]);
  });

  it("derives relevance from the trait->skill map for hazards", () => {
    const hazard = { type: "hazard" };
    const hazardFacts = { ...facts, traits: ["undead"] };
    expect(getRelevantSkills(hazard, hazardFacts)).toEqual(["religion"]);
  });
});
