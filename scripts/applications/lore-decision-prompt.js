import { LORE_EASE, MODULE_ID } from "../constants.js";

/**
 * The GM's popup for a Lore request (SPEC.md §6.8): Decline, Easy (DC X)
 * or Very easy (DC Y). Closing it without choosing counts as a decline.
 * `close` lets the caller dismiss it when the player withdraws the request.
 *
 * @returns {{decision: Promise<"easy"|"very-easy"|"declined">, close: () => void}}
 */
export function promptGmLoreDecision({ characterName, loreLabel, categoryLabel, targetName, targetImg, dcs }) {
  const { DialogV2 } = foundry.applications.api;
  const escape = foundry.utils.escapeHTML;
  let dialog = null;

  const body = game.i18n.format("RKA.Lore.PopupBody", {
    character: escape(characterName),
    lore: escape(loreLabel),
    category: escape(categoryLabel),
    target: escape(targetName),
  });

  const decision = DialogV2.wait({
    window: { title: "RKA.Lore.PopupTitle", icon: "fa-solid fa-book" },
    classes: [MODULE_ID, "rka-lore-prompt"],
    content: `<div class="rka-lore-prompt-body"><img src="${escape(targetImg ?? "")}" alt="" /><p>${body}</p></div>`,
    buttons: [
      { action: "declined", label: "RKA.Lore.Decline" },
      { action: LORE_EASE.EASY, label: game.i18n.format("RKA.Lore.Easy", { dc: dcs.easy }) },
      { action: LORE_EASE.VERY_EASY, label: game.i18n.format("RKA.Lore.VeryEasy", { dc: dcs.veryEasy }) },
    ],
    rejectClose: false,
    render: (event, app) => {
      dialog = app;
    },
  }).then((result) => result ?? "declined");

  return { decision, close: () => dialog?.close() };
}
