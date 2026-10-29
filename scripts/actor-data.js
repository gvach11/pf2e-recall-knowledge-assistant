import { CATEGORIES, makeFactKey } from "./constants.js";
import { CREATURE_TRAIT_SKILLS } from "./data/trait-skill-map.js";

/**
 * Normalizes a live pf2e NPC/Hazard actor document into a plain data shape
 * used throughout the module. Keeping this extraction in one place means
 * the rest of the logic (false-info generation, reveal text, skill
 * relevance) can be pure/testable functions that take plain data in.
 */
export function getActorFacts(actor) {
  const attributes = actor.system?.attributes ?? {};
  // pf2e's `label` is the full display form, value and exceptions included
  // ("physical 15 (except adamantine)"), so true reveals print it as-is
  // (`fullLabel`). `label` here is the bare type name, which false info
  // builds its own text from.
  return {
    name: actor.name,
    traits: [...(actor.system?.traits?.value ?? [])],
    weaknesses: (attributes.weaknesses ?? []).map((w) => ({
      type: w.type,
      value: w.value,
      label: w.typeLabel ?? w.type,
      fullLabel: w.label,
    })),
    resistances: (attributes.resistances ?? []).map((r) => ({
      type: r.type,
      value: r.value,
      label: r.typeLabel ?? r.type,
      fullLabel: r.label,
    })),
    immunities: (attributes.immunities ?? []).map((i) => ({
      type: i.type,
      label: i.typeLabel ?? i.type,
      fullLabel: i.label,
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
    return facts.weaknesses.map((w) => ({
      key: w.type,
      label: w.label,
      value: w.value,
      text: `Weak to ${w.fullLabel ?? `${w.label} ${w.value}`}`,
    }));
  }
  if (category === CATEGORIES.RESISTANCES) {
    return [
      ...facts.resistances.map((r) => ({
        key: r.type,
        label: r.label,
        value: r.value,
        text: `Resistant to ${r.fullLabel ?? `${r.label} ${r.value}`}`,
      })),
      ...facts.immunities.map((i) => ({
        key: i.type,
        label: i.label,
        value: undefined,
        text: `Immune to ${i.fullLabel ?? i.label}`,
      })),
    ];
  }
  if (category === CATEGORIES.TRAITS) {
    return facts.traits.map((trait) => ({ key: trait, label: trait, value: undefined, text: trait }));
  }
  return [];
}

function pickRandom(list, rng) {
  if (list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

/**
 * Picks one real fact from a category, returning its category, stable key,
 * and text together — needed wherever the caller must remember exactly
 * which fact was revealed (e.g. to persist it and never contradict it
 * later). Returns null if that category is empty for this target (the
 * "nothing notable" case, §6.3). Facts whose `makeFactKey` is in
 * `excludedKeys` are skipped, so a fact already stated elsewhere in the same
 * result is never offered again.
 */
export function pickCategoryEntry(facts, category, rng = Math.random, excludedKeys = new Set()) {
  const entries = listCategoryEntries(facts, category).filter((entry) => !excludedKeys.has(makeFactKey(category, entry.key)));
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
export function pickFactFromOtherCategory(facts, excludedCategories, rng = Math.random, excludedKeys = new Set()) {
  const excluded = new Set(Array.isArray(excludedCategories) ? excludedCategories : [excludedCategories]);
  const candidates = Object.values(CATEGORIES).filter((c) => !excluded.has(c));
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  for (const category of shuffled) {
    const entry = pickCategoryEntry(facts, category, rng, excludedKeys);
    if (entry) return entry;
  }
  return null;
}

// Not creature types, but what a hazard "is" for the baseline sentence.
const HAZARD_IDENTITY_TRAITS = ["haunt", "trap"];

/**
 * The trait the baseline sentence names ("X is a Y."). pf2e stores traits
 * alphabetically, so the first one is often a descriptor ("mindless"); the
 * creature type from the identification table (or a hazard's type) is what
 * actually identifies the target.
 */
export function pickIdentityTrait(traits) {
  return (
    traits.find((trait) => trait in CREATURE_TRAIT_SKILLS) ??
    traits.find((trait) => HAZARD_IDENTITY_TRAITS.includes(trait)) ??
    traits[0] ??
    "creature"
  );
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
