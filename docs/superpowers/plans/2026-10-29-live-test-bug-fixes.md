# Live-Test Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eleven defects found by driving the module live in Foundry v14 / pf2e 8.5.0 (world "third-action-test", 2026-10-29).

**Architecture:** Player attempts are relayed to the active GM over a module socket so the Combat flag stays the single, GM-authoritative store (SPEC §6.6). A critical-failure lie is reshaped to be indistinguishable from a Success: the true baseline sentence plus one false fact in the chosen category, or "Nothing notable". The remaining fixes are local to fact extraction (`actor-data.js`), false-info generation, actor/target resolution, and the dialog context.

**Tech Stack:** Foundry VTT v14 (ApplicationV2, `game.socket`), pf2e system 8.5 (`CONFIG.PF2E.weaknessTypes`/`resistanceTypes`, IWR `label`/`typeLabel`), Vitest.

**Spec:** `SPEC.md` (this plan amends §6.3/§6.4 in Task 7).

## Global Constraints

- Module id `pf2e-recall-knowledge-assistant`; every user-facing string goes through `lang/en.json` under `RKA.*`.
- The DC is never shown to players; the target's real name never appears in the dialog (SPEC §6.2).
- Foundry v14 only (`module.json` compatibility min/verified/max `"14"`), pf2e `>= 8.1.2`.
- Throttle/identity state lives on the Combat flag `flags.pf2e-recall-knowledge-assistant.attempts`, keyed by `attemptKey(actorUuid, targetUuid)` (SPEC §6.6).
- Pure logic stays testable without Foundry: functions in `actor-data.js`, `reveal.js`, `data/*` take plain data; anything that reads `game`/`CONFIG`/`canvas` is isolated at the edges and stubbed with `vi.stubGlobal` in tests.

## Review Focus

1. **No GM connected when a player rolls**: the result still posts, and the player gets a warning that the attempt wasn't recorded instead of an error. Covered by a test in Task 1.
2. **Two relayed attempts land at the same moment** (two players roll together): both records must survive. Per-key flag writes are tested in Task 1.
3. **A forged socket message for an actor the sender doesn't own** must be ignored by the GM handler. Tested in Task 1.
4. **A player controlling a token they don't own, or an NPC token**, must fall back to their assigned character, never roll as that token. Tested in Task 3.
5. **Traits question when the creature's only trait is its identity trait**: a Success must say "Nothing notable", not repeat the baseline trait. Tested in Task 4.

---

### Task 1: Relay player attempts to the GM over a module socket

Fixes: players can't write Combat flags, so throttling, identity persistence, and lies never work for players.

**Files:**
- Modify: `module.json` (add `"socket": true`)
- Create: `scripts/socket.js`
- Modify: `scripts/repeat-attempts.js` (`recordAttempt` writes one key, not the whole map)
- Modify: `scripts/roll-sequence.js` (call `persistAttempt` instead of `recordAttempt`)
- Modify: `scripts/module.js` (call `registerSocket()` in `ready`)
- Modify: `lang/en.json` (add `RKA.Warning.NoGmToRecord`: `"No GM is connected, so this attempt couldn't be recorded for the encounter."`)
- Test: `tests/socket.test.js` (new), `tests/repeat-attempts.test.js`, `tests/roll-sequence.test.js`

**Interfaces:**
- Produces: `SOCKET_NAME = "module.pf2e-recall-knowledge-assistant"`;
  `persistAttempt(combat, actorUuid, targetUuid, degree, newRevealedKeys): Promise<"skipped"|"recorded"|"relayed"|"unrecorded">`;
  `registerSocket(): void`; `handleSocketMessage(message, senderId): Promise<void>` (exported for tests).
- Message shape: `{ type: "recordAttempt", combatId, actorUuid, targetUuid, degree, newRevealedKeys }`.

- [ ] **Step 1: Write failing tests**

`tests/repeat-attempts.test.js`: change `createFakeCombat` so `setFlag(scope, path, value)` writes nested dotted paths (`"attempts.<key>"`) and `getFlag(scope, "attempts")` returns the nested object. Add:
  - `it("recording one key leaves another character's existing record untouched")`: record for `Actor.a`, then `Actor.b`, and assert both `isIdentified`/`isAttemptBlocked` results are intact.

`tests/socket.test.js` (stub `game` with `user`, `users.activeGM`, `combats.get`, `socket.emit`/`on`, `ui.notifications.warn`, `fromUuidSync`):
  - `persistAttempt(null, …)` resolves `"skipped"` and touches nothing.
  - GM user (`combat.canUserModify(game.user, "update")` true) resolves `"recorded"` and the fake combat has the record.
  - Player with `game.users.activeGM` set resolves `"relayed"` and `game.socket.emit` was called with `SOCKET_NAME` and `{ type: "recordAttempt", combatId: "c1", actorUuid, targetUuid, degree, newRevealedKeys }`.
  - Player with `game.users.activeGM === null` resolves `"unrecorded"` and `ui.notifications.warn` was called with `"RKA.Warning.NoGmToRecord"`.
  - `handleSocketMessage` on the active GM, sender owns the actor (`fromUuidSync(actorUuid).testUserPermission(sender, "OWNER")` true): the record is written.
  - `handleSocketMessage` when the sender does NOT own the actor: nothing is written.
  - `handleSocketMessage` on a client that isn't `game.users.activeGM`: nothing is written.
  - `handleSocketMessage` with `degree` not in `DEGREES` or a non-string key in `newRevealedKeys`: nothing is written.

`tests/roll-sequence.test.js`: mock `../scripts/socket.js` and assert `persistAttempt` is called with `(combat, "Actor.pc1", "Actor.target1", degree, reveal.revealedKeys)` after the chat message renders.

- [ ] **Step 2: Run `npx vitest run tests/socket.test.js tests/repeat-attempts.test.js tests/roll-sequence.test.js`.** Expected: FAIL (`socket.js` missing; whole-map write clobbers the other key).

- [ ] **Step 3: Implement**
  - `recordAttempt`: read the existing record as before, then `combat.setFlag(MODULE_ID, \`${FLAG_KEY}.${key}\`, record)`. This writes one key, so concurrent relays can't overwrite each other.
  - `scripts/socket.js`: `persistAttempt` order is null combat → GM-capable → `activeGM` present → otherwise warn. `handleSocketMessage` returns early unless `game.users.activeGM?.isSelf`. It validates `type`, `degree ∈ Object.values(DEGREES)`, that keys are strings, and sender ownership. Then it calls `recordAttempt(game.combats.get(combatId), …)`. `registerSocket` calls `game.socket.on(SOCKET_NAME, handleSocketMessage)`.
  - `roll-sequence.js`: `await persistAttempt(...)` replaces `await recordAttempt(...)`.

- [ ] **Step 4: Run `npm test`.** Expected: all pass.

- [ ] **Step 5: Commit** `fix(repeat-attempts): relay player attempts to the GM over a module socket`

---

### Task 2: Only a started encounter counts as an encounter

Fixes: a combat that's only being viewed, or one that hasn't started yet, currently throttles rolls.

**Files:**
- Modify: `scripts/repeat-attempts.js` (add `getActiveEncounter`)
- Modify: `scripts/applications/recall-knowledge-dialog.js` (both `game.combat ?? null` call sites)
- Test: `tests/repeat-attempts.test.js`

**Interfaces:**
- Produces: `getActiveEncounter(): Combat|null`, which returns `game.combat` only when `game.combat?.started` is true.

- [ ] **Step 1: Failing tests.** Stub `game.combat` as `{ started: false }` → `null`; `{ started: true }` → that object; `undefined` → `null`.
- [ ] **Step 2: Run `npx vitest run tests/repeat-attempts.test.js`.** Expected: FAIL (not exported).
- [ ] **Step 3: Implement** and use it at both dialog call sites.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(repeat-attempts): only throttle inside a started encounter`

---

### Task 3: Roll as the controlled character, not always the assigned one

Fixes: a player who owns several PCs always rolls as `game.user.character`, even with another PC's token selected.

**Files:**
- Modify: `scripts/ui/scene-control.js`
- Test: `tests/scene-control.test.js`

**Interfaces:**
- Produces: `resolveRollingActor(): Actor|null`. It returns the actor of the first controlled token whose `actor.type === "character"` and `actor.isOwner`. Otherwise it returns `game.user.character`, otherwise `null`.

- [ ] **Step 1: Failing tests** (stub `canvas.tokens.controlled` and `game.user.character`):
  - controlled owned character token B while assigned character is A → B.
  - nothing controlled → A.
  - controlled NPC token (owned) → A.
  - controlled character token with `isOwner: false` → A.
  - nothing controlled and no assigned character → `null`, and `openRecallKnowledgeDialog` warns `RKA.Warning.NoRollingActor` (existing behavior kept).
- [ ] **Step 2: Run `npx vitest run tests/scene-control.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement** `resolveRollingActor` and use it in `openRecallKnowledgeDialog`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(scene-control): roll as the controlled character token when one is selected`

---

### Task 4: Pick a real identity trait and don't repeat it as the Traits fact

Fixes: "Zombie Shambler is a mindless." (the alphabetically first trait), and "Unicorn is a beast." followed by "beast".

**Files:**
- Modify: `scripts/actor-data.js` (add `pickIdentityTrait`, add an `excludedKeys` parameter to the pickers)
- Modify: `scripts/reveal.js`
- Test: `tests/actor-data.test.js`, `tests/reveal.test.js`

**Interfaces:**
- Produces: `pickIdentityTrait(traits: string[]): string`. Priority order:
  1. the first of the target's traits that is a key of `CREATURE_TRAIT_SKILLS`
  2. else `"haunt"` or `"trap"`, if present
  3. else `traits[0]`
  4. else `"creature"`
- Produces: `pickCategoryEntry(facts, category, rng, excludedKeys = new Set())` and `pickFactFromOtherCategory(facts, excludedCategories, rng, excludedKeys = new Set())`. Entries whose `makeFactKey(category, key)` is in `excludedKeys` are skipped.

- [ ] **Step 1: Failing tests**
  - `pickIdentityTrait(["mindless","undead","unholy","zombie"])` → `"undead"`; `(["leshy","plant"])` → `"plant"`; `(["mechanical","trap"])` → `"trap"`; `(["haunt"])` → `"haunt"`; `(["foo"])` → `"foo"`; `([])` → `"creature"`.
  - reveal: facts with traits `["mindless","undead"]`, Success → `baseline.trait === "undead"`.
  - reveal: traits `["beast"]` only, Traits category, Success → `facts: []` (template renders "Nothing notable").
  - reveal: traits `["beast","fey"]`, Traits category, Success, any rng → `facts` equals `["fey"]`.
- [ ] **Step 2: Run `npx vitest run tests/actor-data.test.js tests/reveal.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `resolveReveal`, compute `identityTrait = pickIdentityTrait(facts.traits)`. Use it for the baseline, and pass `new Set([makeFactKey(CATEGORIES.TRAITS, identityTrait)])` as `excludedKeys` to both pickers.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(reveal): name the creature type in the baseline and don't repeat it as a fact`

---

### Task 5: Show IWR exceptions in true reveals

Fixes: "Resistant to physical 15" drops "(except adamantine)", and the Ghost's "all damage 5" drops all of its exceptions.

**Files:**
- Modify: `scripts/actor-data.js`
- Test: `tests/actor-data.test.js`

**Interfaces:**
- Produces: every IWR entry from `getActorFacts` gains `fullLabel: string`. It is pf2e's `label` when present. Otherwise it is `` `${typeLabel ?? type} ${value}` `` for weaknesses/resistances and `typeLabel ?? type` for immunities. `label` stays the bare type name and is still used by false-info.
- `listCategoryEntries` text becomes `Weak to ${fullLabel}` / `Resistant to ${fullLabel}` / `Immune to ${fullLabel}`. There is no separate value suffix; pf2e's `label` already contains the value.

- [ ] **Step 1: Failing tests.** pf2e-shaped resistance `{ type:"physical", value:15, typeLabel:"physical", label:"physical 15 (except adamantine)" }` → text `"Resistant to physical 15 (except adamantine)"`. Weakness without `label` → `"Weak to silver 5"`. Immunity `{ type:"magic", typeLabel:"magic", label:"magic (except wisp vulnerabilities)" }` → `"Immune to magic (except wisp vulnerabilities)"`. Update the existing commit-64dd19b regression test so it asserts that no value appears twice.
- [ ] **Step 2: Run `npx vitest run tests/actor-data.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass. (Reveal tests that build facts by hand need `fullLabel` added to their fixtures.)
- [ ] **Step 5: Commit** `fix(actor-data): keep IWR exceptions in reveal text`

---

### Task 6: Only invert into types pf2e allows

Fixes: lies like "Weak to unconscious 5", "Weak to doomed 5" and "Weak to object immunities 5".

**Files:**
- Modify: `scripts/actor-data.js` (`getActorFacts` reads `CONFIG.PF2E`)
- Modify: `scripts/data/false-info.js`
- Test: `tests/actor-data.test.js`, `tests/false-info.test.js`

**Interfaces:**
- Produces: resistance and immunity entries gain `invertible: boolean`, which is `type in CONFIG.PF2E.weaknessTypes`. Weakness entries gain `invertible: boolean`, which is `type in CONFIG.PF2E.resistanceTypes`. When `CONFIG.PF2E` is absent, read it as `{}` (nothing invertible).
- `listCategoryEntries` passes `invertible` through. `invertToFalseWeakness`/`invertToFalseResistance` keep only entries with `invertible === true`.

- [ ] **Step 1: Failing tests.**
  - actor-data: stub `CONFIG.PF2E.weaknessTypes = { fire:"", poison:"" }`. Immunities `fire`, `unconscious` → `invertible` is `true` and `false` respectively.
  - false-info: immunities `[{type:"unconscious", invertible:false}, {type:"poison", invertible:true}]` → over 25 rng values the text is always `"Weak to poison 5"`. With only non-invertible entries → `null`.
  - Add `invertible: true` to the existing `richFacts` fixtures.
- [ ] **Step 2: Run `npx vitest run tests/actor-data.test.js tests/false-info.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(false-info): only invert into weakness/resistance types pf2e recognizes`

---

### Task 7: Make a critical-failure lie indistinguishable from a Success

Fixes: lies have no baseline sentence and can answer a different category than the one asked.

**Files:**
- Modify: `scripts/data/false-info.js` (`generateFalseInfo` stops falling back across categories)
- Modify: `scripts/reveal.js` (identified critical failure returns the baseline)
- Modify: `SPEC.md` §6.3 table (Critical Failure row) and §6.4 (remove the cross-category and false-trait fallbacks)
- Test: `tests/false-info.test.js`, `tests/reveal.test.js`

**Interfaces:**
- Produces: `generateFalseInfo(facts, category, revealedKeys, rng)`. It returns a lie for that category only, or `null`. Its signature is unchanged.
- `resolveReveal` for an identified critical failure returns `{ baseline: { name, trait: pickIdentityTrait(traits) }, facts: lie ? [lie.text] : [], revealedKeys: [] }`. The unidentified critical failure is unchanged (no baseline, no facts).

- [ ] **Step 1: Failing tests.** Replace the "baseline is null" assertion in the existing identified-critical-failure test.
  - Identified critical failure → `baseline` equals the Success baseline for the same facts.
  - Weaknesses category on facts with no invertible resistances/immunities → `facts: []` with baseline present.
  - `generateFalseInfo(facts, WEAKNESSES, …)` → never a trait or a resistance, over 25 rng values.
  - Delete the false-info tests asserting the cross-category fallback and the empty-data false-trait fallback.
- [ ] **Step 2: Run `npx vitest run tests/false-info.test.js tests/reveal.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement**, and update `SPEC.md`.
  - §6.3 Critical Failure (identified): "same baseline sentence as a Success, plus one false fact in the chosen category; if no safe false fact exists there, 'Nothing notable in that regard'".
  - §6.4: replace the "fall back through the other categories" sentence and the "Empty-data fallback" bullet with that rule.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(reveal): make a critical-failure lie read exactly like a success`

---

### Task 8: Make hazards usable and stop calling them creatures

Fixes:
- Hazards get no skills, so Roll is permanently disabled.
- The header says "Unknown Creature" for a trap.
- The header shows the actor portrait.

**Files:**
- Modify: `scripts/data/trait-skill-map.js` (add `HAZARD_TRAIT_SKILLS`)
- Modify: `scripts/actor-data.js` (`getRelevantSkills` uses it for hazards; facts gain `kind`)
- Modify: `scripts/data/false-info.js` (`pickFalseTrait` draws hazard lies from the hazard pool)
- Modify: `scripts/applications/recall-knowledge-dialog.js`, `templates/dialog.hbs`, `lang/en.json`
- Modify: `scripts/targeting.js` (add `getUnknownTargetLabelKey`)
- Test: `tests/actor-data.test.js`, `tests/false-info.test.js`, `tests/targeting.test.js`

**Interfaces:**
- Produces: `HAZARD_TRAIT_SKILLS`:
  ```js
  { mechanical: ["crafting"], magical: ["arcana", "nature", "occultism", "religion"],
    haunt: ["occultism", "religion"], environmental: ["nature"],
    arcane: ["arcana"], divine: ["religion"], occult: ["occultism"], primal: ["nature"] }
  ```
  Grounded in AoN (checked 2026-10-29). There is no hazard identification table, so each entry is derived:
  - **mechanical → Crafting:** Crafting's Recall Knowledge covers "engineering… alchemical or mechanical creatures" ([Skills ID=37](https://2e.aonprd.com/Skills.aspx?ID=37)). Purely magical traps have no physical component ([Rules ID=1045](https://2e.aonprd.com/Rules.aspx?ID=1045)), so plain `trap` maps to nothing.
  - **magical:** learned "using Identify Magic or Recall Knowledge" ([Rules ID=2847](https://2e.aonprd.com/Rules.aspx?ID=2847)). Use the tradition skill when a tradition trait is present, otherwise all four.
  - **haunt → Occultism/Religion:** "haunts can often be overcome with Occultism or Religion" ([Rules ID=668](https://2e.aonprd.com/Rules.aspx?ID=668)).
  - **environmental → Nature only:** Survival disables environmental hazards but isn't a Recall Knowledge skill.
- Produces: `getActorFacts(actor).kind === actor.type`.
- Produces: `getUnknownTargetLabelKey(actor): "RKA.UnknownHazard" | "RKA.UnknownTarget"`.
- New i18n keys:
  - `RKA.UnknownHazard`: `"Unknown Hazard"`
  - `RKA.Dialog.NoSkills`: `"None of your skills seem relevant to this."`
- Dialog context: `targetImg` comes from `targetToken.document.texture.src`, which is what the player already sees on the canvas. A `noSkills` flag drives a `<p class="rka-no-skills">` in the template in place of the empty skill list.

- [ ] **Step 1: Failing tests.**
  - `getRelevantSkills({ type:"hazard" }, { traits:["mechanical","trap"] })` → `["crafting"]`; `(["magical","trap","divine"])` → `["religion"]` (a tradition trait overrides the generic `magical` entry); `(["magical","trap"])` → `["arcana","nature","occultism","religion"]`; `(["trap"])` → `[]`; `(["environmental"])` → `["nature"]`.
  - `(["haunt"])` → `["occultism","religion"]`.
  - `pickFalseTrait({ kind:"hazard", traits:["trap","mechanical"] })` → always a key of `HAZARD_TRAIT_SKILLS`, never `"trap"` or `"mechanical"`.
  - `getUnknownTargetLabelKey({ type:"hazard" })` → `"RKA.UnknownHazard"`; for an `npc` → `"RKA.UnknownTarget"`.
- [ ] **Step 2: Run `npx vitest run tests/actor-data.test.js tests/false-info.test.js tests/targeting.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement**, including the dialog/template/lang changes. The chat header for unidentified hazards uses the same key via `getUnknownTargetLabelKey` in `render-result.js`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(hazards): give hazards relevant skills and a hazard-appropriate header`

---

### Task 9: Cancelling pf2e's roll dialog is not an error

Fixes: closing pf2e's Check Modifiers dialog shows a red "roll couldn't be completed" toast.

**Files:**
- Modify: `scripts/roll-sequence.js`
- Test: `tests/roll-sequence.test.js`

**Interfaces:**
- When `rollRecallKnowledge` resolves `null`, `executeRollSequence` returns `{ outcome: "cancelled" }`. It logs with `console.debug`, shows no toast, renders nothing, and records nothing. A thrown error still returns `"error"` with the toast.

- [ ] **Step 1: Failing test.** Replace the F6 "no-roll" test: a `null` roll → `{ outcome: "cancelled" }`, `ui.notifications.error` not called, `persistAttempt` not called.
- [ ] **Step 2: Run `npx vitest run tests/roll-sequence.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(roll-sequence): treat a cancelled pf2e roll dialog as a cancel, not an error`

---

### Task 10: Verify live in Foundry

**Files:** none (the scratchpad driver from the test session).

- [ ] **Step 1:** `npm test`. Expected: all pass.
- [ ] **Step 2:** Return to Setup and relaunch "third-action-test". `module.json`'s new `"socket": true` is only read at world launch. Ask the user before doing this, because it disconnects their open client.
- [ ] **Step 3:** Using the GM and "RKA Player" sessions on "RKA Test Scene", with a fresh *started* encounter viewed on both clients:
  - Player rolls a failure on the Werewolf. Expected: no error toast; the GM's combat flag has the record; reopening the dialog shows the blocked message.
  - Player identifies the Zombie, then rolls a critical failure on Weaknesses. Expected: the header shows the name, the baseline reads "Zombie Shambler is an undead.", and the fact is "Weak to …" or "Nothing notable".
  - Player selects the Bard token and rolls. Expected: the speaker is "RKA Test Bard".
  - Hidden Pit dialog. Expected: header "Unknown Hazard", Crafting is listed, and Roll works.
  - Iron Golem Resistances Success, rolled until the physical entry appears. Expected: it includes "(except adamantine)".
  - Cancel pf2e's dialog. Expected: no toast.
  - The GM-only message stays "???" for the player.
- [ ] **Step 4:** Confirm the sender id arrives as the socket handler's second argument. If it doesn't in v14, put `userId` in the payload and check it against the actor's ownership. Patch, then rerun Task 1's tests.
