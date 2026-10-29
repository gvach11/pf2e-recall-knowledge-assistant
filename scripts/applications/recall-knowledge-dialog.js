import { CATEGORIES, MODULE_ID } from "../constants.js";
import { getActorFacts, getRelevantSkills } from "../actor-data.js";
import { computeHiddenDC, computeLikelihood } from "../data/dc-table.js";
import { getActiveEncounter, isAttemptBlocked } from "../repeat-attempts.js";
import { executeRollSequence } from "../roll-sequence.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RecallKnowledgeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #targetToken;
  #targetActor;
  #rollingActor;
  #facts;
  #dc;
  #selectedCategory = CATEGORIES.WEAKNESSES;
  #selectedSkill = null;
  #isRolling = false;

  constructor({ targetToken, rollingActor }, options = {}) {
    super(options);
    this.#targetToken = targetToken;
    this.#targetActor = targetToken.actor;
    this.#rollingActor = rollingActor;
    this.#facts = getActorFacts(this.#targetActor);
    this.#dc = computeHiddenDC(this.#targetActor);
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-recall-knowledge-assistant-dialog",
    classes: ["pf2e-recall-knowledge-assistant"],
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
    const combat = getActiveEncounter();
    const blocked = isAttemptBlocked(combat, this.#rollingActor.uuid, this.#targetActor.uuid);

    const dc = this.#dc;
    const relevantSlugs = getRelevantSkills(this.#targetActor, this.#facts);
    const skills = relevantSlugs.map((slug) => {
      const statistic = this.#rollingActor.skills?.[slug] ?? this.#rollingActor.getStatistic?.(slug);
      const modifier = statistic?.mod ?? statistic?.totalModifier ?? 0;
      const isTrained = (statistic?.rank ?? 0) >= 1;
      return {
        slug,
        label: statistic?.label ?? game.i18n.localize(`PF2E.Skill.${slug}`),
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
    if (!this.#selectedSkill || this.#isRolling) return;

    this.#isRolling = true;
    try {
      const result = await executeRollSequence({
        combat: getActiveEncounter(),
        rollingActor: this.#rollingActor,
        targetActor: this.#targetActor,
        facts: this.#facts,
        dc: this.#dc,
        selectedSkill: this.#selectedSkill,
        selectedCategory: this.#selectedCategory,
        event,
      });

      if (result.outcome === "completed") this.close();
    } finally {
      this.#isRolling = false;
    }
  }
}
