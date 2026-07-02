import { CATEGORIES, makeFactKey } from "../constants.js";
import { CREATURE_TRAIT_SKILLS } from "./trait-skill-map.js";

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
 * immune to (the inversion). Excludes any candidate whose true fact has
 * already been revealed to this character this encounter — a false
 * weakness claim must never contradict a resistance/immunity the character
 * already truthfully knows about. Falls back to nothing if no safe
 * candidate remains.
 */
export function invertToFalseWeakness(facts, revealedKeys = new Set(), rng = Math.random) {
  const candidates = [
    ...facts.resistances.map((r) => r.type),
    ...facts.immunities.map((i) => i.type),
  ].filter((type) => !revealedKeys.has(makeFactKey(CATEGORIES.RESISTANCES, type)));
  const type = pickRandom(candidates, rng);
  if (!type) return null;
  return { category: CATEGORIES.WEAKNESSES, text: `Weak to ${type}` };
}

/**
 * Falsely claims a resistance/immunity to a type the target is actually
 * weak to (the inversion). Excludes any candidate whose true fact has
 * already been revealed to this character this encounter. Falls back to
 * nothing if no safe candidate remains.
 */
export function invertToFalseResistance(facts, revealedKeys = new Set(), rng = Math.random) {
  const candidates = facts.weaknesses
    .map((w) => w.type)
    .filter((type) => !revealedKeys.has(makeFactKey(CATEGORIES.WEAKNESSES, type)));
  const type = pickRandom(candidates, rng);
  if (!type) return null;
  return { category: CATEGORIES.RESISTANCES, text: `Resistant to ${type}` };
}

/**
 * Picks a plausible false trait: one of the fixed creature-type traits
 * (the same pool used for skill relevance) that the target does NOT
 * actually have, never an arbitrary/nonsense trait. A false trait can
 * never contradict an already-revealed true fact (it's by definition not
 * one of the target's real traits), so no revealedKeys filtering is
 * needed here.
 */
export function pickFalseTrait(facts, rng = Math.random) {
  const actualTraits = new Set(facts.traits);
  const candidates = Object.keys(CREATURE_TRAIT_SKILLS).filter((trait) => !actualTraits.has(trait));
  const trait = pickRandom(candidates, rng);
  if (!trait) return null;
  return { category: CATEGORIES.TRAITS, text: trait };
}

function tryFalseInfoForCategory(facts, category, revealedKeys, rng) {
  if (category === CATEGORIES.WEAKNESSES) return invertToFalseWeakness(facts, revealedKeys, rng);
  if (category === CATEGORIES.RESISTANCES) return invertToFalseResistance(facts, revealedKeys, rng);
  return pickFalseTrait(facts, rng);
}

/**
 * Generates one false fact for the chosen category, presented with the same
 * confidence/formatting as a real reveal. If the chosen category has
 * nothing safe to invert (either empty, or every candidate's true fact was
 * already revealed to this character), falls back through the other
 * categories in random order. Returns null only if nothing safe remains
 * anywhere — the caller treats that like a Failure for this attempt rather
 * than force a contradictory or invented lie (SPEC.md §6.4).
 */
export function generateFalseInfo(facts, category, revealedKeys = new Set(), rng = Math.random) {
  const others = Object.values(CATEGORIES)
    .filter((c) => c !== category)
    .sort(() => rng() - 0.5);

  for (const cat of [category, ...others]) {
    const result = tryFalseInfoForCategory(facts, cat, revealedKeys, rng);
    if (result) return result;
  }
  return null;
}
