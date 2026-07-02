import { IDENTIFYING_DEGREES, MODULE_ID } from "../constants.js";

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
 */
export async function renderResultChatMessage({
  degree,
  dc,
  rollTotal,
  rollingActor,
  targetActor,
  alreadyIdentified,
  reveal,
}) {
  const headerName =
    IDENTIFYING_DEGREES.has(degree) || alreadyIdentified
      ? targetActor.name
      : game.i18n.localize("RKA.UnknownTarget");

  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATH, {
    targetName: headerName,
    degree,
    baseline: reveal.baseline,
    facts: reveal.facts,
  });

  const speaker = ChatMessage.getSpeaker({ actor: rollingActor });

  await ChatMessage.create({ speaker, content });

  const gmContent = `
    <div class="rka-gm-detail">
      <strong>${game.i18n.localize("RKA.Chat.GmDetailTitle")}</strong>
      <p>${targetActor.name} — DC ${dc} — Roll ${rollTotal} — ${game.i18n.localize(`RKA.Degree.${degree}`)}</p>
    </div>
  `;
  await ChatMessage.create({
    speaker,
    content: gmContent,
    whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
  });
}
