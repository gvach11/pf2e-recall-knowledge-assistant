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

  const rollingActor = game.user.character ?? canvas.tokens.controlled[0]?.actor;
  if (!rollingActor) {
    ui.notifications.warn(game.i18n.localize("RKA.Warning.NoRollingActor"));
    return;
  }

  new RecallKnowledgeDialog({ targetToken, rollingActor }).render(true);
}
