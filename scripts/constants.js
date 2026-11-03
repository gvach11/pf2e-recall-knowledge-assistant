export const MODULE_ID = "pf2e-recall-knowledge-assistant";

// The Recall Knowledge dialog's application id; only one is open at a time.
export const DIALOG_ID = "pf2e-recall-knowledge-assistant-dialog";

// The module's socket channel (module.json has `"socket": true`).
export const SOCKET_NAME = `module.${MODULE_ID}`;

// Public API version (SPEC.md §6.7). Bump only when the API changes in a
// way callers must detect; other modules check `api.apiVersion >= N`.
export const API_VERSION = 1;

// What getAttemptStatus answers about one character and one target.
export const ATTEMPT_STATUS = Object.freeze({
  AVAILABLE: "available",
  BLOCKED: "blocked",
  EXHAUSTED: "exhausted",
  INVALID: "invalid",
});

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

// How much easier the GM rules an applicable Lore to be (SPEC.md §6.8).
// The values are pf2e's own DC-adjustment names.
export const LORE_EASE = Object.freeze({
  EASY: "easy",
  VERY_EASY: "very-easy",
});

// Degrees that actually earn the identity reveal (SPEC.md §6.2).
export const IDENTIFYING_DEGREES = new Set([DEGREES.SUCCESS, DEGREES.CRITICAL_SUCCESS]);

// Stable key for a specific revealed fact, e.g. "resistances:fire". Used to
// remember which true facts a character has already learned about a target
// (so false info never contradicts them, and identity persists once known).
export function makeFactKey(category, key) {
  return `${category}:${key}`;
}

// Recorded (as `makeFactKey(category, NOTHING_NOTABLE_KEY)`) when a Success
// told a character a category holds nothing notable, so a later lie can't
// contradict that by claiming something there. Not a pf2e type slug.
export const NOTHING_NOTABLE_KEY = "~nothing-notable";
