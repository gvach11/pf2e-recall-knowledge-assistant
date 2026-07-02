export const MODULE_ID = "recall-knowledge-assistant";

export const CATEGORIES = Object.freeze({
  WEAKNESSES: "weaknesses",
  RESISTANCES: "resistances",
  TRAITS: "traits",
});

export const DEGREES = Object.freeze({
  CRITICAL_SUCCESS: "criticalSuccess",
  SUCCESS: "success",
  FAILURE: "failure",
  CRITICAL_FAILURE: "criticalFailure",
});

export const LIKELIHOODS = Object.freeze({
  CONFIDENT: "confident",
  UNCERTAIN: "uncertain",
  UNFAMILIAR: "unfamiliar",
});

// Degrees that actually earn the identity reveal (SPEC.md §6.2).
export const IDENTIFYING_DEGREES = new Set([DEGREES.SUCCESS, DEGREES.CRITICAL_SUCCESS]);

// Stable key for a specific revealed fact, e.g. "resistances:fire". Used to
// remember which true facts a character has already learned about a target
// (so false info never contradicts them, and identity persists once known).
export function makeFactKey(category, key) {
  return `${category}:${key}`;
}
