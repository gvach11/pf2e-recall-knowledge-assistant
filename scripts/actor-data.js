import { CATEGORIES } from "./constants.js";
import { CREATURE_TRAIT_SKILLS } from "./data/trait-skill-map.js";

/**
 * Normalizes a live pf2e NPC/Hazard actor document into a plain data shape
 * used throughout the module. Keeping this extraction in one place means
 * the rest of the logic (false-info generation, reveal text, skill
 * relevance) can be pure/testable functions that take plain data in.
 */
export function getActorFacts(actor) {
  const attributes = actor.system?.attributes ?? {};
  return {
    name: actor.name,
    traits: [...(actor.system?.traits?.value ?? [])],
    weaknesses: (attributes.weaknesses ?? []).map((w) => ({
      type: w.type,
      value: w.value,
      label: w.label ?? w.applicationLabel ?? w.type,
    })),
    resistances: (attributes.resistances ?? []).map((r) => ({
      type: r.type,
      value: r.value,
      label: r.label ?? r.applicationLabel ?? r.type,
    })),
    immunities: (attributes.immunities ?? []).map((i) => ({
      type: i.type,
      label: i.label ?? i.applicationLabel ?? i.type,
    })),
  };
}

/**
 * Every real fact in a category as { key, text } pairs. `key` is a stable
 * identifier (damage/condition type, or trait slug) used to remember which
 * specific facts have already been revealed to a character — independent
 * of `text`'s exact display wording. Resistances and Immunities are
 * combined into a single category per SPEC.md §4/§6.2.
 */
export function listCategoryEntries(facts, category) {
  if (category === CATEGORIES.WEAKNESSES) {
    return facts.weaknesses.map((w) => ({ key: w.type, text: `Weak to ${w.label} ${w.value}` }));
  }
  if (category === CATEGORIES.RESISTANCES) {
    return [
      ...facts.resistances.map((r) => ({ key: r.type, text: `Resistant to ${r.label} ${r.value}` })),
      ...facts.immunities.map((i) => ({ key: i.type, text: `Immune to ${i.label}` })),
    ];
  }
  if (category === CATEGORIES.TRAITS) {
    return facts.traits.map((trait) => ({ key: trait, text: trait }));
  }
  return [];
}

/**
 * Formats every real fact in a category as display text only.
 */
export function listCategoryItems(facts, category) {
  return listCategoryEntries(facts, category).map((entry) => entry.text);
}

function pickRandom(list, rng) {
  if (list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

/**
 * Picks one real fact from a category, or null if that category is empty
 * for this target (the "nothing notable" case, §6.3).
 */
export function pickCategoryFact(facts, category, rng = Math.random) {
  const items = listCategoryItems(facts, category);
  const item = pickRandom(items, rng);
  return item ?? null;
}

/**
 * Like pickCategoryFact, but returns the category, stable key, and text
 * together — needed wherever the caller must remember exactly which fact
 * was revealed (e.g. to persist it and never contradict it later).
 */
export function pickCategoryEntry(facts, category, rng = Math.random) {
  const entries = listCategoryEntries(facts, category);
  const entry = pickRandom(entries, rng);
  return entry ? { category, key: entry.key, text: entry.text } : null;
}

/**
 * Picks a fact from a randomly-chosen category other than any excluded
 * ones, skipping categories that are also empty. Used for the
 * critical-success bonus fact and for falling back when the chosen
 * category is empty. Pass every category already used for another reveal
 * (not just the originally-chosen one) so the bonus fact can never
 * duplicate a fact already shown. Returns null only if every non-excluded
 * category is empty for this target.
 */
export function pickFactFromOtherCategory(facts, excludedCategories, rng = Math.random) {
  const excluded = new Set(Array.isArray(excludedCategories) ? excludedCategories : [excludedCategories]);
  const candidates = Object.values(CATEGORIES).filter((c) => !excluded.has(c));
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  for (const category of shuffled) {
    const entry = pickCategoryEntry(facts, category, rng);
    if (entry) return entry;
  }
  return null;
}

/**
 * Relevant skills for Recall Knowledge against this target. NPCs delegate
 * to pf2e's own live `identificationDCs.skills`; Hazards lack that getter,
 * so we derive relevance from the shared creature-trait->skill map.
 */
export function getRelevantSkills(actor, facts) {
  if (actor.type === "npc" && Array.isArray(actor.identificationDCs?.skills)) {
    return [...actor.identificationDCs.skills];
  }

  const skills = new Set();
  for (const trait of facts.traits) {
    for (const skill of CREATURE_TRAIT_SKILLS[trait] ?? []) {
      skills.add(skill);
    }
  }
  return [...skills];
}
