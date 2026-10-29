import { IDENTIFYING_DEGREES, MODULE_ID } from "./constants.js";

const FLAG_KEY = "attempts";

/**
 * Sanitizes an (actorUuid, targetUuid) pair into a flag-path-safe key.
 * Foundry flag paths are dot-notation, so raw UUIDs (which contain dots)
 * can't be used as object keys directly.
 */
export function attemptKey(actorUuid, targetUuid) {
  return `${actorUuid}__${targetUuid}`.replace(/\./g, "-");
}

/**
 * Throttle policy (SPEC.md §4): a character is blocked from further
 * attempts against the same target, for the rest of the active encounter,
 * after any failure or critical failure. Successes/critical successes
 * never block.
 */
export function shouldBlockAfter(degree) {
  return !IDENTIFYING_DEGREES.has(degree);
}

/**
 * The encounter attempts are tracked against, or null outside one.
 * `game.combat` is whichever combat the tracker is showing, which may be
 * one still being set up; only a started combat counts as an active
 * encounter (SPEC.md §6.6), so preparing a fight never throttles anyone.
 */
export function getActiveEncounter() {
  const combat = game.combat;
  return combat?.started ? combat : null;
}

function getRecord(combat, actorUuid, targetUuid) {
  if (!combat) return null;
  const data = combat.getFlag(MODULE_ID, FLAG_KEY) ?? {};
  return data[attemptKey(actorUuid, targetUuid)] ?? null;
}

/**
 * Reads whether (actorUuid, targetUuid) is currently throttled for this
 * combat. Keyed by the *rolling character*, not the Foundry user account —
 * Recall Knowledge represents a character's own memory, so one player
 * controlling multiple PCs (or one person testing several party members
 * from a single login) must not have one character's failure block
 * another's attempt. No active combat means no throttling applies at all
 * (SPEC.md §6.6).
 */
export function isAttemptBlocked(combat, actorUuid, targetUuid) {
  return Boolean(getRecord(combat, actorUuid, targetUuid)?.blocked);
}

/**
 * Reads whether this character has already identified the target (via a
 * prior Success or Critical Success this encounter). Once true, it stays
 * true regardless of later failures — a character doesn't un-learn a
 * creature's identity because a later check went badly.
 */
export function isIdentified(combat, actorUuid, targetUuid) {
  return Boolean(getRecord(combat, actorUuid, targetUuid)?.identified);
}

/**
 * Reads the stable keys (see constants.js `makeFactKey`) of every true fact
 * already revealed to this character about this target this encounter.
 * Used to keep false info (critical failure) from ever contradicting
 * something the character already truthfully knows.
 */
export function getRevealedFacts(combat, actorUuid, targetUuid) {
  return getRecord(combat, actorUuid, targetUuid)?.revealedFacts ?? [];
}

/**
 * Records the outcome of an attempt on the active Combat document. Flags
 * live on the Combat document itself, so ending/deleting that combat clears
 * them automatically — no separate cleanup is needed.
 *
 * `newRevealedKeys` are the stable keys of any true facts revealed by
 * *this* attempt (empty for Failure/Critical Failure) — they're merged
 * into the character's cumulative knowledge of this target.
 *
 * Only this pair's own key is written, never the whole map: the GM may be
 * recording several players' relayed attempts at once (see socket.js), and
 * a whole-map write would let one land on top of and erase another.
 */
export async function recordAttempt(combat, actorUuid, targetUuid, degree, newRevealedKeys = []) {
  if (!combat) return;
  const key = attemptKey(actorUuid, targetUuid);
  const existing = getRecord(combat, actorUuid, targetUuid) ?? { count: 0, blocked: false, identified: false, revealedFacts: [] };
  await combat.setFlag(MODULE_ID, `${FLAG_KEY}.${key}`, {
    count: existing.count + 1,
    lastDegree: degree,
    blocked: existing.blocked || shouldBlockAfter(degree),
    identified: existing.identified || IDENTIFYING_DEGREES.has(degree),
    revealedFacts: [...new Set([...existing.revealedFacts, ...newRevealedKeys])],
  });
}
