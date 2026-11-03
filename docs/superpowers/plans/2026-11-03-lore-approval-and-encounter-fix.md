# GM-Approved Lore + Encounter Lookup Fix (RKA 1.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship RKA 1.1.0: players can roll any Lore after the GM allows it at an easy or very easy DC, and attempts are tracked on the encounter the target is actually in.

**Architecture:** Lore DCs and the character's Lore list are pure helpers next to the existing DC and actor-data code. A new `lore-approval.js` owns the request/reply/cancel round trip over the existing module socket; the GM's popup is a thin DialogV2 wrapper so the round trip stays unit-testable. The dialog only gains a waiting state and hands an approved DC to the unchanged `executeRollSequence`. The encounter fix replaces `getActiveEncounter()` with a target-based lookup.

**Tech Stack:** Foundry VTT v14 (ApplicationV2, DialogV2), pf2e ≥ 8.1.2, Vitest 3, GitHub CLI (`gh`).

**Spec:** `SPEC.md` §6.8 (Lore), §6.6 "Which encounter" (bug fix), plus the §2/§4/§5/§6.2/§6.5 cross-references.

## Global Constraints

- Branch: `release/v1.1.0` (already created from `master`; the spec commit is on it).
- Foundry v14 only, pf2e ≥ 8.1.2. `apiVersion` stays `1`; `getAttemptStatus` and `openDialog` signatures don't change.
- The DC never reaches the player's UI or chat card; the player is never told which ease the GM chose.
- All new user-facing strings go through `lang/en.json` under `RKA.*`.
- Code comments cite spec sections as `SPEC.md §6.x`; don't renumber spec sections.
- Pushing, merging into `master`, tagging, creating the GitHub release, and changing the Foundry install (junction swap, relaunching the world) each need the user's explicit go-ahead at that moment.
- `npm test` must pass at the end of every task (184 passing before Task 2).

## Review Focus

1. **Player closes the dialog (window X) while waiting** → the GM's popup closes, no reply is applied later, nothing recorded. Test: Task 4 `cancelPendingLoreRequest` + `handleLoreCancel`; Task 5 dialog `_onClose` calls cancel.
2. **GM reloads or disconnects mid-request** → the player's wait ends with "GM no longer available", not a forever-spinner. Test: Task 4 `onUserConnectionChange`.
3. **A reply from someone other than the active GM, for another user, or for an old request id** → ignored. Test: Task 4, three reply-rejection cases.
4. **An old started encounter that doesn't contain the target** (the reported bug), and **a roll outside any combat** while one exists → "available", nothing recorded. Test: Task 2 `getEncounterFor` and the updated `attempt-status` test.
5. **Double-clicking Roll on a Lore** → exactly one request. Test: Task 4 "a second request replaces the first" (the old one resolves `cancelled` and its cancel is emitted); Task 5 keeps the existing `#isRolling` guard around the whole Lore path.

---

### Task 1: Confirm pf2e rolls a Lore through its Recall Knowledge action

The spec's one unverified assumption. If it fails, stop and bring it to the user before Task 3.

**Files:** none (live check only; the module doesn't need to be loaded).

- [x] **Step 1:** Start the live-test driver (memory: `reference_live_test_driver`). Log in as a user who owns a character with at least one Lore. If the world isn't running, ask the user to launch it.
- [x] **Step 2:** In the browser, evaluate:

```js
const actor = game.user.character ?? game.actors.find((a) => a.type === "character" && a.isOwner);
const lore = Object.values(actor.skills).find((s) => s.lore);
const res = await game.pf2e.actions.get("recall-knowledge").use({ statistic: lore.slug, actors: actor, message: { create: false } });
({ slug: lore.slug, total: res?.[0]?.roll?.total, label: res?.[0]?.roll?.options?.title ?? null });
```

Expected: a numeric `total`, rolled with the Lore's modifier (compare with `lore.mod`). If pf2e's Check Modifiers dialog opens, click Roll in it. Record the result as a note under this task.

---

### Task 2: Track attempts on the encounter the target is in

**Files:**
- Modify: `scripts/repeat-attempts.js` (replace `getActiveEncounter`)
- Modify: `scripts/applications/recall-knowledge-dialog.js:51,105`, `scripts/attempt-status.js:4,22`
- Modify: `tests/helpers/fake-combat.js`, `tests/repeat-attempts.test.js:146-166`, `tests/attempt-status.test.js`
- (The spec is already updated; the README wording is Task 6.)

**Interfaces:**
- Produces: `getEncounterFor(targetActor) -> Combat | null` in `scripts/repeat-attempts.js`. `getActiveEncounter` is removed.
- Produces: `createFakeCombat({ id, isGM, started = true, actorUuids = [] })` — adds `started` and `combatants: actorUuids.map((uuid) => ({ actor: { uuid } }))`.

- [x] **Step 1: Write the failing tests** in `tests/repeat-attempts.test.js`, replacing the `getActiveEncounter` block. Stub `game` as `{ combat, combats: [...] }` (a plain array stands in for Foundry's collection; only `.filter` is used).

```js
describe("getEncounterFor", () => {
  const skeleton = { uuid: "Scene.s1.Token.t1.Actor.skel" };
  it("is null without a target actor", ...)                 // getEncounterFor(null) === null
  it("ignores a combat that hasn't started", ...)          // started:false, contains skeleton → null
  it("ignores a started combat the target isn't in", ...)  // old encounter, other cast, shown in tracker → null
  it("finds the started combat the target is in", ...)     // tracker shows the old one; returns the one with skeleton
  it("prefers the tracker's combat when several contain the target", ...) // both contain it; game.combat === second → second
  it("otherwise takes the first combat that contains the target", ...)    // game.combat is a third, unrelated one → first
});
```

- [x] **Step 2:** Update `tests/attempt-status.test.js`: the started combat contains the ghoul (`actorUuids: [targetToken.actor.uuid]`) and is in `game.combats`. Replace "available outside a started encounter" with two cases: the combat is unstarted → `"available"`; and **the reported bug** — a failure recorded on a started combat that doesn't contain the ghoul, shown as `game.combat` → `"available"`.
- [x] **Step 3:** `npm test` → the new cases fail (`getEncounterFor` is not exported).
- [x] **Step 4: Implement `getEncounterFor(targetActor)`**: started combats from `game.combats` whose combatants include one with `actor?.uuid === targetActor.uuid`; return `game.combat` if it's among them, else the first, else `null`. Rewrite the doc comment to cite SPEC.md §6.6 "Which encounter" and say why the tracker's combat isn't trusted. Switch the dialog (both calls, with `this.#targetActor`) and `getAttemptStatus` (with `targetActor`) to it. `createFakeCombat` gains the two options.
- [x] **Step 5:** `npm test` → all pass.
- [x] **Step 6: Commit** `fix(attempts): track attempts on the encounter the target is in`.

---

### Task 3: Lore DCs and the character's Lore list

**Files:**
- Modify: `scripts/constants.js`, `scripts/data/dc-table.js`, `scripts/actor-data.js`
- Test: `tests/dc-table.test.js`, `tests/actor-data.test.js`

**Interfaces:**
- Produces: `LORE_EASE = Object.freeze({ EASY: "easy", VERY_EASY: "very-easy" })` in `constants.js` (values match pf2e's DC-adjustment names).
- Produces: `computeLoreDC(actor, ease) -> number` in `dc-table.js`.
- Produces: `getLoreSkills(actor) -> Array<{ slug: string, label: string }>` in `actor-data.js` — every statistic in `actor.skills` with `lore === true`, in pf2e's order.

- [x] **Step 1: Write the failing tests.**

`dc-table.test.js`, `describe("computeLoreDC")`:
- NPC with `identificationDCs.lore: [{ dc: 11 }, { dc: 8 }]` → `easy` 11, `very-easy` 8.
- Level-1 hazards (level DC 15): common → 13 / 10; rare → 17 / 15; unique → 20 / 17. (Rare easy is +2, not +5−2: SPEC.md §6.8.)
- NPC without `identificationDCs` falls back to the hazard rule (common level 1 → 13).

`actor-data.test.js`, `describe("getLoreSkills")`:
- `skills: { arcana: { slug: "arcana", label: "Arcana" }, "undead-lore": { slug: "undead-lore", label: "Undead Lore", lore: true, rank: 0 } }` → `[{ slug: "undead-lore", label: "Undead Lore" }]` (rank 0 still listed).
- No `skills` → `[]`.

- [x] **Step 2:** `npm test` → new cases fail.
- [x] **Step 3: Implement.** `computeLoreDC`: NPC with `identificationDCs.lore` → `[0].dc` for easy, `[1].dc` for very easy. Otherwise mirror pf2e's `combineDCAdjustments`:

```js
// pf2e's DC-adjustment scale, easiest first; "normal" sits at index 3.
const DC_ADJUSTMENT_SCALE = [["incredibly-easy", -10], ["very-easy", -5], ["easy", -2], ["normal", 0], ["hard", 2], ["very-hard", 5], ["incredibly-hard", 10]];
const RARITY_STEP = { common: "normal", uncommon: "hard", rare: "very-hard", unique: "incredibly-hard" };
// combined index = clamp(rarityIndex + easeIndex - 3, 0, 6); DC = levelDC + that step's adjustment
```

Reuse the existing level-table lookup/clamp from `computeHiddenDC` rather than duplicating it.
- [x] **Step 4:** `npm test` → all pass.
- [x] **Step 5: Commit** `feat(lore): compute Lore DCs and list a character's Lores`.

---

### Task 4: The Lore request round trip

**Files:**
- Create: `scripts/lore-approval.js`, `scripts/applications/lore-decision-prompt.js`
- Modify: `scripts/socket.js` (dispatch by type), `scripts/module.js` (register the `userConnected` hook)
- Test: `tests/lore-approval.test.js` (new), `tests/socket.test.js`

**Interfaces:**
- Consumes: `computeLoreDC`, `LORE_EASE` (Task 3); `isValidTargetActor` (`targeting.js`); `SOCKET_NAME` (`socket.js`).
- Produces, in `lore-approval.js`:
  - `requestLoreDecision({ rollingActor, targetActor, targetToken, loreSlug, category }) -> Promise<"easy" | "very-easy" | "declined" | "cancelled" | "unavailable">`. `targetToken` is a TokenDocument.
  - `cancelPendingLoreRequest() -> void` (no-op when nothing is pending).
  - `handleLoreRequest(message, senderId)`, `handleLoreReply(message, senderId)`, `handleLoreCancel(message, senderId)`, `onUserConnectionChange()`.
- Produces, in `lore-decision-prompt.js`: `promptGmLoreDecision({ characterName, loreLabel, categoryLabel, targetName, targetImg, dcs: { easy, veryEasy } }) -> { decision: Promise<"easy" | "very-easy" | "declined">, close: () => void }`. A DialogV2 with buttons Decline / `RKA.Lore.Easy` / `RKA.Lore.VeryEasy` (DC in the label); closing it resolves `"declined"`. Not unit-tested (thin Foundry wrapper); `vi.mock` it in tests.
- Socket messages (all on `SOCKET_NAME`):
  - `{ type: "loreRequest", requestId, actorUuid, targetUuid, targetTokenUuid, loreSlug, category }` — player → GM.
  - `{ type: "loreReply", requestId, userId, decision }` — GM → requester (`userId` = the request's `senderId`).
  - `{ type: "loreCancel", requestId }` — player → GM.

Behaviour the tests pin:
- No active GM → `"unavailable"`, nothing emitted.
- The active GM requesting → `promptGmLoreDecision` locally, nothing emitted.
- A player → emits `loreRequest` (id from `foundry.utils.randomID()`), remembers `{ requestId, gmId: activeGM.id, resolve }`. Only one pending request per client: a new request first cancels the old one.
- `handleLoreReply` resolves only if `userId === game.user.id`, `requestId` matches the pending one, and `senderId === game.users.activeGM?.id`.
- `onUserConnectionChange`: if a request is pending and `game.users.activeGM?.id` is no longer its `gmId` → `"unavailable"`.
- `handleLoreRequest` (active GM only): drop silently unless the sender owns the actor (`testUserPermission(sender, "OWNER")`), `actor.skills[loreSlug]?.lore === true`, `category` is a `CATEGORIES` value, and the target is valid. Then open the prompt with real names, the token's `texture.src`, and both DCs; emit `loreReply` when it resolves — unless that request was cancelled.
- `handleLoreCancel`: closes the popup for that `requestId` only if `senderId` is the user who sent the request; no reply is emitted afterwards.

- [x] **Step 1: Write the failing tests** in `tests/lore-approval.test.js` (stub `game`, `foundry.utils.randomID`, `fromUuidSync`; `vi.mock("../scripts/applications/lore-decision-prompt.js")`). One `it` per behaviour line above, plus the Review Focus 1–3 and 5 cases: reply from a non-active-GM sender ignored; reply for another `userId` ignored; reply with an old `requestId` ignored; a second request resolves the first `"cancelled"` and emits its `loreCancel`.
- [x] **Step 2:** In `tests/socket.test.js`, add: `handleSocketMessage` routes `loreReply` on a non-GM client (the existing GM-only early return must not swallow it), and still ignores `recordAttempt` on a non-GM client.
- [x] **Step 3:** `npm test` → new cases fail.
- [x] **Step 4: Implement** `lore-approval.js` and `lore-decision-prompt.js`. In `socket.js`, `handleSocketMessage` dispatches on `message?.type`: `recordAttempt`, `loreRequest`, `loreCancel` act only on the active GM; `loreReply` goes to `handleLoreReply` on any client. In `module.js`'s `ready`, add `Hooks.on("userConnected", onUserConnectionChange)`. Strings (`lang/en.json`, `RKA.Lore.*`): `PopupTitle` "Lore check", `PopupBody` "{character} wants to use {lore} to recall {category} about {target}.", `Decline` "Decline", `Easy` "Easy (DC {dc})", `VeryEasy` "Very easy (DC {dc})".
- [x] **Step 5:** `npm test` → all pass.
- [x] **Step 6: Commit** `feat(lore): ask the active GM to rule on a Lore roll`.

---

### Task 5: Lore in the dialog, and the GM chat note

**Files:**
- Modify: `scripts/applications/recall-knowledge-dialog.js`, `templates/dialog.hbs`, `styles/pf2e-recall-knowledge-assistant.css`, `lang/en.json`
- Modify: `scripts/roll-sequence.js`, `scripts/chat/render-result.js`
- Test: `tests/roll-sequence.test.js`, `tests/render-result.test.js`

**Interfaces:**
- Consumes: `getLoreSkills` (Task 3), `computeLoreDC` (Task 3), `requestLoreDecision` / `cancelPendingLoreRequest` (Task 4), `getEncounterFor` (Task 2).
- Produces: `executeRollSequence({ ..., loreEase })` and `renderResultChatMessage({ ..., loreEase })` — optional, `undefined` for non-Lore rolls.

- [x] **Step 1: Write the failing tests.** `roll-sequence.test.js`: `loreEase: "easy"` is passed through to `renderResultChatMessage`. `render-result.test.js`: with `loreEase: "very-easy"` the GM-only message contains the formatted `RKA.Chat.GmLoreNote` (ease from `RKA.Lore.Ease.very-easy`); the player's message does not mention it; without `loreEase` the GM message is unchanged.
- [x] **Step 2:** `npm test` → new cases fail.
- [x] **Step 3: Implement the chat note and passthrough.** Strings: `RKA.Chat.GmLoreNote` "Lore roll — GM ruled it {ease}.", `RKA.Lore.Ease.easy` "easy", `RKA.Lore.Ease.very-easy` "very easy".
- [x] **Step 4:** `npm test` → all pass.
- [x] **Step 5: Wire the dialog** (no unit tests; covered live in Task 7):
  - Context: `lores` = `getLoreSkills(rollingActor)` with `selected` and `disabled: !game.users.activeGM`; badge text `RKA.Likelihood.gmDecides` "GM decides"; disabled tooltip `RKA.Dialog.LoreNeedsGm` "A GM must be connected to rule on Lore."; `noSkills` only when both lists are empty; `waiting` flag.
  - Template: Lore entries below the regular ones in the same radio group (`data-action="selectSkill"`). While `waiting`: category, skill and Roll controls disabled, "Waiting for the GM…" (`RKA.Dialog.WaitingForGm`) and a Cancel button (`RKA.Dialog.Cancel`, `data-action="cancelLore"`).
  - Roll on a Lore, inside the existing `#isRolling` guard: re-check `isAttemptBlocked`; set waiting and render; `requestLoreDecision` (pass `this.#targetToken.document`); clear waiting. `easy`/`very-easy` → `executeRollSequence` with `dc: computeLoreDC(targetActor, decision)`, `loreEase: decision`, and the original click `event`. `declined` → `ui.notifications.info` `RKA.Lore.Declined` "The GM ruled that {lore} doesn't help here."; `unavailable` → `warn` `RKA.Lore.GmUnavailable` "The GM is no longer available to rule on your Lore."; `cancelled` → nothing. Re-render unless closed.
  - `cancelLore` action and `_onClose` both call `cancelPendingLoreRequest()`.
  - Re-render on GM connect/disconnect: register a `userConnected` hook in `_onFirstRender`, remove it in `_onClose`.
  - CSS: a neutral badge colour for `gmDecides`, and a disabled look for Lore entries.
- [x] **Step 6:** `npm test` → all pass.
- [x] **Step 7: Commit** `feat(lore): offer every Lore in the dialog, ruled on by the GM`.

---

### Task 6: 1.1.0 release prep

**Files:** `module.json`, `package.json`, `CHANGELOG.md`, `README.md`

- [x] **Step 1:** `version` `"1.1.0"` in `module.json` and `package.json`; `module.json` `download` → `https://github.com/gvach11/pf2e-recall-knowledge-assistant/releases/download/v1.1.0/pf2e-recall-knowledge-assistant.zip`.
- [x] **Step 2: CHANGELOG** `## [1.1.0] — <release date>`, same format as 1.0.0:
  - *Lore skills*: every Lore listed as "GM decides"; rolling one asks the GM, who declines or allows it at an easy or very easy DC; a decline costs nothing.
  - *Fixes*: attempts are remembered on the encounter the target is in, so an old encounter left running no longer blocks or remembers rolls from another fight or from outside combat.
- [x] **Step 3: README**: a Lore bullet in the feature list; the "Repeat attempts" bullet says "in the started encounter the target is part of".
- [x] **Step 4:** `npm test` → all pass. `npm run package`, then list the zip with the command from the 2026-11-02 plan (Task 1 Step 8). Expected: still exactly the eight top-level entries (`module.json`, `scripts/`, `templates/`, `styles/`, `lang/`, `README.md`, `LICENSE`, `CHANGELOG.md`), and `scripts/` now includes `lore-approval.js` and `applications/lore-decision-prompt.js`.
- [x] **Step 5: Commit** `chore(release): prepare 1.1.0`.

---

### Task 7: Live verification and release

- [x] **Step 1 (ask first):** Point Foundry at the branch: swap `D:\Games\VTT Data\Data\modules\pf2e-recall-knowledge-assistant` for a junction to the repo (`mklink /J`; check `LinkType` first and keep the installed copy aside). Relaunch the world (the user clicks the setup screen).
- [x] **Step 2:** With a GM and a player client, every line passes or stop and debug (superpowers:systematic-debugging):
  1. The player sees their Lores as "GM decides"; with no GM connected they're greyed out and come back live when the GM joins.
  2. Lore → Roll → GM popup shows character, Lore, category, real target name, token art and both DCs; Easy → the roll runs, the GM chat note says "easy", the player's card shows no ease or DC.
  3. Decline → the player is told, the dialog stays open, a regular skill can still be rolled (nothing recorded).
  4. The player cancels, and separately closes the dialog, while waiting → the GM popup closes.
  5. The GM reloads while a request waits → the player's wait ends with the "no longer available" warning.
  6. The GM rolls for a character via the macro → the choice appears locally.
  7. **The bug:** leave an old started encounter (without the target) shown in the player's tracker; start a new one with the target; fail → blocked; end the new encounter → no longer blocked. A roll on a creature in no combat records nothing.
- [x] **Step 3 (ask first):** Restore the installed module (remove the junction, put the copy back).
- [x] **Step 4 (ask first):** Fast-forward `master` to `release/v1.1.0`, push, tag `v1.1.0`, push the tag; `npm run package`; `gh release create v1.1.0 dist/pf2e-recall-knowledge-assistant.zip dist/module.json --title "v1.1.0" --notes-file -` with the CHANGELOG 1.1.0 section.
- [x] **Step 5: Verify.** `gh release view v1.1.0` lists both assets; the manifest URL (raw `master` `module.json`) serves `"version": "1.1.0"`.
