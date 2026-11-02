import { ATTEMPT_STATUS } from "./constants.js";
import { getActorFacts } from "./actor-data.js";
import { isTargetExhausted } from "./reveal.js";
import { getActiveEncounter, getRevealedFacts, isAttemptBlocked, isIdentified } from "./repeat-attempts.js";
import { isValidTargetActor } from "./targeting.js";

/**
 * Whether another Recall Knowledge attempt by this character against this
 * token is worth making right now (SPEC.md §6.7) — for other modules, such
 * as a turn-suggestion panel, deciding whether to offer it. Read-only.
 *
 * Checked in order: "invalid" (not a character rolling against an NPC or
 * Hazard), "blocked" (failed earlier this encounter), "exhausted" (nothing
 * left to learn), otherwise "available" — including outside a started
 * encounter, where nothing is remembered. The target is keyed by the
 * token's actor, as the dialog does, so each unlinked token is its own.
 */
export function getAttemptStatus({ actor, targetToken } = {}) {
  const targetActor = targetToken?.actor;
  if (actor?.type !== "character" || !isValidTargetActor(targetActor)) return ATTEMPT_STATUS.INVALID;

  const combat = getActiveEncounter();
  if (isAttemptBlocked(combat, actor.uuid, targetActor.uuid)) return ATTEMPT_STATUS.BLOCKED;

  const known = getRevealedFacts(combat, actor.uuid, targetActor.uuid);
  const identified = isIdentified(combat, actor.uuid, targetActor.uuid);
  if (isTargetExhausted(getActorFacts(targetActor), known, identified)) return ATTEMPT_STATUS.EXHAUSTED;

  return ATTEMPT_STATUS.AVAILABLE;
}
