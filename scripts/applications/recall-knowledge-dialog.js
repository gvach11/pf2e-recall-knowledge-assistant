import { CATEGORIES, MODULE_ID } from "../constants.js";
import { getActorFacts, getRelevantSkills } from "../actor-data.js";
import { computeHiddenDC, computeDegreeOfSuccess, computeLikelihood } from "../data/dc-table.js";
import { rollRecallKnowledge } from "../roll.js";
import { isAttemptBlocked, isIdentified, getRevealedFacts, recordAttempt } from "../repeat-attempts.js";
import { resolveReveal } from "../reveal.js";
import { renderResultChatMessage } from "../chat/render-result.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RecallKnowledgeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #targetToken;
  #targetActor;
  #rollingActor;
  #facts;
  #selectedCategory = CATEGORIES.WEAKNESSES;
  #selectedSkill = null;

  constructor({ targetToken, rollingActor }, options = {}) {
    super(options);
    this.#targetToken = targetToken;
    this.#targetActor = targetToken.actor;
    this.#rollingActor = rollingActor;
    this.#facts = getActorFacts(this.#targetActor);
  }

  static DEFAULT_OPTIONS = {
    id: "recall-knowledge-assistant-dialog",
    classes: ["recall-knowledge-assistant"],
    tag: "div",
    window: {
      title: "RKA.Dialog.Title",
      icon: "fa-solid fa-brain",
      resizable: false,
    },
    position: { width: 460 },
    actions: {
      selectCategory: RecallKnowledgeDialog.#onSelectCategory,
      selectSkill: RecallKnowledgeDialog.#onSelectSkill,
      rollSkill: RecallKnowledgeDialog.#onRollSkill,
    },
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/dialog.hbs` },
  };

  async _prepareContext() {
    const combat = game.combat ?? null;
    const blocked = isAttemptBlocked(combat, this.#rollingActor.uuid, this.#targetActor.uuid);

    const dc = computeHiddenDC(this.#targetActor);
    const relevantSlugs = getRelevantSkills(this.#targetActor, this.#facts);
    const skills = relevantSlugs.map((slug) => {
      const statistic = this.#rollingActor.skills?.[slug] ?? this.#rollingActor.getStatistic?.(slug);
      const modifier = statistic?.mod ?? statistic?.totalModifier ?? 0;
      const isTrained = (statistic?.rank ?? 0) >= 1;
      return {
        slug,
        label: statistic?.label ?? game.i18n.localize(`PF2E.Skill.${slug}`) ?? slug,
        likelihood: computeLikelihood(modifier, dc, isTrained),
        selected: slug === this.#selectedSkill,
      };
    });

    const categories = Object.values(CATEGORIES).map((key) => ({
      key,
      label: game.i18n.localize(`RKA.Category.${key}`),
      selected: key === this.#selectedCategory,
    }));

    return {
      // Never the real name here — the dialog always renders before a roll
      // has happened, so identity hasn't been earned yet (SPEC.md §6.2).
      targetName: game.i18n.localize("RKA.UnknownTarget"),
      targetImg: this.#targetActor.img,
      skills,
      categories,
      blocked,
      canRoll: !blocked && Boolean(this.#selectedSkill),
    };
  }

  static #onSelectCategory(event, target) {
    this.#selectedCategory = target.dataset.category;
    this.render();
  }

  static #onSelectSkill(event, target) {
    this.#selectedSkill = target.dataset.skill;
    this.render();
  }

  static async #onRollSkill(event) {
    if (!this.#selectedSkill) return;

    const combat = game.combat ?? null;
    const actorUuid = this.#rollingActor.uuid;
    const targetUuid = this.#targetActor.uuid;

    if (isAttemptBlocked(combat, actorUuid, targetUuid)) {
      ui.notifications.warn(game.i18n.localize("RKA.Warning.AlreadyAttempted"));
      return;
    }

    const rollResult = await rollRecallKnowledge({
      rollingActor: this.#rollingActor,
      targetActor: this.#targetActor,
      statistic: this.#selectedSkill,
      event,
    });

    if (!rollResult) {
      ui.notifications.error(game.i18n.localize("RKA.Error.RollFailed"));
      return;
    }

    const dc = computeHiddenDC(this.#targetActor);
    const degree = computeDegreeOfSuccess(rollResult.rollTotal, dc, rollResult.naturalD20);

    // Prior knowledge this character already has about this target this
    // encounter — used so a critical failure never contradicts an
    // already-revealed true fact, and so identity stays known once earned.
    const priorRevealedKeys = new Set(getRevealedFacts(combat, actorUuid, targetUuid));
    const alreadyIdentified = isIdentified(combat, actorUuid, targetUuid);

    const reveal = resolveReveal(this.#facts, this.#selectedCategory, degree, priorRevealedKeys);

    await renderResultChatMessage({
      degree,
      dc,
      rollTotal: rollResult.rollTotal,
      rollingActor: this.#rollingActor,
      targetActor: this.#targetActor,
      alreadyIdentified,
      reveal,
    });

    await recordAttempt(combat, actorUuid, targetUuid, degree, reveal.revealedKeys);

    this.close();
  }
}
