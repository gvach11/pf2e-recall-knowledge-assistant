import { DEGREES, LIKELIHOODS, LORE_EASE } from "../constants.js";

// Level-based DC table (SPEC.md §2 / GM Core pg. 52), verified against pf2e's own dc.ts.
export const LEVEL_DC_TABLE = Object.freeze({
  "-1": 13,
  0: 14,
  1: 15,
  2: 16,
  3: 18,
  4: 19,
  5: 20,
  6: 22,
  7: 23,
  8: 24,
  9: 26,
  10: 27,
  11: 28,
  12: 30,
  13: 31,
  14: 32,
  15: 34,
  16: 35,
  17: 36,
  18: 38,
  19: 39,
  20: 40,
  21: 42,
  22: 44,
  23: 46,
  24: 48,
  25: 50,
});

export const RARITY_ADJUSTMENT = Object.freeze({
  common: 0,
  uncommon: 2,
  rare: 5,
  unique: 10,
});

/**
 * Computes the hidden Recall Knowledge DC for a target actor.
 * NPCs delegate to pf2e's own live `identificationDCs` getter (self-updating
 * with system patches). Hazards lack that getter, so we compute it ourselves
 * from the level-DC table + rarity adjustment.
 */
export function computeHiddenDC(actor) {
  if (actor.type === "npc" && actor.identificationDCs?.standard?.dc != null) {
    return actor.identificationDCs.standard.dc;
  }

  const adjustment = RARITY_ADJUSTMENT[getRarity(actor)] ?? 0;
  return getLevelDC(actor) + adjustment;
}

// pf2e's DC-adjustment scale, easiest first, with "normal" in the middle.
const DC_ADJUSTMENT_SCALE = Object.freeze([
  ["incredibly-easy", -10],
  ["very-easy", -5],
  ["easy", -2],
  ["normal", 0],
  ["hard", 2],
  ["very-hard", 5],
  ["incredibly-hard", 10],
]);
const NORMAL_STEP = 3;
const RARITY_STEP = Object.freeze({ common: "normal", uncommon: "hard", rare: "very-hard", unique: "incredibly-hard" });

/**
 * The DC for a Lore the GM ruled applicable, at the chosen ease (SPEC.md
 * §6.8). NPCs delegate to pf2e's own `identificationDCs.lore` (easy, then
 * very easy). Hazards lack it, so we mirror pf2e's rule: rarity and ease
 * are added as steps on its DC-adjustment scale and clamped to its ends,
 * which is why a rare hazard's easy Lore DC is +2 rather than +5-2.
 */
export function computeLoreDC(actor, ease) {
  const npcLoreDCs = actor.type === "npc" ? actor.identificationDCs?.lore : undefined;
  if (npcLoreDCs?.length === 2) {
    return (ease === LORE_EASE.VERY_EASY ? npcLoreDCs[1] : npcLoreDCs[0]).dc;
  }

  const stepIndex = (name) => DC_ADJUSTMENT_SCALE.findIndex(([step]) => step === name);
  const rarityIndex = stepIndex(RARITY_STEP[getRarity(actor)] ?? "normal");
  const combined = Math.min(Math.max(rarityIndex + stepIndex(ease) - NORMAL_STEP, 0), DC_ADJUSTMENT_SCALE.length - 1);
  return getLevelDC(actor) + DC_ADJUSTMENT_SCALE[combined][1];
}

/**
 * The difficulty of each attempt against the same subject in one encounter
 * (SPEC.md §6.6): GM Core pg. 54 raises the DC for each follow-up, and
 * after an incredibly hard attempt there's nothing more to recall.
 */
export const FOLLOW_UP_STEPS = Object.freeze(["normal", "hard", "very-hard", "incredibly-hard"]);

/**
 * Raises the DC an attempt would otherwise have (rarity, Lore ease and all)
 * by its follow-up step's adjustment.
 */
export function applyFollowUpStep(dc, step) {
  return dc + DC_ADJUSTMENT_SCALE.find(([name]) => name === step)[1];
}

function getRarity(actor) {
  return actor.system?.traits?.rarity ?? "common";
}

function getLevelDC(actor) {
  const level = actor.level ?? actor.system?.details?.level?.value ?? 0;
  return LEVEL_DC_TABLE[level] ?? LEVEL_DC_TABLE[clampLevel(level)];
}

function clampLevel(level) {
  const levels = Object.keys(LEVEL_DC_TABLE).map(Number);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return Math.min(max, Math.max(min, level));
}

/**
 * Computes PF2e degree-of-success from a roll total vs. a DC, applying the
 * natural-20-up / natural-1-down step rule ourselves (since we deliberately
 * never hand the DC to pf2e's own action, we don't get its computed outcome).
 */
const CRITICAL_STEP_MARGIN = 10;

export function computeDegreeOfSuccess(rollTotal, dc, naturalD20) {
  let degree;
  if (rollTotal >= dc + CRITICAL_STEP_MARGIN) degree = DEGREES.CRITICAL_SUCCESS;
  else if (rollTotal >= dc) degree = DEGREES.SUCCESS;
  else if (rollTotal <= dc - CRITICAL_STEP_MARGIN) degree = DEGREES.CRITICAL_FAILURE;
  else degree = DEGREES.FAILURE;

  if (naturalD20 === 20) degree = stepUp(degree);
  else if (naturalD20 === 1) degree = stepDown(degree);

  return degree;
}

function stepUp(degree) {
  if (degree === DEGREES.CRITICAL_SUCCESS) return DEGREES.CRITICAL_SUCCESS;
  if (degree === DEGREES.SUCCESS) return DEGREES.CRITICAL_SUCCESS;
  if (degree === DEGREES.FAILURE) return DEGREES.SUCCESS;
  return DEGREES.FAILURE;
}

function stepDown(degree) {
  if (degree === DEGREES.CRITICAL_FAILURE) return DEGREES.CRITICAL_FAILURE;
  if (degree === DEGREES.FAILURE) return DEGREES.CRITICAL_FAILURE;
  if (degree === DEGREES.SUCCESS) return DEGREES.FAILURE;
  return DEGREES.SUCCESS;
}

const AVERAGE_D20_ROLL = 10;

/**
 * Computes a qualitative likelihood label for a skill. Never returns a
 * number — untrained skills are always "unfamiliar" regardless of modifier.
 *
 * The DC has to be beaten by (roll + modifier), not by the modifier alone,
 * so comparing modifier directly to DC would make "Confident" nearly
 * unreachable for any normally-difficult check. Instead we compare an
 * approximate expected roll total (modifier + an average d20 roll of ~10)
 * against the DC.
 */
export function computeLikelihood(modifier, dc, isTrained) {
  if (!isTrained) return LIKELIHOODS.UNFAMILIAR;

  const margin = modifier + AVERAGE_D20_ROLL - dc;
  if (margin >= 0) return LIKELIHOODS.CONFIDENT; // succeeds on an average roll
  if (margin > -10) return LIKELIHOODS.UNCERTAIN; // fails on average, but not critically
  return LIKELIHOODS.UNFAMILIAR; // critically fails even on an average roll
}
