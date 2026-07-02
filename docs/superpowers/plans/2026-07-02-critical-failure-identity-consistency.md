# Critical Failure / Identity Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Critical Failure, if the acting character hasn't already identified the target this encounter, treat the outcome exactly like a plain Failure (no baseline, no fact — true or false) instead of generating false info, closing the "unknown identity + confidently-stated specific fact" tell.

**Architecture:** Single-branch change to the existing pure function `resolveReveal()` in `scripts/reveal.js`, gated by a new `alreadyIdentified` boolean parameter. One call-site update in `scripts/applications/recall-knowledge-dialog.js` to pass the value it already computes. No other files change.

**Tech Stack:** Plain JavaScript (ES modules, no build step), vitest for unit tests.

## Global Constraints

- This project has **no git repository** (confirmed at project start). Plan steps below that would normally say "commit" instead say "checkpoint — no commit" since there is nothing to commit to. Do not run `git init` unless the user asks.
- No build step: edit `.js` files directly, `npm test` runs vitest against `tests/`.
- Design source of truth: `docs/superpowers/specs/2026-07-02-critical-failure-identity-consistency-design.md` and `SPEC.md` §6.2–§6.6.

---

### Task 1: Gate false-info generation on prior identification in `resolveReveal`

**Files:**
- Modify: `scripts/reveal.js` (the `resolveReveal` function)
- Modify: `scripts/applications/recall-knowledge-dialog.js:118-124` (the `resolveReveal(...)` call inside `#onRollSkill`)
- Test: `tests/reveal.test.js`

**Interfaces:**
- Consumes: `DEGREES.CRITICAL_FAILURE`, `DEGREES.FAILURE` from `scripts/constants.js` (already imported in `reveal.js`); `isIdentified(combat, actorUuid, targetUuid)` from `scripts/repeat-attempts.js`, already imported and called in `recall-knowledge-dialog.js` as `alreadyIdentified` (currently only passed to `renderResultChatMessage`, not to `resolveReveal`).
- Produces: new signature `resolveReveal(facts, category, degree, revealedKeys = new Set(), alreadyIdentified = false, rng = Math.random)` — note `alreadyIdentified` is inserted **before** `rng`, shifting `rng` from the 5th to the 6th positional argument. Every existing caller that passes `rng` positionally must be updated.

- [ ] **Step 1: Update existing tests in `tests/reveal.test.js` for the new positional argument**

Open `tests/reveal.test.js`. Replace the entire file with:

```js
import { describe, expect, it } from "vitest";
import { resolveReveal } from "../scripts/reveal.js";
import { CATEGORIES, DEGREES, makeFactKey } from "../scripts/constants.js";

const facts = {
  name: "Test Ghoul",
  traits: ["undead"],
  weaknesses: [{ type: "fire", value: 5, label: "fire" }],
  resistances: [{ type: "cold", value: 5, label: "cold" }],
  immunities: [{ type: "poison", label: "poison" }],
};

describe("resolveReveal", () => {
  it("failure reveals nothing and records no new keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.FAILURE, new Set());
    expect(reveal).toEqual({ baseline: null, facts: [], isFalse: false, revealedKeys: [] });
  });

  it("success includes a baseline and one fact, and records that fact's key", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), false, () => 0);
    expect(reveal.baseline).toContain("Test Ghoul");
    expect(reveal.facts).toEqual(["Weak to fire 5"]);
    expect(reveal.revealedKeys).toEqual([makeFactKey(CATEGORIES.WEAKNESSES, "fire")]);
    expect(reveal.isFalse).toBe(false);
  });

  it("critical success includes a baseline plus two distinct facts from different categories, with both keys recorded", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_SUCCESS, new Set(), false, () => 0);
    expect(reveal.facts).toHaveLength(2);
    expect(new Set(reveal.facts).size).toBe(2); // no duplicate fact text
    expect(reveal.revealedKeys).toHaveLength(2);
    expect(new Set(reveal.revealedKeys).size).toBe(2); // no duplicate keys
  });

  it("critical failure on an ALREADY-IDENTIFIED target reveals one false fact and records no new (true) keys", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), true, () => 0);
    expect(reveal.baseline).toBeNull();
    expect(reveal.facts).toHaveLength(1);
    expect(reveal.isFalse).toBe(true);
    expect(reveal.revealedKeys).toEqual([]);
  });

  it("critical failure on a target NOT YET identified is treated exactly like a Failure — no baseline, no fact, real or false", () => {
    const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, new Set(), false, () => 0);
    expect(reveal).toEqual({ baseline: null, facts: [], isFalse: false, revealedKeys: [] });
  });

  it("regression: critical failure never contradicts a fact already revealed true this encounter", () => {
    const revealedKeys = new Set([makeFactKey(CATEGORIES.RESISTANCES, "cold")]);
    for (let i = 0; i < 25; i++) {
      const reveal = resolveReveal(facts, CATEGORIES.WEAKNESSES, DEGREES.CRITICAL_FAILURE, revealedKeys, true, () => i / 25);
      expect(reveal.facts.join(" ")).not.toContain("cold");
    }
  });

  it("success on an empty category still gives the baseline, with no facts", () => {
    const emptyFacts = { name: "Blank", traits: [], weaknesses: [], resistances: [], immunities: [] };
    const reveal = resolveReveal(emptyFacts, CATEGORIES.WEAKNESSES, DEGREES.SUCCESS, new Set(), false);
    expect(reveal.baseline).toContain("Blank");
    expect(reveal.facts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail for the right reason**

Run: `npm test -- tests/reveal.test.js`

Expected: the new test `"critical failure on a target NOT YET identified is treated exactly like a Failure..."` **FAILS**, because `resolveReveal` doesn't accept/use an `alreadyIdentified` parameter yet — it still always generates false info on Critical Failure. The failure message should show `reveal.facts` containing one false fact instead of the expected empty array. The other tests (updated with the new positional `false`/`true` argument) should still **PASS** — their behavior hasn't changed, only the call signature has. If any of those fail, the positional argument was inserted incorrectly — fix the test file, don't touch `scripts/reveal.js` yet.

- [ ] **Step 3: Implement the minimal change in `scripts/reveal.js`**

Open `scripts/reveal.js`. Replace the function signature and its first branch:

```js
export function resolveReveal(facts, category, degree, revealedKeys = new Set(), alreadyIdentified = false, rng = Math.random) {
  if (degree === DEGREES.CRITICAL_FAILURE && !alreadyIdentified) {
    return { baseline: null, facts: [], isFalse: false, revealedKeys: [] };
  }

  if (degree === DEGREES.CRITICAL_FAILURE) {
    const falseFact = generateFalseInfo(facts, category, revealedKeys, rng);
    return { baseline: null, facts: falseFact ? [falseFact.text] : [], isFalse: true, revealedKeys: [] };
  }

  if (degree === DEGREES.FAILURE) {
    return { baseline: null, facts: [], isFalse: false, revealedKeys: [] };
  }

  // ...rest of the function (Success / Critical Success handling) is unchanged
```

Leave everything below the `if (degree === DEGREES.FAILURE) { ... }` block exactly as it already is — only the function signature and the Critical Failure branch change. Also update the function's doc comment to mention the new parameter:

```js
/**
 * Resolves what to reveal for a given degree of success (SPEC.md §6.3).
 * A success/critical success always includes baseline info; "nothing
 * notable" only ever applies to the category-specific part.
 *
 * `revealedKeys` is the set of stable fact keys already truthfully known to
 * this character about this target (from earlier attempts this encounter,
 * see repeat-attempts.js). It's used only to keep a critical failure's
 * false fact from contradicting something already known — true reveals
 * are free to repeat.
 *
 * `alreadyIdentified` gates whether a Critical Failure produces false info
 * at all: if the character hasn't identified this target yet (no prior
 * Success/Critical Success this encounter), a Critical Failure is treated
 * exactly like a Failure — no baseline, no fact, real or false. This
 * avoids an inherent tell ("confident about a specific detail of a
 * creature you don't know the identity of") that can't otherwise be
 * disguised. Once identified, Critical Failure resumes giving one false,
 * non-contradictory fact as before.
 *
 * Returns `{ baseline, facts, isFalse, revealedKeys }`, where the returned
 * `revealedKeys` are the *new* true-fact keys earned by this attempt only
 * (empty for Failure/Critical Failure), for the caller to persist.
 */
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- tests/reveal.test.js`

Expected: all 7 tests in `tests/reveal.test.js` **PASS**.

- [ ] **Step 5: Wire `alreadyIdentified` into the dialog's call to `resolveReveal`**

Open `scripts/applications/recall-knowledge-dialog.js`. Find this block inside `#onRollSkill` (currently around lines 118-124):

```js
    const reveal = resolveReveal(this.#facts, this.#selectedCategory, degree, priorRevealedKeys);
```

Replace it with:

```js
    const reveal = resolveReveal(this.#facts, this.#selectedCategory, degree, priorRevealedKeys, alreadyIdentified);
```

(`alreadyIdentified` is already computed a few lines above this call via `isIdentified(combat, actorUuid, targetUuid)` and already passed to `renderResultChatMessage` — this just also threads it into `resolveReveal`. No other changes needed in this file.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: all test files pass (60+ tests, no failures, no unhandled errors).

- [ ] **Step 7: Checkpoint — no commit (no git repository in this project)**

Confirm both files are saved: `scripts/reveal.js` and `scripts/applications/recall-knowledge-dialog.js`. This task is complete once Step 6 passes.

---

## Manual Verification (requires the live Foundry v14 + pf2e setup already linked into this project)

After the automated tests pass, reload the browser tab in Foundry (module is symlinked, no build step) and check:

1. Target a fresh, never-attempted NPC. Roll Recall Knowledge and force/observe a Critical Failure (e.g. via a very unfavorable skill choice, or temporarily lowering the character's modifier). Confirm the chat card is **indistinguishable from a plain Failure** — "Unknown Creature" header, "you recall nothing certain" body, no weakness/resistance/trait claim of any kind.
2. With a **different**, low-modifier skill on the same character, roll again against the same target — confirm it's now **blocked** (the Critical Failure still throttles further attempts this encounter, same as before).
3. Using a **different character** (not blocked), Recall Knowledge the same target and get a Success or Critical Success (identify it). Then, still with that same character, roll again (successes don't block) and force a Critical Failure — confirm this time the header shows the **real name** and the body gives **one false fact**, consistent with pre-existing (already correct) behavior.
4. Confirm the GM-only companion message still shows the true degree ("Critical Failure") and true DC/roll regardless of what the player saw in cases 1 and 3.
