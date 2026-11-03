import { IDENTIFYING_DEGREES, MODULE_ID } from "../constants.js";
import { getUnknownTargetLabelKey } from "../targeting.js";

const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/chat-result.hbs`;

/**
 * Renders and creates the player-facing chat message (never containing the
 * DC) plus a separate GM-only companion message with the true roll/DC/
 * degree, per SPEC.md §6.5.
 *
 * The target's real name is only ever printed in the header once it's
 * actually been earned: either this attempt identifies it (Success/
 * Critical Success), or the character already identified it on an earlier
 * attempt this encounter (`alreadyIdentified`) — a later failure must not
 * make an already-known identity look forgotten. The identity reveal
 * itself happens via the baseline text ("X is a Y."), not the header.
 *
 * A Lore roll (`loreEase` set) says so in the GM-only message, with the
 * ease the GM chose; the player's card never mentions it (SPEC.md §6.8).
 * A follow-up attempt (`followUpStep` above "normal") likewise notes its
 * raised difficulty for the GM only (SPEC.md §6.6).
 *
 * @param {{reveal: import("../reveal.js").Reveal}} args
 */
export async function renderResultChatMessage({
  degree,
  dc,
  rollTotal,
  rollingActor,
  targetActor,
  alreadyIdentified,
  reveal,
  loreEase,
  followUpStep,
}) {
  const headerName =
    IDENTIFYING_DEGREES.has(degree) || alreadyIdentified
      ? targetActor.name
      : game.i18n.localize(getUnknownTargetLabelKey(targetActor));

  const baseline = reveal.baseline
    ? game.i18n.format("RKA.Chat.Baseline", {
        name: reveal.baseline.name,
        article: /^[aeiou]/i.test(reveal.baseline.trait) ? "an" : "a",
        trait: reveal.baseline.trait,
      })
    : null;

  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATH, {
    // No `degree` here: anything in the player's card HTML is readable by
    // the player, and the degree would mark a critical-failure lie.
    targetName: headerName,
    baseline,
    facts: reveal.facts,
  });

  const speaker = ChatMessage.getSpeaker({ actor: rollingActor });

  await ChatMessage.create({ speaker, content });

  const loreNote = loreEase
    ? `<p>${game.i18n.format("RKA.Chat.GmLoreNote", { ease: game.i18n.localize(`RKA.Lore.Ease.${loreEase}`) })}</p>`
    : "";
  const followUpNote =
    followUpStep && followUpStep !== "normal"
      ? `<p>${game.i18n.format("RKA.Chat.GmFollowUpNote", { step: game.i18n.localize(`RKA.FollowUpStep.${followUpStep}`) })}</p>`
      : "";
  const gmContent = `
    <div class="rka-gm-detail">
      <strong>${game.i18n.localize("RKA.Chat.GmDetailTitle")}</strong>
      <p>${targetActor.name} — DC ${dc} — Roll ${rollTotal} — ${game.i18n.localize(`RKA.Degree.${degree}`)}</p>
      ${loreNote}
      ${followUpNote}
    </div>
  `;
  await ChatMessage.create({
    speaker,
    content: gmContent,
    whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
    blind: true,
  });
}
