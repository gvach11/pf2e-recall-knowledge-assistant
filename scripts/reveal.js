import { CATEGORIES, DEGREES, makeFactKey } from "./constants.js";
import { pickCategoryEntry, pickFactFromOtherCategory, pickIdentityTrait } from "./actor-data.js";
import { generateFalseInfo } from "./data/false-info.js";

/**
 * @typedef {Object} Reveal
 * @property {{name: string, trait: string}|null} baseline - Structured
 *   identity-sentence data for the presentation layer to format (never a
 *   pre-built string — see architecture report S7/F15), or null if this
 *   degree reveals no baseline.
 * @property {string[]} facts - Already-formatted fact display strings
 *   (real or, on an unidentified-then-critical-failure, false).
 * @property {string[]} revealedKeys - New true-fact keys earned by this
 *   attempt only, for the caller to persist via `repeat-attempts.js`.
 */

/**
 * Resolves what to reveal for a given degree of success (SPEC.md §6.3).
 * A success/critical success always includes baseline info; "nothing
 * notable" only ever applies to the category-specific part.
 *
 * `revealedKeys` is the set of stable fact keys already truthfully known to
 * this character about this target (from earlier attempts this encounter,
 * see repeat-attempts.js). It's used only to keep a critical failure's
 * false fact from contradicting something already known — true reveals
 * are free to repeat.
 *
 * `alreadyIdentified` gates whether a Critical Failure produces false info
 * at all: if the character hasn't identified this target yet (no prior
 * Success/Critical Success this encounter), a Critical Failure is treated
 * exactly like a Failure — no baseline, no fact, real or false. This
 * avoids an inherent tell ("confident about a specific detail of a
 * creature you don't know the identity of") that can't otherwise be
 * disguised. Once identified, Critical Failure resumes giving one false,
 * non-contradictory fact as before.
 *
 * @returns {Reveal}
 */
export function resolveReveal(facts, category, degree, revealedKeys = new Set(), alreadyIdentified = false, rng = Math.random) {
  if (degree === DEGREES.CRITICAL_FAILURE && !alreadyIdentified) {
    return { baseline: null, facts: [], revealedKeys: [] };
  }

  if (degree === DEGREES.CRITICAL_FAILURE) {
    const falseFact = generateFalseInfo(facts, category, revealedKeys, rng);
    return { baseline: null, facts: falseFact ? [falseFact.text] : [], revealedKeys: [] };
  }

  if (degree === DEGREES.FAILURE) {
    return { baseline: null, facts: [], revealedKeys: [] };
  }

  const identityTrait = pickIdentityTrait(facts.traits);
  const baseline = { name: facts.name, trait: identityTrait };
  // The baseline already states this trait; offering it again as the
  // Traits fact would spend the reveal on something the player just read.
  const statedKeys = new Set([makeFactKey(CATEGORIES.TRAITS, identityTrait)]);

  const usedCategories = [category];
  let primaryEntry = pickCategoryEntry(facts, category, rng, statedKeys);
  if (!primaryEntry) {
    primaryEntry = pickFactFromOtherCategory(facts, usedCategories, rng, statedKeys);
    if (primaryEntry) usedCategories.push(primaryEntry.category);
  }

  const revealed = [];
  const newKeys = [];
  if (primaryEntry) {
    revealed.push(primaryEntry.text);
    newKeys.push(makeFactKey(primaryEntry.category, primaryEntry.key));
  }

  if (degree === DEGREES.CRITICAL_SUCCESS) {
    const bonus = pickFactFromOtherCategory(facts, usedCategories, rng, statedKeys);
    if (bonus) {
      revealed.push(bonus.text);
      newKeys.push(makeFactKey(bonus.category, bonus.key));
    }
  }

  return { baseline, facts: revealed, revealedKeys: newKeys };
}
