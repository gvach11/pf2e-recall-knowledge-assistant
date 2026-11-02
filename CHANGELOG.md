# Changelog

All notable changes to **PF2e Recall Knowledge Assistant** are documented here.

---

## [1.0.0] — 2026-11-02

First stable release.

### Public API
- `game.modules.get("pf2e-recall-knowledge-assistant").api` now has `apiVersion` (1) and `getAttemptStatus({ actor, targetToken })`
- `openDialog({ actor, targetToken })` can name the rolling character and the target (a Token or TokenDocument); with no arguments it behaves as before

### Integrations
- Works with PF2E Third Action Suggester 1.1.0: its Recall Knowledge suggestion opens this dialog and hides when there's nothing left to learn

---

## [0.1.0] — 2026-11-02

Initial preliminary release.

### Dialog
- Opens from a Token-controls button or a *Recall Knowledge* macro, for exactly one targeted NPC or hazard
- Category choice: Weaknesses, Resistances / Immunities, Traits
- Relevant skills only, each with a confidence label instead of the DC
- Rolls as the controlled character token you own, or your assigned character

### Reveals
- Degree-scoped results: identity plus two facts, identity plus one fact, nothing, or a lie
- Identity is never shown before it's earned ("Unknown Creature" / "Unknown Hazard")
- Weakness, resistance and immunity text keeps pf2e's exceptions (e.g. "except adamantine")
- Critical-failure lies read exactly like a Success, only use types pf2e recognizes, and never contradict anything the character already learned

### Repeat attempts
- In a started encounter, a Failure or Critical Failure blocks further attempts by that character on that target until the encounter ends
- Identity and learned facts are remembered per character for the encounter
- Player attempts are recorded through the GM over a module socket; players get a warning if no GM is connected

### GM visibility
- A GM-only chat message with the real target name, DC, roll total and degree
- The player's chat card never carries the degree

### Compatibility
- Requires Foundry VTT v14 and the PF2e system 8.1.2 or later
