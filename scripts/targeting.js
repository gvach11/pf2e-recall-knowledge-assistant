const VALID_ACTOR_TYPES = new Set(["npc", "hazard"]);

/**
 * Validates the current user's targets for a Recall Knowledge attempt:
 * exactly one token must be targeted, and it must be an NPC or Hazard
 * (never a PC or any other actor type). Returns the target token, or null
 * (after showing a warning notification) if validation fails.
 */
export function getValidatedSingleTarget() {
  const targets = game.user.targets;

  if (targets.size === 0) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.NoTarget"));
    return null;
  }

  if (targets.size > 1) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.MultipleTargets"));
    return null;
  }

  return validateTargetToken(targets.first());
}

/**
 * Whether an actor can be the subject of Recall Knowledge: an NPC or
 * Hazard, never a PC or any other actor type.
 */
export function isValidTargetActor(actor) {
  return VALID_ACTOR_TYPES.has(actor?.type);
}

/**
 * Checks one specific token as a Recall Knowledge target. Returns the
 * canvas Token, or null (after showing a warning notification) if it isn't
 * an NPC or Hazard. A TokenDocument (what macros usually hold) is swapped
 * for its canvas Token, which the dialog renders from; one that isn't on
 * the canvas is rejected.
 */
export function validateTargetToken(token) {
  if (token?.documentName === "Token") token = token.object;
  if (!isValidTargetActor(token?.actor)) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.InvalidTargetType"));
    return null;
  }
  return token;
}

/**
 * The placeholder shown instead of an unidentified target's real name.
 * A trap isn't a creature, and calling it one would mislead the player.
 */
export function getUnknownTargetLabelKey(actor) {
  return actor?.type === "hazard" ? "RKA.UnknownHazard" : "RKA.UnknownTarget";
}
