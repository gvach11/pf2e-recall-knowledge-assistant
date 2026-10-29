import { describe, expect, it } from "vitest";
import {
  getActorFacts,
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

describe("getActorFacts", () => {
  // Shape of pf2e 8.5's IWR objects: `label` already embeds the value and
  // exceptions, `typeLabel` is just the localized type name.
  const pf2eActor = {
    name: "Commoner",
    system: {
      traits: { value: ["human", "humanoid"] },
      attributes: {
        weaknesses: [
          { type: "adamantine", value: 5, typeLabel: "adamantine", label: "adamantine 5 (except air)", applicationLabel: "adamantine (except air)" },
        ],
        resistances: [
          { type: "axes", value: 5, typeLabel: "axes", label: "axes 5 (except acid)", applicationLabel: "axes (except acid)" },
        ],
        immunities: [
          { type: "abysium", typeLabel: "abysium", label: "abysium (except aging)", applicationLabel: "abysium (except aging)" },
        ],
      },
    },
  };

  it("uses pf2e's plain type label so the value is never printed twice", () => {
    const actorFacts = getActorFacts(pf2eActor);
    expect(listCategoryEntries(actorFacts, CATEGORIES.WEAKNESSES)[0].text).toBe("Weak to adamantine 5");
    expect(listCategoryEntries(actorFacts, CATEGORIES.RESISTANCES).map((e) => e.text)).toEqual([
      "Resistant to axes 5",
      "Immune to abysium",
    ]);
  });

  it("falls back to the raw type slug when pf2e supplies no typeLabel", () => {
    const bare = { name: "X", system: { attributes: { weaknesses: [{ type: "fire", value: 10 }] } } };
    expect(getActorFacts(bare).weaknesses).toEqual([{ type: "fire", value: 10, label: "fire" }]);
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
