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

  const token = targets.first();
  const actorType = token.actor?.type;
  if (!VALID_ACTOR_TYPES.has(actorType)) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.InvalidTargetType"));
    return null;
  }

  return token;
}
