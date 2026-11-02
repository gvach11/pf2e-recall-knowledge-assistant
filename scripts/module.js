import { API_VERSION, MODULE_ID } from "./constants.js";
import { registerSceneControl, openRecallKnowledgeDialog } from "./ui/scene-control.js";
import { ensureHotbarMacro } from "./macro.js";
import { registerSocket } from "./socket.js";
import { getAttemptStatus } from "./attempt-status.js";

Hooks.once("init", () => {
  registerSceneControl();
});

Hooks.once("ready", () => {
  // Public API for macros and other modules (SPEC.md §6.7).
  game.modules.get(MODULE_ID).api = { apiVersion: API_VERSION, openDialog: openRecallKnowledgeDialog, getAttemptStatus };
  registerSocket();

  if (game.user.isGM === false) {
    ensureHotbarMacro();
  }
});
