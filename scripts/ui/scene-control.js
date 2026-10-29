import { getValidatedSingleTarget } from "../targeting.js";
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

export function openRecallKnowledgeDialog() {
  const targetToken = getValidatedSingleTarget();
  if (!targetToken) return;

  const rollingActor = resolveRollingActor();
  if (!rollingActor) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.NoRollingActor"));
    return;
  }

  new RecallKnowledgeDialog({ targetToken, rollingActor }).render(true);
}

/**
 * Whose memory is being tested. A player who owns several characters picks
 * one by selecting its token, so a controlled character token they own
 * wins over their assigned character; otherwise the assigned character
 * rolls. Controlled NPCs and other people's characters never roll —
 * Recall Knowledge is the player's own character's knowledge (SPEC.md §4).
 */
export function resolveRollingActor() {
  const controlled = canvas.tokens.controlled.find((token) => token.actor?.type === "character" && token.actor.isOwner);
  return controlled?.actor ?? game.user.character ?? null;
}
