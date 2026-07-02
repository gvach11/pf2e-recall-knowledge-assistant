import { MODULE_ID } from "./constants.js";
import { registerSceneControl, openRecallKnowledgeDialog } from "./ui/scene-control.js";
import { ensureHotbarMacro } from "./macro.js";

Hooks.once("init", () => {
  registerSceneControl();
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { openDialog: openRecallKnowledgeDialog };

  if (game.user.isGM === false) {
    ensureHotbarMacro();
  }
});
