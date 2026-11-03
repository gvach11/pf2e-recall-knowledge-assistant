import { DEGREES, MODULE_ID, SOCKET_NAME } from "./constants.js";
import { recordAttempt } from "./repeat-attempts.js";
import { LORE_MESSAGES, handleLoreCancel, handleLoreReply, handleLoreRequest } from "./lore-approval.js";

export { SOCKET_NAME };
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

  // Combat's update permission depends on which fields change (players may
  // touch only round/turn/combatants), so ask about the flag write itself —
  // asked with no data, it answers "yes" for every player.
  if (combat.canUserModify(game.user, "update", { flags: { [MODULE_ID]: {} } })) {
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
 * Runs on every client. A Lore reply is for the player who asked, so every
 * client hands it on (lore-approval.js checks it's theirs). Everything else
 * is for the active GM only — exactly one writer, one popup. The payload
 * comes from another client, so it's validated before use, and a sender may
 * only record attempts for an actor they own.
 */
export async function handleSocketMessage(message, senderId) {
  if (message?.type === LORE_MESSAGES.REPLY) return handleLoreReply(message, senderId);
  if (!game.users.activeGM?.isSelf) return;
  if (message?.type === LORE_MESSAGES.REQUEST) return handleLoreRequest(message, senderId);
  if (message?.type === LORE_MESSAGES.CANCEL) return handleLoreCancel(message, senderId);
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
