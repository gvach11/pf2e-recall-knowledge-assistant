import { MODULE_ID, SETTINGS } from "./constants.js";

export function registerSettings() {
  // RAW follow-ups (SPEC.md §6.6). Off restores the 1.1 behavior: every
  // attempt at the normal DC, until a failure.
  game.settings.register(MODULE_ID, SETTINGS.HARDER_FOLLOW_UPS, {
    name: "RKA.Settings.HarderFollowUps.Name",
    hint: "RKA.Settings.HarderFollowUps.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

export function harderFollowUps() {
  return game.settings.get(MODULE_ID, SETTINGS.HARDER_FOLLOW_UPS);
}
