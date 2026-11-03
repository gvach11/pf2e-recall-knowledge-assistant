import { CATEGORIES, LORE_EASE, MODULE_ID } from "../constants.js";
import { getActorFacts, getLoreSkills, getRelevantSkills } from "../actor-data.js";
import { computeHiddenDC, computeLikelihood, computeLoreDC } from "../data/dc-table.js";
import { cancelPendingLoreRequest, requestLoreDecision } from "../lore-approval.js";
import { getEncounterFor, isAttemptBlocked } from "../repeat-attempts.js";
import { executeRollSequence } from "../roll-sequence.js";
import { getUnknownTargetLabelKey } from "../targeting.js";

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
  // True while a Lore request waits on another client's GM (SPEC.md §6.8).
  #waitingForGm = false;
  #userConnectedHook = null;

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
      cancelLore: RecallKnowledgeDialog.#onCancelLore,
    },
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/dialog.hbs` },
  };

  async _prepareContext() {
    const combat = getEncounterFor(this.#targetActor);
    const blocked = isAttemptBlocked(combat, this.#rollingActor.uuid, this.#targetActor.uuid);

    const dc = this.#dc;
    const loreSkills = getLoreSkills(this.#rollingActor);
    const loreSlugs = new Set(loreSkills.map(({ slug }) => slug));
    const relevantSlugs = getRelevantSkills(this.#targetActor, this.#facts).filter((slug) => !loreSlugs.has(slug));
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

    // Every Lore goes to the GM, who rules on whether it applies (SPEC.md
    // §6.8), so none gets a likelihood. Without a GM there's no one to ask.
    const gmAvailable = Boolean(game.users.activeGM);
    const lores = loreSkills.map(({ slug, label }) => ({
      slug,
      label,
      selected: slug === this.#selectedSkill,
      disabled: !gmAvailable,
      inputDisabled: !gmAvailable || this.#waitingForGm,
    }));
    const selectedLoreUnavailable = !gmAvailable && lores.some((lore) => lore.selected);

    const categories = Object.values(CATEGORIES).map((key) => ({
      key,
      label: game.i18n.localize(`RKA.Category.${key}`),
      selected: key === this.#selectedCategory,
    }));

    return {
      // Never the real name here — the dialog always renders before a roll
      // has happened, so identity hasn't been earned yet (SPEC.md §6.2).
      targetName: game.i18n.localize(getUnknownTargetLabelKey(this.#targetActor)),
      // The token art the player already sees on the canvas, not the actor
      // portrait, which can give away more than the token does.
      targetImg: this.#targetToken.document.texture.src,
      skills,
      lores,
      noSkills: skills.length === 0 && lores.length === 0,
      categories,
      blocked,
      waitingForGm: this.#waitingForGm,
      canRoll: !blocked && !this.#waitingForGm && !selectedLoreUnavailable && Boolean(this.#selectedSkill),
    };
  }

  // GMs connecting or leaving switch the Lore entries on and off live.
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#userConnectedHook = Hooks.on("userConnected", () => this.render());
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off("userConnected", this.#userConnectedHook);
    if (this.#waitingForGm) cancelPendingLoreRequest();
  }

  static #onSelectCategory(event, target) {
    this.#selectedCategory = target.dataset.category;
    this.render();
  }

  static #onSelectSkill(event, target) {
    this.#selectedSkill = target.dataset.skill;
    this.render();
  }

  static #onCancelLore() {
    cancelPendingLoreRequest();
  }

  static async #onRollSkill(event) {
    if (!this.#selectedSkill || this.#isRolling) return;

    this.#isRolling = true;
    try {
      const lore = getLoreSkills(this.#rollingActor).find(({ slug }) => slug === this.#selectedSkill);
      if (lore) {
        await this.#rollLore(lore, event);
        return;
      }

      const result = await executeRollSequence({
        combat: getEncounterFor(this.#targetActor),
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

  /**
   * A Lore roll asks the GM first (SPEC.md §6.8): an ease runs the usual
   * roll against that Lore DC; a decline or cancel records nothing, so the
   * player can pick another skill. Asking costs nothing, so a blocked
   * character can't ask either.
   */
  async #rollLore(lore, event) {
    const combat = getEncounterFor(this.#targetActor);
    if (isAttemptBlocked(combat, this.#rollingActor.uuid, this.#targetActor.uuid)) {
      ui.notifications.warn(game.i18n.localize("RKA.Warning.AlreadyAttempted"));
      return;
    }

    // The active GM rolling for a character is asked right here, in a popup
    // of its own, so there's nothing for this dialog to wait on.
    this.#waitingForGm = !game.users.activeGM?.isSelf;
    if (this.#waitingForGm) this.render();
    let decision;
    try {
      decision = await requestLoreDecision({
        rollingActor: this.#rollingActor,
        targetActor: this.#targetActor,
        targetToken: this.#targetToken.document,
        loreSlug: lore.slug,
        category: this.#selectedCategory,
      });
    } finally {
      this.#waitingForGm = false;
    }

    if (decision === LORE_EASE.EASY || decision === LORE_EASE.VERY_EASY) {
      const result = await executeRollSequence({
        combat: getEncounterFor(this.#targetActor),
        rollingActor: this.#rollingActor,
        targetActor: this.#targetActor,
        facts: this.#facts,
        dc: computeLoreDC(this.#targetActor, decision),
        selectedSkill: lore.slug,
        selectedCategory: this.#selectedCategory,
        event,
        loreEase: decision,
      });
      if (result.outcome === "completed") {
        this.close();
        return;
      }
    } else if (decision === "declined") {
      ui.notifications.info(game.i18n.format("RKA.Lore.Declined", { lore: lore.label }));
    } else if (decision === "unavailable") {
      ui.notifications.warn(game.i18n.localize("RKA.Lore.GmUnavailable"));
    }

    if (this.rendered) this.render();
  }
}
