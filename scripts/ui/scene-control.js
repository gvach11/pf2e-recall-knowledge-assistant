import { getValidatedSingleTarget, validateTargetToken } from "../targeting.js";
import { RecallKnowledgeDialog } from "../applications/recall-knowledge-dialog.js";

/**
 * Registers the "Recall Knowledge" tool in the Token layer scene controls.
 * This is the primary trigger: the player targets a token with Foundry's
 * native Target tool, then clicks this button (SPEC.md §4/§6.1) — no token
 * permission workarounds needed.
 */
export function registerSceneControl() {
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.tokens;
    if (!tokenControls) return;

    tokenControls.tools["recall-knowledge"] = {
      name: "recall-knowledge",
      title: "RKA.SceneControl.Title",
      icon: "fa-solid fa-brain",
      order: Object.keys(tokenControls.tools).length,
      button: true,
      onChange: () => openRecallKnowledgeDialog(),
    };
  });
}

/**
 * Opens the dialog. With no arguments (scene button, macro) the target is
 * the user's single current target and the roller comes from
 * resolveRollingActor(). Another module can name either one instead — the
 * public API (SPEC.md §6.7) — and a named roller must be a character the
 * user owns; it's refused, never swapped for someone else.
 */
export function openRecallKnowledgeDialog({ actor, targetToken: givenToken } = {}) {
  const targetToken = givenToken ? validateTargetToken(givenToken) : getValidatedSingleTarget();
  if (!targetToken) return;

  if (actor && !isEligibleRollingActor(actor)) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.InvalidRollingActor"));
    return;
  }

  const rollingActor = actor ?? resolveRollingActor();
  if (!rollingActor) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.NoRollingActor"));
    return;
  }

  new RecallKnowledgeDialog({ targetToken, rollingActor }).render(true);
}

/**
 * A character the current user owns — the only kind of actor whose memory
 * Recall Knowledge tests (SPEC.md §4). A GM owns every character.
 */
export function isEligibleRollingActor(actor) {
  return actor?.type === "character" && actor.isOwner === true;
}

/**
 * Whose memory is being tested. A player who owns several characters picks
 * one by selecting its token, so a controlled character token they own
 * wins over their assigned character; otherwise the assigned character
 * rolls. Controlled NPCs and other people's characters never roll —
 * Recall Knowledge is the player's own character's knowledge (SPEC.md §4).
 */
export function resolveRollingActor() {
  const controlled = canvas.tokens.controlled.find((token) => isEligibleRollingActor(token.actor));
  return controlled?.actor ?? game.user.character ?? null;
}
