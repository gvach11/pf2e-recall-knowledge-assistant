import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActorFacts,
  listCategoryEntries,
  pickCategoryEntry,
  pickFactFromOtherCategory,
  getRelevantSkills,
  pickIdentityTrait,
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

describe("pickIdentityTrait", () => {
  it("prefers a creature-type trait over whatever sorts first", () => {
    expect(pickIdentityTrait(["mindless", "undead", "unholy", "zombie"])).toBe("undead");
    expect(pickIdentityTrait(["leshy", "plant"])).toBe("plant");
  });

  it("names a hazard by its hazard type", () => {
    expect(pickIdentityTrait(["mechanical", "trap"])).toBe("trap");
    expect(pickIdentityTrait(["haunt"])).toBe("haunt");
  });

  it("falls back to the first trait, then to 'creature'", () => {
    expect(pickIdentityTrait(["foo"])).toBe("foo");
    expect(pickIdentityTrait([])).toBe("creature");
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

  it("keeps pf2e's exceptions in the reveal text without printing the value twice", () => {
    const actorFacts = getActorFacts(pf2eActor);
    expect(listCategoryEntries(actorFacts, CATEGORIES.WEAKNESSES)[0].text).toBe("Weak to adamantine 5 (except air)");
    expect(listCategoryEntries(actorFacts, CATEGORIES.RESISTANCES).map((e) => e.text)).toEqual([
      "Resistant to axes 5 (except acid)",
      "Immune to abysium (except aging)",
    ]);
  });

  it("keeps an Iron Golem's 'except adamantine' on its physical resistance", () => {
    const golem = {
      name: "Iron Golem",
      system: { attributes: { resistances: [{ type: "physical", value: 15, typeLabel: "physical", label: "physical 15 (except adamantine)" }] } },
    };
    expect(listCategoryEntries(getActorFacts(golem), CATEGORIES.RESISTANCES)[0].text).toBe("Resistant to physical 15 (except adamantine)");
  });

  describe("invertible (whether a lie may flip this fact into the opposite category)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const actorWith = (attributes) => ({ name: "X", system: { attributes } });

    it("marks an immunity or resistance invertible only if pf2e recognizes its type as a weakness type", () => {
      vi.stubGlobal("CONFIG", { PF2E: { weaknessTypes: { fire: "", poison: "" }, resistanceTypes: {} } });
      const facts = getActorFacts(
        actorWith({
          immunities: [{ type: "fire" }, { type: "unconscious" }],
          resistances: [{ type: "poison", value: 5 }, { type: "death-effects", value: 5 }],
        })
      );
      expect(facts.immunities.map((i) => i.invertible)).toEqual([true, false]);
      expect(facts.resistances.map((r) => r.invertible)).toEqual([true, false]);
    });

    it("marks a weakness invertible only if pf2e recognizes its type as a resistance type", () => {
      vi.stubGlobal("CONFIG", { PF2E: { weaknessTypes: {}, resistanceTypes: { fire: "" } } });
      const facts = getActorFacts(actorWith({ weaknesses: [{ type: "fire", value: 5 }, { type: "vampire-weaknesses", value: 5 }] }));
      expect(facts.weaknesses.map((w) => w.invertible)).toEqual([true, false]);
    });

    it("treats nothing as invertible when pf2e's type lists aren't available", () => {
      vi.stubGlobal("CONFIG", {});
      const facts = getActorFacts(actorWith({ immunities: [{ type: "fire" }], weaknesses: [{ type: "fire", value: 5 }] }));
      expect(facts.immunities[0].invertible).toBe(false);
      expect(facts.weaknesses[0].invertible).toBe(false);
    });
  });

  it("builds 'type value' text when pf2e supplies no full label", () => {
    const bare = { name: "X", system: { attributes: { weaknesses: [{ type: "silver", value: 5, typeLabel: "silver" }] } } };
    expect(listCategoryEntries(getActorFacts(bare), CATEGORIES.WEAKNESSES)[0].text).toBe("Weak to silver 5");
  });

  it("falls back to the raw type slug when pf2e supplies no typeLabel", () => {
    const bare = { name: "X", system: { attributes: { weaknesses: [{ type: "fire", value: 10 }] } } };
    expect(getActorFacts(bare).weaknesses).toMatchObject([{ type: "fire", value: 10, label: "fire" }]);
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
