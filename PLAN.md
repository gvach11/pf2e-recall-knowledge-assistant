# Recall Knowledge Assistant — Implementation Plan

## Context

`SPEC.md` (already drafted and pushback-reviewed) fully specifies a FoundryVTT
module for the PF2e system that streamlines the Recall Knowledge action:
target an NPC/hazard, pick an info category, roll, and get a scoped reveal —
with the DC always hidden, false info on critical failure, and per-encounter
repeat-attempt throttling. This is a greenfield project (empty directory
except SPEC.md); there is no existing code to build on. This plan turns that
spec into a concrete, buildable module targeting **Foundry VTT v14** + the
current pf2e system release.

Research (via a design agent) confirmed the exact pf2e/Foundry APIs needed,
most importantly: how to invoke pf2e's own built-in `recall-knowledge` action
to get correctly-computed rolls **without** letting it post its default
chat card (which would leak the DC) — this was the single riskiest unknown
in the spec and is now fully resolved with a concrete API call.

## Key Technical Decisions

- **Language/tooling**: Plain JavaScript, **no build step** — matches the
  convention of most small/solo Foundry modules. `module.json`'s
  `esmodules` points straight at `scripts/module.js`, which uses native ES
  `import`/`export` to pull in the other `scripts/**/*.js` files directly
  (browsers and Foundry both support this without bundling). Editing a file
  and reloading the browser tab is the entire dev loop — no compiler, no
  watch process.
- **Dialog framework**: `ApplicationV2` + `HandlebarsApplicationMixin` (not
  `DialogV2` — our dialog re-renders on category selection, which `DialogV2`
  isn't built for).
- **Trigger**: a token-layer scene-control tool button (`getSceneControlButtons`
  hook, added to the existing `tokens` control group) that acts on
  `game.user.targets`. This matches the spec's "Target tool + persistent UI
  button" decision and needs no permission workarounds. A hotbar macro
  helper is added as a secondary convenience, not the primary trigger.
- **DC/outcome computation**: computed entirely on our side, never handed to
  pf2e's action. For NPCs we read pf2e's own live `actor.identificationDCs`
  (self-updating with system patches); for Hazards (which lack that getter)
  we compute it ourselves from a local copy of pf2e's level-DC table +
  rarity adjustment (values already verified identical to SPEC.md §2).
- **Avoiding the DC leak**: call
  `game.pf2e.actions.get("recall-knowledge").use({ statistic, actors: rollingActor, target: targetActor, message: { create: false }, event })`.
  `message: { create: false }` suppresses pf2e's own chat card entirely. We
  read back `roll.total` and the natural d20 from the returned
  `CheckResultCallback[]`, then compute degree-of-success ourselves
  (replicating the nat-20-up/nat-1-down step rule) against our hidden DC,
  and render our own chat message.
- **Repeat-attempt throttle policy**: within a single combat encounter, a
  player is blocked from further Recall Knowledge attempts against the same
  target **after any failure or critical failure** (successes can still be
  repeated to fish other categories). Stored as a flag on the `Combat`
  document, keyed by `(userId, targetActorUuid)` — deleting/ending the
  combat deletes the flags automatically, so no explicit cleanup code is
  needed.
- **Unit tests**: set up `vitest` now for the pure-logic modules (DC/degree
  calculation, likelihood bucketing, false-info inversion) since they take
  plain data in/out with zero Foundry runtime dependency — these are also
  the highest-risk-of-subtle-bug areas (boundary math, nat 20/1 stepping,
  never asserting a true fact as false). This needs a minimal `package.json`
  (devDependency on `vitest` + a `test` script) even though the module
  itself has no build step — the `package.json` is purely a test-tooling
  concern, not part of what Foundry loads.

## File Layout

```
recall-knowledge-assistant/
├── module.json
├── package.json                          # vitest devDependency + "test" script only
├── scripts/
│   ├── module.js                         # entry point (module.json's esmodules), init/ready hooks
│   ├── constants.js                      # module id, flag scope
│   ├── data/
│   │   ├── dc-table.js                   # computeHiddenDC, computeDegreeOfSuccess, computeLikelihood
│   │   ├── trait-skill-map.js            # CREATURE_TRAIT_SKILLS (mirrors pf2e's identifySkills)
│   │   └── false-info.js                 # invertIWRFact, pickFalseTrait, generateFalseInfo
│   ├── actor-data.js                     # listCategoryEntries/pickCategoryEntry, getRelevantSkills(actor)
│   ├── targeting.js                      # getValidatedSingleTarget() — npc/hazard-only, size===1
│   ├── roll.js                           # rollRecallKnowledge() wrapping the pf2e action call
│   ├── repeat-attempts.js                # Combat flag: throttle + identified + revealedFacts state
│   ├── reveal.js                         # resolveReveal() — pure outcome-resolution logic (extracted
│   │                                      # from the dialog so it's unit-testable without Foundry)
│   ├── applications/recall-knowledge-dialog.js  # ApplicationV2 dialog
│   ├── chat/render-result.js             # builds + creates our own chat message(s)
│   └── ui/scene-control.js               # getSceneControlButtons hook
├── templates/{dialog.hbs, chat-result.hbs}
├── lang/en.json
├── styles/recall-knowledge-assistant.css
└── tests/                                # vitest specs for scripts/data/*
```

All cross-file wiring uses plain ES module `import`/`export` (e.g.
`scripts/module.js` does `import { registerSceneControl } from "./ui/scene-control.js";`)
— no bundler resolves these, Foundry/the browser load them natively at runtime.

`module.json`: id `recall-knowledge-assistant`, `compatibility.minimum/verified/maximum: "14"`,
`relationships.systems: [{ id: "pf2e", type: "system" }]`, `esmodules: ["scripts/module.js"]`,
`styles`, `languages`.

## Core Logic (scripts/data/dc-table.js, the highest-risk module)

- `LEVEL_DC_TABLE` + `RARITY_ADJUSTMENT`: literal copies of SPEC.md §2's
  table (already verified value-for-value against pf2e's own `dc.ts`).
- `computeHiddenDC(actor)`: NPC → `actor.identificationDCs.standard.dc`;
  Hazard → `LEVEL_DC_TABLE[actor.level] + RARITY_ADJUSTMENT[actor.system.traits.rarity]`.
- `computeDegreeOfSuccess(rollTotal, dc, naturalD20)`: standard PF2e
  stepping (±10 for crit) then nat-20-up/nat-1-down adjustment, clamped at
  the extremes.
- `computeLikelihood(modifier, dc, isTrained)`: untrained → always
  `"unfamiliar"`; else bucket by an **expected roll total**
  (`modifier + 10`, approximating an average d20 roll) vs. `dc` — comparing
  modifier directly to `dc` would make "confident" nearly unreachable,
  since the DC must be beaten by roll + modifier, not modifier alone.
  `expectedTotal >= dc` → confident; `dc-9..dc-1` → uncertain; `<= dc-10` →
  unfamiliar. Only ever produces these three labels — never a number, per
  §6.2. (Found and fixed post-implementation: the original modifier-vs-DC
  comparison showed a legendary +9 modifier against a DC 13 as "Unfamiliar"
  instead of "Confident".)

## Roll + Outcome Flow

1. Scene-control button → `getValidatedSingleTarget()` (warns on 0/2+
   targets or non-npc/hazard actor type).
2. `RecallKnowledgeDialog` opens; `_prepareContext` lists relevant skills
   (via `identificationDCs.skills` for NPCs, trait-map fallback for
   hazards) with likelihood labels only, plus the 3-category selector.
3. Roll → repeat-attempt throttle check (`repeat-attempts.js`) → if
   blocked, inline message, stop.
4. `rollRecallKnowledge()` calls the suppressed pf2e action, returns raw
   roll total + natural d20.
5. `computeHiddenDC` + `computeDegreeOfSuccess` → degree.
6. Dispatch per §6.3: critical success = baseline + 2 facts (random
   fallback category if chosen is empty, +1 more from a random other
   category); success = baseline + 1 fact or explicit "nothing notable" for
   an empty category; failure = nothing; critical failure = 1 false fact
   via `generateFalseInfo`.
7. `renderResultChatMessage()` creates our own player-facing `ChatMessage`
   (no DC anywhere) plus a GM-only companion message showing the true
   roll/DC/degree.
8. `recordAttempt()` writes the Combat flag; dialog closes.

## Verification

- **Automated**: `vitest` specs for `scripts/data/*` — DC table lookups
  (including hazard-path formula), degree-of-success boundaries (DC, DC±10,
  nat-20 upgrade with crit-success ceiling, nat-1 downgrade with
  crit-failure floor), likelihood bucketing (untrained always unfamiliar;
  boundaries at 0/-1/-5/-6), and false-info generation (property-style
  check across fixture actors that it never returns a fact the actor
  actually has). Run via `npm test`.
- **Manual, in a live Foundry v14 + pf2e world** (no way around this for
  the Foundry-API-coupled surface):
  1. Targeting: 0 targets, 2+ targets, a PC target → all warn and don't
     open the dialog; a lone NPC or Hazard target → dialog opens.
  2. Inspect the dialog's rendered HTML for every skill row across varied
     PC modifiers vs. varied target levels — confirm no numeric DC ever
     appears, and untrained skills always show "Unfamiliar."
  3. Inspect the chat log HTML after each roll — confirm exactly our
     message(s) appear (no pf2e default card), and no DC substring is
     present anywhere in the player-visible message.
  4. Force each degree of success against a known-stat test NPC and verify
     the outcome table behavior from §6.3, including the critical-success
     bonus-category randomization and empty-category fallback wording.
  5. Trigger several critical failures against a target with known
     IWR/traits — confirm the false fact is always a real inversion, never
     invented nonsense, and never a fact the target actually has.
  6. Start combat, fail a Recall Knowledge roll against a target, confirm
     further attempts against that same target are blocked with a clear
     message; end combat and start a new one, confirm the block is gone.
  7. Confirm the GM sees the true roll/DC/degree via the companion message
     regardless of what the player sees.

## Post-Approval Notes

- User pushed back on the initial TypeScript/esbuild recommendation, citing
  that other Foundry modules they'd seen use plain JS with a direct
  `module/main.js`-style entry point — the plan was revised to plain
  JavaScript with no build step before approval (see "Language/tooling"
  above).
- Implementation is complete as of this writing: all files in the File
  Layout above exist under the project root, and all `vitest` specs pass.
  Manual in-Foundry verification (the checklist above) is still outstanding.
- **Post-launch fixes found during manual testing:**
  - `computeLikelihood` originally compared modifier directly to DC, making
    "Confident" nearly unreachable; fixed to compare an expected roll total
    (modifier + ~10) against the DC instead.
  - The target's real name was being shown in the dialog header and chat
    header unconditionally, even before any roll — fixed to use a generic
    "Unknown Creature" placeholder until Success/Critical Success earns the
    reveal (see SPEC.md §6.2).
  - Repeat-attempt throttling was originally keyed by Foundry user/login
    instead of the acting character, so one PC's failure could block a
    different party member controlled from the same login — fixed to key
    by the rolling actor's UUID.
  - The module had no memory of which true facts a character already
    learned about a target across multiple attempts in the same encounter,
    causing two bugs: (1) a later Critical Failure made an already-known
    identity look unknown again, and (2) false info could contradict a
    fact already truthfully revealed earlier. Fixed by extending the
    per-(character, target) Combat-flag record (`repeat-attempts.js`) to
    also track `identified` and `revealedFacts`, threading that state
    through `reveal.js` (extracted from the dialog to be unit-testable)
    and `render-result.js`. All four fixes are covered by regression tests.
