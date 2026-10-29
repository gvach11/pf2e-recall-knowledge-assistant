import { DEGREES, MODULE_ID } from "./constants.js";
import { recordAttempt } from "./repeat-attempts.js";

export const SOCKET_NAME = `module.${MODULE_ID}`;
const RECORD_ATTEMPT = "recordAttempt";
const VALID_DEGREES = new Set(Object.values(DEGREES));

/**
 * Saves an attempt to the encounter. Players can't update a Combat
 * document, so their client asks the active GM's client to write it
 * instead (SPEC.md §6.6 keeps the Combat flag as the single store). The
 * relay is fire-and-forget: the record reaches the player through the
 * normal document sync once the GM has written it.
 *
 * @returns {Promise<"skipped"|"recorded"|"relayed"|"unrecorded">}
 */
export async function persistAttempt(combat, actorUuid, targetUuid, degree, newRevealedKeys = []) {
  if (!combat) return "skipped";

  if (combat.canUserModify(game.user, "update")) {
    await recordAttempt(combat, actorUuid, targetUuid, degree, newRevealedKeys);
    return "recorded";
  }

  if (game.users.activeGM) {
    game.socket.emit(SOCKET_NAME, {
      type: RECORD_ATTEMPT,
      combatId: combat.id,
      actorUuid,
      targetUuid,
      degree,
      newRevealedKeys,
    });
    return "relayed";
  }

  ui.notifications.warn(game.i18n.localize("RKA.Warning.NoGmToRecord"));
  return "unrecorded";
}

/**
 * Runs on every client, but only the active GM acts — exactly one writer.
 * The payload comes from another client, so it's validated before use, and
 * a sender may only record attempts for an actor they own.
 */
export async function handleSocketMessage(message, senderId) {
  if (!game.users.activeGM?.isSelf) return;
  if (message?.type !== RECORD_ATTEMPT) return;

  const { combatId, actorUuid, targetUuid, degree, newRevealedKeys } = message;
  if (typeof actorUuid !== "string" || typeof targetUuid !== "string") return;
  if (!VALID_DEGREES.has(degree)) return;
  if (!Array.isArray(newRevealedKeys) || !newRevealedKeys.every((key) => typeof key === "string")) return;

  const sender = game.users.get(senderId);
  if (!sender || !fromUuidSync(actorUuid)?.testUserPermission(sender, "OWNER")) return;

  const combat = game.combats.get(combatId);
  if (!combat) return;

  await recordAttempt(combat, actorUuid, targetUuid, degree, newRevealedKeys);
}

export function registerSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}
