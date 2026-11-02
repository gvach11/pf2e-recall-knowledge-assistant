# Third Action Suggester Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship RKA 0.1.0 as a pre-release, then make TAS's Recall Knowledge suggestion open RKA's dialog and appear only when a nearby enemy is still worth an attempt.

**Architecture:** RKA publishes a versioned API (`apiVersion`, `openDialog({actor, targetToken})`, `getAttemptStatus({actor, targetToken})`) built on its existing pure fact and attempt-state helpers. TAS gets one new file, `scripts/integrations/rka.js`, that feature-detects RKA at call time and falls back to its 1.0.0 behaviour whenever RKA is missing, too old, throws, or the actor is an NPC.

**Tech Stack:** Foundry VTT v14 (ApplicationV2), pf2e ≥ 8.1.2, Vitest 3, GitHub CLI (`gh`) for releases.

**Spec:** `docs/superpowers/specs/2026-11-02-third-action-suggester-integration-design.md`

**Repos and branches:**
- RKA = `D:\FoundryModule\Recall Knowledge Assistant`. Tasks 1–2 on `release/v0.1.0`, Tasks 3–5 on `feat/tas-integration` (branched from `master` after Task 2).
- TAS = `D:\FoundryModule\Foundry Module\pf2e-third-action-suggester`. Tasks 6–7 on the existing `feat/rka-integration` (already holds the refactor commit `82433bb`).

## Global Constraints

- RKA module id `pf2e-recall-knowledge-assistant`; every new user-facing RKA string lives in `lang/en.json` under `RKA.*`.
- RKA stays Foundry v14 only (`compatibility` min/verified/max `"14"`), pf2e `>= 8.1.2`. TAS `compatibility.minimum` stays `"13"`.
- The dependency points one way: TAS → RKA. No RKA file mentions TAS.
- The TAS panel never shows an enemy's name or a DC. The Recall Knowledge `why` text is unchanged.
- RKA's no-argument `openDialog()` (used by `scripts/macro.js` and the scene-control button) behaves exactly as today.
- Pure logic takes plain data; anything reading `game`/`canvas`/`CONFIG` sits at the edges and is stubbed with `vi.stubGlobal` in tests (both repos).
- The status call only reads Combat flags; it never writes.
- Pushing, merging into `master`/`main`, tagging, creating GitHub releases, and relaunching the Foundry world each need the user's explicit go-ahead at that moment.

## Review Focus

1. **Several unlinked tokens of one NPC actor**: each token is its own target, keyed by `targetToken.actor.uuid`, matching the dialog. Test in Task 5.
2. **A target with no traits, or a hazard**: the "exhausted" check excludes the right identity trait (`"creature"` fallback; `trap`/`haunt` for hazards) and never throws. Tests in Task 3.
3. **RKA active but its API not published yet** (TAS's `ready` restores the panel before RKA's `ready` runs): TAS falls back to 1.0.0 behaviour without throwing. Test in Task 6.
4. **A GM opening RKA from TAS on a player character's turn**: the dialog rolls as that PC, because the GM owns it. Test in Task 4.
5. **A nearby "enemy" that's a hostile PC or a token whose actor is gone**: it's `"invalid"`, never counts as worth an attempt, and doesn't stop another enemy from counting. Tests in Tasks 5 and 6.

---

### Task 1: RKA 0.1.0 release prep

**Files:**
- Create: `LICENSE`, `README.md`, `CHANGELOG.md`, `tools/package.mjs`
- Modify: `module.json`, `package.json`, `.gitignore`
- Untrack: `.claude/settings.local.json`

- [ ] **Step 1:** `git switch -c release/v0.1.0` (from `master`).
- [ ] **Step 2: LICENSE.** Copy TAS's `LICENSE` verbatim (MIT, "Copyright (c) 2026 Vachna").
- [ ] **Step 3: README.md.** Same section structure as TAS's README: what it does, installation (manifest URL from Step 5), usage (target a token with Foundry's Target tool, then the brain button in Token controls or the "Recall Knowledge" macro; pick a category and a skill; roll), how results work (DC hidden, repeat attempts blocked after a failure for the rest of the encounter, critical failures can mislead once the creature is identified), compatibility (Foundry v14, pf2e ≥ 8.1.2), AI disclosure (adapt TAS's wording).
- [ ] **Step 4: CHANGELOG.md.** TAS's format; `## [0.1.0] — <release date>`, "Initial preliminary release", grouped by Dialog, Reveals, Repeat attempts, GM visibility.
- [ ] **Step 5: module.json.**
  - `authors`: `[{ "name": "Vachna", "url": "https://github.com/gvach11" }]`
  - `url`: `https://github.com/gvach11/pf2e-recall-knowledge-assistant`
  - `manifest`: `https://raw.githubusercontent.com/gvach11/pf2e-recall-knowledge-assistant/master/module.json` (final review: GitHub's `releases/latest` skips pre-releases, so it would 404)
  - `download`: `https://github.com/gvach11/pf2e-recall-knowledge-assistant/releases/download/v0.1.0/pf2e-recall-knowledge-assistant.zip`
- [ ] **Step 6: Untrack local settings.** `git rm --cached .claude/settings.local.json`. Add `.claude/settings.local.json` and `dist/` to `.gitignore`.
- [ ] **Step 7: `tools/package.mjs`** (run as `npm run package`). It recreates `dist/`, copies `module.json` to `dist/module.json`, and builds `dist/pf2e-recall-knowledge-assistant.zip` holding exactly `module.json`, `scripts/`, `templates/`, `styles/`, `lang/`, `README.md`, `LICENSE`, `CHANGELOG.md` at the zip root (no wrapping folder; same layout as TAS's v1.0.0 zip). Use `%SystemRoot%\System32\tar.exe -a -c -f` on Windows (bsdtar, writes zip from the extension); Git Bash's GNU tar can't write zip.
- [ ] **Step 8: Verify.** `npm run package`, then list the zip: `python -c "import zipfile,sys;print('\n'.join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))" dist/pf2e-recall-knowledge-assistant.zip`. Expected: only the eight entries above and their contents; no `tests/`, `docs/`, `paad/`, `node_modules/`, `package*.json`, `PLAN.md`, `SPEC.md`, `tools/`. `npm test`: 148 passing.
- [ ] **Step 9: Commit** `chore(release): prepare 0.1.0 (license, readme, changelog, manifest, packaging)`.

### Task 2: RKA 0.1.0 live check and publish (user-gated)

**Files:** `docs/superpowers/plans/2026-10-29-live-test-bug-fixes.md` (tick boxes only)

- [ ] **Step 1:** Ask the user to run (or confirm they already ran on HEAD) the live checklist in `2026-10-29-live-test-bug-fixes.md` Task 10 Step 3, plus: an identified creature, a Success that learned one true Weakness, then a Critical Failure on Weaknesses → the lie repeats or is consistent with that true weakness, never "nothing notable".
- [ ] **Step 2:** If anything fails, stop and debug (superpowers:systematic-debugging) before going on.
- [ ] **Step 3:** Tick every completed box in `2026-10-29-live-test-bug-fixes.md`; commit `docs(plan): mark live-test bug fixes verified`.
- [ ] **Step 4 (ask first):** Merge `release/v0.1.0` into `master` (fast-forward), push, tag `v0.1.0`, push the tag.
- [ ] **Step 5 (ask first):** From the `release/v0.1.0` checkout (not `feat/tas-integration`, which is at 0.2.0): `npm run package`, then `gh release create v0.1.0 dist/pf2e-recall-knowledge-assistant.zip dist/module.json --prerelease --title "v0.1.0" --notes-file -` with the CHANGELOG 0.1.0 section as notes.
- [ ] **Step 6: Verify.** `gh release view v0.1.0` lists both assets. The manifest URL from Task 1 Step 5 downloads a `module.json` with `"version": "0.1.0"`.

### Task 3: RKA "nothing left to learn" check

Branch: `git switch master && git switch -c feat/tas-integration`.

**Files:**
- Modify: `scripts/reveal.js`
- Test: `tests/reveal.test.js` (new `describe("isTargetExhausted")`)

**Interfaces:**
- Produces: `isTargetExhausted(facts, revealedKeys, identified): boolean` in `scripts/reveal.js`. `facts` is the `getActorFacts` shape; `revealedKeys` is any iterable of `makeFactKey` strings (the flag stores an array); `identified` is a boolean.

Rule (spec §5.3): true only when `identified` and all three `CATEGORIES` are exhausted. A category is exhausted when `makeFactKey(category, NOTHING_NOTABLE_KEY)` is known, or it has ≥ 1 learnable entry and every learnable entry's key is known. Learnable = `listCategoryEntries(facts, category)`, minus `pickIdentityTrait(facts.traits)` for `traits`.

- [ ] **Step 1: Write failing tests** using the file's existing `facts` fixture (Ghoul: traits `["undead"]`, weakness fire, resistance cold, immunity poison). Let `all = [weaknesses:fire, resistances:cold, resistances:poison, traits:~nothing-notable]` via `makeFactKey`.
  - `"is false until the target is identified"`: `isTargetExhausted(facts, all, false)` → `false`.
  - `"is true once every category is answered"`: `isTargetExhausted(facts, all, true)` → `true`.
  - `"an empty category nobody asked about is still worth learning"`: `all` without `traits:~nothing-notable` → `false`.
  - `"an empty weaknesses category counts once a Success reported nothing notable"`: facts with `weaknesses: []`; keys `[resistances:cold, resistances:poison, traits:~nothing-notable]` → `false`; plus `weaknesses:~nothing-notable` → `true`.
  - `"one unknown immunity keeps the target learnable"`: `all` without `resistances:poison` → `false`.
  - `"the identity trait is never required"`: traits `["mindless","undead"]`; keys from `all` without `traits:~nothing-notable`, plus `traits:mindless` → `true`.
  - `"a hazard's identity trait is never required"`: `kind: "hazard"`, traits `["mechanical","trap"]`; with `traits:mechanical` and the other categories answered → `true` (check first that `mechanical` isn't a `CREATURE_TRAIT_SKILLS` key; otherwise use another non-creature trait).
  - `"a target with no traits needs a nothing-notable Traits answer and doesn't throw"`: traits `[]`; other categories answered; without traits nothing-notable → `false`, with it → `true`.
  - `"matches what resolveReveal actually reveals"`: build a `Set` by running `resolveReveal(facts, category, DEGREES.SUCCESS, set, true, () => 0)` for each category and adding the `revealedKeys` → `isTargetExhausted(facts, set, true)` is `false` (poison not yet known). Then run Resistances again with `() => 0.999` and add the keys → `true`.
- [ ] **Step 2:** `npx vitest run tests/reveal.test.js`. Expected: FAIL (`isTargetExhausted` is not exported).
- [ ] **Step 3: Implement** `isTargetExhausted` in `scripts/reveal.js` next to `resolveReveal`, with a JSDoc that points at SPEC §6.7 (added in Task 5).
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(reveal): tell when a character has nothing left to learn about a target`.

### Task 4: RKA `openDialog` accepts an actor and a target

**Files:**
- Modify: `scripts/targeting.js`, `scripts/ui/scene-control.js`, `lang/en.json`
- Test: `tests/targeting.test.js`, `tests/scene-control.test.js`

**Interfaces:**
- Produces in `scripts/targeting.js`:
  - `isValidTargetActor(actor): boolean`: `actor?.type` is `"npc"` or `"hazard"`.
  - `validateTargetToken(token): Token|null`: returns `token` if `isValidTargetActor(token?.actor)`, otherwise warns `RKA.Warning.InvalidTargetType` and returns `null`. `getValidatedSingleTarget()` keeps its count checks and delegates the type check to this.
- Produces in `scripts/ui/scene-control.js`:
  - `isEligibleRollingActor(actor): boolean`: `actor?.type === "character" && actor.isOwner === true`. `resolveRollingActor()` uses it for the controlled-token pick.
  - `openRecallKnowledgeDialog({ actor, targetToken } = {}): void`. Target: `targetToken ? validateTargetToken(targetToken) : getValidatedSingleTarget()`, so a target is checked before the actor, as today. Roller: `actor ? (isEligibleRollingActor(actor) ? actor : warn) : resolveRollingActor()`.
- New lang key: `RKA.Warning.InvalidRollingActor`: `"Recall Knowledge can only be rolled by a character you own."`

- [ ] **Step 1: Write failing tests.**
  - `targeting.test.js` → `describe("validateTargetToken")`: an NPC token → returns the token, no warning; a hazard token → returns the token; a character token → `null` + warn `"RKA.Warning.InvalidTargetType"`; `{ actor: null }` → `null` + the same warning. The existing `getValidatedSingleTarget` tests stay unchanged and must still pass.
  - `scene-control.test.js`: add `validateTargetToken: vi.fn()` to the `targeting.js` mock. New cases:
    - `"opens for a given owned character even when another character's token is controlled"`: `actor = { type:"character", isOwner:true }`, a different owned character controlled → `RecallKnowledgeDialog` called with `{ targetToken, rollingActor: actor }`.
    - `"a GM opens it for a player's character"`: `isOwner: true` (GM) → opens with that actor.
    - `"refuses a given character the user doesn't own"`: `isOwner:false` → warn `"RKA.Warning.InvalidRollingActor"`, no dialog.
    - `"refuses a given NPC"`: `{ type:"npc", isOwner:true }` → same warning, no dialog.
    - `"uses a given target token instead of the user's targets"`: `validateTargetToken` returns the token → `getValidatedSingleTarget` not called; dialog gets that token.
    - `"stops when the given target token is invalid"`: `validateTargetToken` returns `null` → no dialog, no rolling-actor warning.
    - `"with no arguments behaves as before"`: the existing no-argument tests, unchanged.
- [ ] **Step 2:** `npx vitest run tests/targeting.test.js tests/scene-control.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above and add the lang key.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): let callers choose the rolling character and target when opening the dialog`.

### Task 5: RKA `getAttemptStatus` and the versioned API

**Files:**
- Modify: `scripts/constants.js`, `scripts/module.js`, `SPEC.md`
- Create: `scripts/attempt-status.js`
- Test: `tests/attempt-status.test.js`, `tests/module.test.js` (new)

**Interfaces:**
- Consumes: `isTargetExhausted` (Task 3); `isValidTargetActor` (Task 4); `getActiveEncounter`, `isAttemptBlocked`, `isIdentified`, `getRevealedFacts` from `repeat-attempts.js`; `getActorFacts` from `actor-data.js`.
- Produces in `scripts/constants.js`: `API_VERSION = 1`; `ATTEMPT_STATUS = Object.freeze({ AVAILABLE: "available", BLOCKED: "blocked", EXHAUSTED: "exhausted", INVALID: "invalid" })`.
- Produces in `scripts/attempt-status.js`: `getAttemptStatus({ actor, targetToken } = {}): string`, one of the `ATTEMPT_STATUS` values, checked in order: invalid (`actor?.type !== "character"` or `!isValidTargetActor(targetToken?.actor)`), then blocked, then exhausted, then available. The target key is `targetToken.actor.uuid`. No started encounter → `"available"`. The module must not import the dialog (that pulls in the `foundry` global at load).
- Produces in `scripts/module.js` `ready`: `api = { apiVersion: API_VERSION, openDialog: openRecallKnowledgeDialog, getAttemptStatus }`.

- [ ] **Step 1: Write failing tests.**
  - `attempt-status.test.js`: stub `game.combat` with `Object.assign(createFakeCombat(), { started: true })` and seed records with `recordAttempt` from `repeat-attempts.js`. The target actor is pf2e-shaped so `getActorFacts` reads it: `{ uuid, type:"npc", name, system:{ traits:{ value:["undead"] }, attributes:{ weaknesses:[{type:"fire",value:5,typeLabel:"fire",label:"fire 5"}], resistances:[{type:"cold",value:5,typeLabel:"cold",label:"cold 5"}], immunities:[{type:"poison",typeLabel:"poison",label:"poison"}] } } }`.
    - `"invalid without an actor"`, `"invalid for an NPC roller"`, `"invalid when the token has no actor"`, `"invalid when the target is a character"` → `"invalid"`.
    - `"available outside a started encounter"`: `game.combat` `undefined`, and separately `{ started:false }`, → `"available"`.
    - `"blocked after a failure"`: `recordAttempt(combat, pc, target, "failure")` → `"blocked"`.
    - `"exhausted once everything is known"`: a `"success"` record with all four keys from Task 3's `all` → `"exhausted"`.
    - `"available while something is left"`: a `"success"` record with only `weaknesses:fire` → `"available"`.
    - `"blocked wins over exhausted"`: everything known, then a `"failure"` → `"blocked"`.
    - `"each unlinked token is its own target"`: two tokens whose actors have different uuids (`Scene.s.Token.a.Actor.x`, `Scene.s.Token.b.Actor.x`); token A blocked → token B `"available"`.
  - `module.test.js`: `vi.mock` `./ui/scene-control.js` (`registerSceneControl`, `openRecallKnowledgeDialog`), `./macro.js`, `./socket.js`. Stub `Hooks.once` to capture callbacks, and `game` with `modules.get` returning a shared object and `user.isGM: true`. Import `scripts/module.js`, run the `ready` callback, and expect `api` to equal `{ apiVersion: 1, openDialog: openRecallKnowledgeDialog, getAttemptStatus }`.
- [ ] **Step 2:** `npx vitest run tests/attempt-status.test.js tests/module.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: SPEC.md.** Add `### 6.7 Public API` after §6.6, carrying the design doc's §5.1–§5.3 (API shape, `openDialog` rules, status order, "nothing left to learn" rule including the user's empty-category decision).
- [ ] **Step 5:** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(api): publish apiVersion and getAttemptStatus for other modules`.

### Task 6: TAS test setup and the RKA integration module

Repo: TAS, branch `feat/rka-integration`.

**Files:**
- Create: `package.json`, `scripts/integrations/rka.js`, `tests/integrations/rka.test.js`
- Modify: `.gitignore` (create if missing): `node_modules/`, `dist/`

**Interfaces:**
- Consumes: RKA API from Task 5 (`apiVersion`, `openDialog({ actor })`, `getAttemptStatus({ actor, targetToken })` → `"available"|"blocked"|"exhausted"|"invalid"`).
- Produces in `scripts/integrations/rka.js`:
  - `RKA_MODULE_ID = "pf2e-recall-knowledge-assistant"`
  - `getRkaApi(): object|null`: the API only when `game.modules.get(RKA_MODULE_ID)?.active` and `api?.apiVersion >= 1`. Looked up on every call, never cached.
  - `canRouteToRka(actor): boolean`: `getRkaApi() !== null && actor?.type === "character"`.
  - `hasWorthwhileRecallTarget(actor, nearbyEnemyTokens): boolean`: when routable, true if some token's status is `"available"`; otherwise `nearbyEnemyTokens.length > 0`. If the API throws: `console.warn('PF2E Third Action | …', e)` and return `nearbyEnemyTokens.length > 0`.
  - `openRecallKnowledge(actor): boolean`: when routable, call `api.openDialog({ actor })` (no target) and return `true`; otherwise `false`. If it throws: `console.warn` and return `false`.

- [ ] **Step 1: Setup.** `package.json` mirrors RKA's: name `pf2e-third-action-suggester`, `private: true`, `"type": "module"`, `"scripts": { "test": "vitest run" }`, devDependency `vitest` `^3.0.0`. Run `npm install`.
- [ ] **Step 2: Write failing tests** in `tests/integrations/rka.test.js` with `vi.stubGlobal("game", { modules: { get: (id) => … } })`, `pc = { type:"character" }`, `npc = { type:"npc" }`:
  - `getRkaApi`: module missing → `null`; `active:false` → `null`; active, `api` undefined (not published yet) → `null`; active, `api` without `apiVersion` (RKA 0.1.0) → `null`; active, `apiVersion: 1` → the api.
  - `canRouteToRka`: current api + `pc` → `true`; + `npc` → `false`; no api + `pc` → `false`.
  - `hasWorthwhileRecallTarget`, routable `pc`: statuses `["blocked","exhausted"]` → `false`; `["blocked","available"]` → `true`; `["invalid","available"]` → `true`; `["invalid"]` → `false`; `[]` → `false`; each call receives `{ actor: pc, targetToken }`.
  - `hasWorthwhileRecallTarget` fallback: no api, 2 tokens → `true`; no api, `[]` → `false`; `npc` with api, 1 token → `true` and `getAttemptStatus` not called; `getAttemptStatus` throws, 1 token → `true` and `console.warn` called.
  - `openRecallKnowledge`: routable → `openDialog` called with `{ actor: pc }` and returns `true`; `npc` → `false`, not called; no api → `false`; `openDialog` throws → `false` and `console.warn` called.
- [ ] **Step 3:** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement** `scripts/integrations/rka.js`.
- [ ] **Step 5:** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(rka): detect Recall Knowledge Assistant and ask it which enemies are worth recalling` (include `package.json`, `package-lock.json`, `.gitignore`, both new files).

### Task 7: TAS wiring

**Files:**
- Modify: `scripts/main.js`

**Interfaces:**
- Consumes: `canRouteToRka`, `hasWorthwhileRecallTarget`, `openRecallKnowledge` (Task 6).

`main.js` registers hooks when it loads, so it isn't unit-tested. These changes are checked with `node --check` here and live in Task 9.

- [ ] **Step 1:** Import the three functions from `./integrations/rka.js`.
- [ ] **Step 2: `readBattlefieldContext`.** Add `hasWorthwhileRecallTarget: false` to `defaults`, and `hasWorthwhileRecallTarget: hasWorthwhileRecallTarget(actor, nearbyEnemies)` to the returned object.
- [ ] **Step 3: Recall Knowledge rule.** In its `condition`, `p.hasNearbyEnemy` becomes `p.hasWorthwhileRecallTarget`. The skill check and `why` are unchanged.
- [ ] **Step 4: `getSuggestions`.** `isChatOnly` becomes `slug in CHAT_ACTIONS && !(slug === 'recall-knowledge' && canRouteToRka(actor))`.
- [ ] **Step 5: `_rollAction`.** Before the `CHAT_ACTIONS` branch: `if (slug === 'recall-knowledge' && openRecallKnowledge(this.actor)) return;`. Keep `recall-knowledge` in `NO_TARGET_ACTIONS`.
- [ ] **Step 6: Verify.** `node --check scripts/main.js` → no output; `npm test` → all pass.
- [ ] **Step 7: Commit** `feat: open Recall Knowledge Assistant from the Recall Knowledge suggestion`.

### Task 8: Release prep for RKA 0.2.0 and TAS 1.1.0

**Files:**
- RKA: `module.json`, `README.md`, `CHANGELOG.md`
- TAS: `module.json`, `README.md`, `CHANGELOG.md`, `tools/package.mjs` (new), `package.json`

- [ ] **Step 1: RKA.** `module.json` `version` `"0.2.0"`, `download` → `…/releases/download/v0.2.0/pf2e-recall-knowledge-assistant.zip`. README gets a "For module authors and macros" section listing the three API members and the four status values. CHANGELOG `[0.2.0]`: public API; works with Third Action Suggester. Commit `chore(release): prepare 0.2.0`.
- [ ] **Step 2: TAS.** `module.json`: `version` `"1.1.0"`; `download` → `https://github.com/gvach11/pf2e-third-action-suggester/releases/download/v1.1.0/pf2e-third-action-suggester.zip`; add `"relationships": { "recommends": [{ "id": "pf2e-recall-knowledge-assistant", "type": "module", "reason": "Opens a guided Recall Knowledge roll from the suggestion and hides it when there's nothing left to learn." }] }`. Leave `compatibility.verified` alone until Task 9. README: a "Works with Recall Knowledge Assistant" section (what changes, the NPC-turn and not-installed fallbacks). CHANGELOG `[1.1.0]`.
- [ ] **Step 3: TAS packaging.** `tools/package.mjs` as in Task 1 Step 7, zip `dist/pf2e-third-action-suggester.zip`, same eight entries; `"package"` script in `package.json`. Verify with the Task 1 Step 8 listing command: no `tests/`, `node_modules/`, `package*.json`, `tools/`.
- [ ] **Step 4:** `npm test` in both repos → all pass. Commit TAS `chore(release): prepare 1.1.0`.

### Task 9: Live verification and publish (user-gated)

- [ ] **Step 1 (ask first):** Install both working copies into the v14 test world (`third-action-test`) and relaunch it.
- [ ] **Step 2:** With the user, run the design doc's §7 checklist, plus the final review's two notes (after a Critical Failure lie on an identified, not-yet-exhausted enemy, check the suggestion's behaviour matches the user's decision on finding #1; after reloading mid-turn, note whether the Recall Knowledge button shows the info icon though it opens RKA), on GM + player clients with a started encounter. Every line passes, or stop and debug (superpowers:systematic-debugging) before going on.
- [ ] **Step 3:** TAS `module.json` `compatibility.verified` → `"14"`; commit `chore: verify on Foundry v14`.
- [ ] **Step 4 (ask first):** In each repo, from the feature branch: `npm run package`, tag `v0.2.0` (RKA) / `v1.1.0` (TAS) on the branch tip, push the branch and the tag, and `gh release create` with the zip and `dist/module.json` attached. Both manifests are raw `master`/`main` `module.json`, so the release asset must exist before Step 5 advertises the new version.
- [ ] **Step 5 (ask first):** Merge RKA `feat/tas-integration` → `master` and TAS `feat/rka-integration` → `main` (fast-forward) and push. (In Step 4, RKA's release is marked `--prerelease`; whether TAS 1.1.0 is a full release is the user's call. Use each CHANGELOG section as the notes.)
- [ ] **Step 6: Verify.** `gh release view` in each repo lists both assets. RKA's manifest (raw `master` `module.json`) serves `0.2.0`; TAS's (raw `main`) serves `1.1.0`.
