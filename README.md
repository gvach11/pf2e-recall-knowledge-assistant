# PF2e Recall Knowledge Assistant

A [Foundry VTT](https://foundryvtt.com) module for the [Pathfinder Second Edition](https://foundryvtt.com/packages/pf2e) system.

Recall Knowledge in one click: target an enemy, pick what you're trying to remember, roll, and get a result scoped to what your character actually learned. The DC is never shown to players.

> **Preliminary release.** Version 0.x is feature-complete for its scope but still being play-tested. Please report anything odd on the [issue tracker](https://github.com/gvach11/pf2e-recall-knowledge-assistant/issues).

---

## Features

- **Guided dialog**: choose a category (Weaknesses, Resistances / Immunities, or Traits) and one of your relevant skills
- **Hidden DC**: each skill shows a rough confidence (Confident / Uncertain / Unfamiliar) instead of a number
- **Scoped reveals** by degree of success:
  - **Critical Success**: the creature's identity plus two facts
  - **Success**: the creature's identity plus one fact in the chosen category (or "nothing notable in that regard")
  - **Failure**: nothing certain
  - **Critical Failure**: once you've identified the creature, a believable false fact that never contradicts what you already know; before that, the same as a Failure
- **Identity stays hidden** until earned: the dialog and failed results say "Unknown Creature" / "Unknown Hazard"
- **Repeat attempts**: in a started encounter, a Failure or Critical Failure blocks that character from trying again on that target until the encounter ends. Tracked per character, not per player
- **Hazards supported**, with hazard-appropriate skills
- **GM-only detail message** showing the real target name, DC, roll total, and degree

---

## Installation

Paste the manifest URL into Foundry's *Install Module* dialog:
```
https://github.com/gvach11/pf2e-recall-knowledge-assistant/releases/latest/download/module.json
```

---

## Usage

1. Enable the module in your world's module settings.
2. Target exactly one creature or hazard with Foundry's **Target** tool.
3. Click the **brain** button in the Token controls (or run the *Recall Knowledge* macro the module creates for players).
4. Pick what you're trying to recall and which skill to use, then click **Roll**.
5. The result appears in chat. The GM gets a separate message with the full details.

If you control one of your characters' tokens, that character rolls; otherwise your assigned character does.

The module has no settings. A GM controls what can be revealed through the NPC's own Weakness, Resistance, Immunity and Trait fields.

---

## Works with Third Action Suggester

With [PF2E Third Action Suggester](https://github.com/gvach11/pf2e-third-action-suggester) 1.1.0 or later, its Recall Knowledge suggestion opens this module's dialog on a character's turn, and only appears while a nearby enemy is still worth an attempt.

---

## For module authors and macros

Once the world is ready, the module publishes an API at `game.modules.get("pf2e-recall-knowledge-assistant").api`:

| Member | What it does |
|---|---|
| `apiVersion` | `1`. Check `api.apiVersion >= 1` before using the members below. |
| `openDialog({ actor, targetToken } = {})` | Opens the dialog. With no arguments it uses the user's single current target and their controlled or assigned character. `actor` must be a character the user owns; `targetToken` must be an NPC or hazard token. |
| `getAttemptStatus({ actor, targetToken })` | Read-only. `"available"`, `"blocked"` (failed against it this encounter), `"exhausted"` (nothing left to learn), or `"invalid"` (not a character rolling against an NPC or hazard). |

---

## Compatibility

Requires **Foundry VTT v14** and the **PF2e system 8.1.2** or later.

---

## Credits

Created by **Vachna**.

This module was designed and built with the assistance of [Claude](https://claude.ai) (Anthropic). All game rules and PF2e mechanics were verified by a human against official sources.

---

## License

This module is licensed under the [MIT License](LICENSE).
