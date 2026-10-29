import { computeDegreeOfSuccess } from "./data/dc-table.js";
import { isAttemptBlocked, isIdentified, getRevealedFacts, recordAttempt } from "./repeat-attempts.js";
import { resolveReveal } from "./reveal.js";
import { rollRecallKnowledge } from "./roll.js";
import { renderResultChatMessage } from "./chat/render-result.js";

/**
 * Runs the full roll -> degree -> reveal -> chat -> record sequence for one
 * Recall Knowledge attempt. Extracted out of the dialog so it can be unit
 * tested without the ApplicationV2/HandlebarsApplicationMixin machinery the
 * dialog itself requires (see architecture report F4).
 *
 * `dc` is computed once by the caller and passed in rather than recomputed
 * here, so there's a single source of truth for "the current DC" within one
 * roll cycle (see architecture report F13).
 */
export async function executeRollSequence({
  combat,
  rollingActor,
  targetActor,
  facts,
  dc,
  selectedSkill,
  selectedCategory,
  event,
}) {
  const actorUuid = rollingActor.uuid;
  const targetUuid = targetActor.uuid;

  if (isAttemptBlocked(combat, actorUuid, targetUuid)) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.AlreadyAttempted"));
    return { outcome: "blocked" };
  }

  try {
    const rollResult = await rollRecallKnowledge({
      rollingActor,
      targetActor,
      statistic: selectedSkill,
      event,
    });

    if (!rollResult) {
      ui.notifications.error(game.i18n.localize("RKA.Error.RollFailed"));
      return { outcome: "no-roll" };
    }

    const degree = computeDegreeOfSuccess(rollResult.rollTotal, dc, rollResult.naturalD20);

    const priorRevealedKeys = new Set(getRevealedFacts(combat, actorUuid, targetUuid));
    const alreadyIdentified = isIdentified(combat, actorUuid, targetUuid);

    const reveal = resolveReveal(facts, selectedCategory, degree, priorRevealedKeys, alreadyIdentified);

    await renderResultChatMessage({
      degree,
      dc,
      rollTotal: rollResult.rollTotal,
      rollingActor,
      targetActor,
      alreadyIdentified,
      reveal,
    });

    await recordAttempt(combat, actorUuid, targetUuid, degree, reveal.revealedKeys);

    return { outcome: "completed", degree };
  } catch (error) {
    console.error(error);
    ui.notifications.error(game.i18n.localize("RKA.Error.RollFailed"));
    return { outcome: "error" };
  }
}
