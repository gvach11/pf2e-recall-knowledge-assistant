import { CATEGORIES, makeFactKey } from "../constants.js";
import { CREATURE_TRAIT_SKILLS, HAZARD_IDENTITY_TRAITS, HAZARD_TRAIT_SKILLS } from "./trait-skill-map.js";
import { listCategoryEntries } from "../actor-data.js";

// pf2e immunities carry no numeric magnitude, so a false weakness inverted
// from an immunity has no real value to borrow. This fixed, documented
// fallback keeps the lie's formatting identical to a real weakness fact
// (SPEC.md §6.4) without inventing per-level game data we can't verify.
const FALLBACK_FALSE_VALUE = 5;

/**
 * Picks a random element from an array using the supplied RNG (defaults to
 * Math.random). Accepting an rng lets tests exercise this deterministically.
 */
function pickRandom(list, rng = Math.random) {
  if (list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

/**
 * Falsely claims a weakness to a type the target is actually resistant or
 * immune to (the inversion), reusing the real magnitude of the inverted
 * fact where one exists (resistances) and the fallback value otherwise
 * (immunities). Excludes any candidate whose true fact has already been
 * revealed to this character this encounter — a false weakness claim must
 * never contradict a resistance/immunity the character already truthfully
 * knows about. Only types pf2e allows as weaknesses are candidates
 * (`invertible`, see actor-data.js) — "Weak to unconscious" would be an
 * obvious tell. Falls back to nothing if no safe candidate remains.
 */
export function invertToFalseWeakness(facts, revealedKeys = new Set(), rng = Math.random) {
  const candidates = listCategoryEntries(facts, CATEGORIES.RESISTANCES).filter(
    (entry) => entry.invertible && !revealedKeys.has(makeFactKey(CATEGORIES.RESISTANCES, entry.key))
  );
  const entry = pickRandom(candidates, rng);
  if (!entry) return null;
  const value = entry.value ?? FALLBACK_FALSE_VALUE;
  return { category: CATEGORIES.WEAKNESSES, text: `Weak to ${entry.label} ${value}` };
}

/**
 * Falsely claims a resistance to a type the target is actually weak to (the
 * inversion), reusing the real magnitude of the inverted weakness. Excludes
 * any candidate whose true fact has already been revealed to this character
 * this encounter, and any type pf2e doesn't allow as a resistance. Falls
 * back to nothing if no safe candidate remains.
 */
export function invertToFalseResistance(facts, revealedKeys = new Set(), rng = Math.random) {
  const candidates = listCategoryEntries(facts, CATEGORIES.WEAKNESSES).filter(
    (entry) => entry.invertible && !revealedKeys.has(makeFactKey(CATEGORIES.WEAKNESSES, entry.key))
  );
  const entry = pickRandom(candidates, rng);
  if (!entry) return null;
  return { category: CATEGORIES.RESISTANCES, text: `Resistant to ${entry.label} ${entry.value}` };
}

/**
 * Picks a plausible false trait: one of the fixed creature-type traits
 * (the same pool used for skill relevance) that the target does NOT
 * actually have, never an arbitrary/nonsense trait. Hazards draw from the
 * hazard-type pool instead — calling a pit trap "undead" would be a tell.
 * A false trait can never contradict an already-revealed true fact (it's
 * by definition not one of the target's real traits), so no revealedKeys
 * filtering is needed here.
 */
export function pickFalseTrait(facts, rng = Math.random) {
  const actualTraits = new Set(facts.traits);
  const pool = facts.kind === "hazard" ? HAZARD_TRAIT_SKILLS : CREATURE_TRAIT_SKILLS;
  const candidates = Object.keys(pool).filter((trait) => !actualTraits.has(trait) && !HAZARD_IDENTITY_TRAITS.includes(trait));
  const trait = pickRandom(candidates, rng);
  if (!trait) return null;
  return { category: CATEGORIES.TRAITS, text: trait };
}

/**
 * Generates one false fact in the chosen category, presented with the same
 * confidence/formatting as a real reveal. Never answers a different
 * category: a Success doesn't either, so a lie that did would be a tell.
 * Returns null when the chosen category has nothing safe to invert (empty,
 * not a believable pf2e type, or already revealed true to this character);
 * the caller then says "nothing notable", exactly as an empty Success does
 * (SPEC.md §6.4).
 */
export function generateFalseInfo(facts, category, revealedKeys = new Set(), rng = Math.random) {
  if (category === CATEGORIES.WEAKNESSES) return invertToFalseWeakness(facts, revealedKeys, rng);
  if (category === CATEGORIES.RESISTANCES) return invertToFalseResistance(facts, revealedKeys, rng);
  return pickFalseTrait(facts, rng);
}
