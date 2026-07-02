import { MODULE_ID } from "./constants.js";

const MACRO_NAME = "Recall Knowledge";
const MACRO_COMMAND = `game.modules.get("${MODULE_ID}").api.openDialog();`;

/**
 * Creates a convenience hotbar macro for the current user if they don't
 * already have one for this module. Secondary trigger only — the scene
 * control button (ui/scene-control.js) is primary.
 */
export async function ensureHotbarMacro() {
  const existing = game.macros.find((m) => m.getFlag(MODULE_ID, "isTriggerMacro"));
  if (existing) return;

  // Created in the world's macro directory but not auto-assigned to a
  // hotbar slot — the player can drag it there themselves. The scene
  // control button is the primary trigger; this is just a convenience for
  // players who prefer a hotbar shortcut.
  await Macro.create({
    name: MACRO_NAME,
    type: "script",
    scope: "global",
    command: MACRO_COMMAND,
    img: "icons/magic/perception/eye-slit-red.webp",
    flags: { [MODULE_ID]: { isTriggerMacro: true } },
  });
}
