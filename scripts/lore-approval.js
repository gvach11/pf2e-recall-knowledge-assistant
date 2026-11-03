import { CATEGORIES, LORE_EASE, SOCKET_NAME } from "./constants.js";
import { applyFollowUpStep, computeLoreDC } from "./data/dc-table.js";
import { getEncounterFor, getFollowUpStep } from "./repeat-attempts.js";
import { isValidTargetActor } from "./targeting.js";
import { promptGmLoreDecision } from "./applications/lore-decision-prompt.js";

export const LORE_MESSAGES = Object.freeze({
  REQUEST: "loreRequest",
  REPLY: "loreReply",
  CANCEL: "loreCancel",
});

const DECLINED = "declined";
const VALID_DECISIONS = new Set([...Object.values(LORE_EASE), DECLINED]);
const VALID_CATEGORIES = new Set(Object.values(CATEGORIES));

// Player side: the one request this client is waiting on, if any. The
// dialog is a singleton, so one pending request per client is enough.
let pending = null;

// GM side: the open popups, by request id, with who asked.
const openPrompts = new Map();

/**
 * Asks the active GM to rule on a Lore roll (SPEC.md §6.8) and resolves
 * with the ruling: an ease ("easy" / "very-easy"), "declined", "cancelled"
 * (the player cancelled, or asked again), or "unavailable" (no active GM,
 * or the GM asked left). When the requester is the active GM, the choice
 * is shown right here instead of making a round trip.
 *
 * @returns {Promise<"easy"|"very-easy"|"declined"|"cancelled"|"unavailable">}
 */
export async function requestLoreDecision({ rollingActor, targetActor, targetToken, loreSlug, category }) {
  const gm = game.users.activeGM;
  if (!gm) return "unavailable";
  if (gm.isSelf) {
    return promptGmLoreDecision(buildPromptData({ rollingActor, targetActor, targetToken, loreSlug, category })).decision;
  }

  cancelPendingLoreRequest();
  const requestId = foundry.utils.randomID();
  const decision = new Promise((resolve) => {
    pending = { requestId, gmId: gm.id, resolve };
  });
  game.socket.emit(SOCKET_NAME, {
    type: LORE_MESSAGES.REQUEST,
    requestId,
    actorUuid: rollingActor.uuid,
    targetUuid: targetActor.uuid,
    targetTokenUuid: targetToken?.uuid,
    loreSlug,
    category,
  });
  return decision;
}

/** Withdraws this client's waiting request, closing the GM's popup for it. */
export function cancelPendingLoreRequest() {
  if (!pending) return;
  game.socket.emit(SOCKET_NAME, { type: LORE_MESSAGES.CANCEL, requestId: pending.requestId });
  settle("cancelled");
}

/**
 * Player side. Socket messages reach every client, so a reply counts only
 * if it's for this user and the request still waiting, and comes from the
 * user who is the active GM right now.
 */
export function handleLoreReply(message, senderId) {
  if (!pending) return;
  if (message?.userId !== game.user.id || message.requestId !== pending.requestId) return;
  if (senderId !== game.users.activeGM?.id) return;
  if (!VALID_DECISIONS.has(message.decision)) return;
  settle(message.decision);
}

/**
 * Called on every `userConnected` hook: a request can't be answered once
 * the GM it went to is no longer the active GM, so stop waiting.
 */
export function onUserConnectionChange() {
  if (pending && game.users.activeGM?.id !== pending.gmId) settle("unavailable");
}

/**
 * GM side (the active GM only — socket.js routes it). The request comes
 * from another client, so it's checked before anything is shown; one that
 * fails is dropped silently, and the player can still cancel their wait.
 */
export async function handleLoreRequest(message, senderId) {
  const { requestId, actorUuid, targetUuid, targetTokenUuid, loreSlug, category } = message ?? {};
  if (typeof requestId !== "string" || typeof actorUuid !== "string" || typeof targetUuid !== "string") return;

  const sender = game.users.get(senderId);
  const rollingActor = fromUuidSync(actorUuid);
  if (!sender || !rollingActor?.testUserPermission(sender, "OWNER")) return;
  if (rollingActor.skills?.[loreSlug]?.lore !== true) return;
  if (!VALID_CATEGORIES.has(category)) return;

  const targetActor = fromUuidSync(targetUuid);
  if (!isValidTargetActor(targetActor)) return;
  const targetToken = typeof targetTokenUuid === "string" ? fromUuidSync(targetTokenUuid) : null;

  const prompt = promptGmLoreDecision(buildPromptData({ rollingActor, targetActor, targetToken, loreSlug, category }));
  openPrompts.set(requestId, { senderId, close: prompt.close });
  const decision = await prompt.decision;

  // A cancelled request was already removed; its popup closing isn't a ruling.
  if (!openPrompts.delete(requestId)) return;
  game.socket.emit(SOCKET_NAME, { type: LORE_MESSAGES.REPLY, requestId, userId: senderId, decision });
}

/** GM side: only the player who asked can withdraw a request. */
export function handleLoreCancel(message, senderId) {
  const entry = openPrompts.get(message?.requestId);
  if (!entry || entry.senderId !== senderId) return;
  openPrompts.delete(message.requestId);
  entry.close();
}

function settle(decision) {
  const { resolve } = pending;
  pending = null;
  resolve(decision);
}

// The GM sees everything: real names, the token's art and both DCs, each
// raised for a follow-up just as the roll will be (SPEC.md §6.6).
function buildPromptData({ rollingActor, targetActor, targetToken, loreSlug, category }) {
  const step = getFollowUpStep(getEncounterFor(targetActor), rollingActor.uuid, targetActor.uuid);
  return {
    characterName: rollingActor.name,
    loreLabel: rollingActor.skills[loreSlug].label,
    categoryLabel: game.i18n.localize(`RKA.Category.${category}`),
    targetName: targetActor.name,
    targetImg: targetToken?.texture?.src ?? targetActor.img,
    dcs: {
      easy: applyFollowUpStep(computeLoreDC(targetActor, LORE_EASE.EASY), step),
      veryEasy: applyFollowUpStep(computeLoreDC(targetActor, LORE_EASE.VERY_EASY), step),
    },
  };
}
