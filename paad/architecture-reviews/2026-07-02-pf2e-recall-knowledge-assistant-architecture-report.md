# Architecture Report — pf2e-recall-knowledge-assistant

**Date:** 2026-07-02
**Commit:** 920ba8ad64a2257220de78139e1a02937ec877e6
**Languages:** Plain JavaScript (ES modules, no build step), Handlebars templates
**Key directories:** `scripts/` (module source), `scripts/data/` (pure logic), `scripts/applications/`, `scripts/chat/`, `scripts/ui/`, `templates/`, `lang/`, `styles/`, `tests/` (vitest)
**Scope:** Full repository (23 files: 13 scripts, 5 test files, 2 templates, `lang/en.json`, `styles/*.css`, plus `module.json`, `package.json`, `SPEC.md`, `PLAN.md`)

## Repo Overview

`pf2e-recall-knowledge-assistant` is a small FoundryVTT module for the Pathfinder 2e system that streamlines the "Recall Knowledge" action: a player targets an NPC/hazard token, picks a skill and info category, rolls, and receives a scoped reveal (weakness/resistance/immunity/trait) — with the DC always hidden from the player, and deliberately false information served on a critical failure. It's plain JavaScript with native ES module imports, no bundler, and a small `vitest` suite covering the pure-logic layer (`scripts/data/*`, `actor-data.js`, `reveal.js`, `repeat-attempts.js`). The Foundry-API-coupled surface (dialog UI, chat rendering, roll invocation, targeting, scene-control button) has no automated tests by design, per `PLAN.md`. No `CLAUDE.md`/`AGENTS.md` steering files exist; `SPEC.md` and `PLAN.md` at the repo root serve as design/decision documentation and were used as background context, not as steering files.

## Strengths

### [S1] Real target name correctly gated behind identification state, monotonic
- **Category:** S10 (Security built in)
- **Impact:** High
- **Explanation:** The chat header only shows the real name once identification is earned (Success/Critical Success this attempt, or a prior attempt this encounter); the `identified` flag is OR-only and can never be unset by a later bad roll.
- **Evidence:** `scripts/repeat-attempts.js:83` — `identified: existing.identified || IDENTIFYING_DEGREES.has(degree)`; `scripts/chat/render-result.js:26-29`.
- **Found by:** Security & Code Quality specialist; verified.

### [S2] DC is never placed in any player-facing template or context
- **Category:** S10 (Security built in)
- **Impact:** High
- **Explanation:** Neither the dialog's `_prepareContext()` nor the public chat template's render context ever includes a numeric `dc` field.
- **Evidence:** `scripts/applications/recall-knowledge-dialog.js:48-82` (no `dc` key in the returned context object); `scripts/chat/render-result.js:31-36` (`renderTemplate(TEMPLATE_PATH, { targetName, degree, baseline, facts })`).
- **Found by:** Security & Code Quality specialist; verified. (Note: this strength is undermined at the chat-message level — see [F1].)

### [S3] Critical-failure false info correctly gated on prior identification
- **Category:** S10 (Security built in)
- **Impact:** High
- **Explanation:** A Critical Failure against a not-yet-identified target is treated exactly like a plain Failure (no info, real or false) — closing off the "confident false claim about an unknown creature" tell. Implemented via commit `796db6c` and wired end-to-end.
- **Evidence:** `scripts/reveal.js:30-32` — `if (degree === DEGREES.CRITICAL_FAILURE && !alreadyIdentified) { return { baseline: null, facts: [], isFalse: false, revealedKeys: [] }; }`.
- **Found by:** Security & Code Quality specialist (corroborated by Structure & Boundaries specialist); verified.

### [S4] Strong regression test coverage on all pure-logic modules
- **Category:** S11 (Testability & coverage)
- **Impact:** High
- **Explanation:** Every Foundry-decoupled logic file (`actor-data.js`, `data/dc-table.js`, `data/false-info.js`, `repeat-attempts.js`, `reveal.js`) has a dedicated 1:1 test file, including regression tests tied to specific documented bugs (identity persistence, false-info non-contradiction, likelihood-bucketing boundaries).
- **Evidence:** `tests/` contains exactly `actor-data.test.js, dc-table.test.js, false-info.test.js, repeat-attempts.test.js, reveal.test.js`; `tests/reveal.test.js:56-61` exercises the empty-category fallback path.
- **Found by:** Structure & Boundaries, Integration & Data, Security & Code Quality specialists (3-way agreement); verified.

### [S5] False info never contradicts previously-revealed true facts
- **Category:** S10 (Security built in)
- **Impact:** Medium
- **Explanation:** `invertToFalseWeakness`/`invertToFalseResistance` filter candidates against already-revealed fact keys before inverting; if nothing safe remains anywhere, the attempt yields no info rather than a contradictory lie.
- **Evidence:** `scripts/data/false-info.js:25` — `.filter((type) => !revealedKeys.has(makeFactKey(CATEGORIES.RESISTANCES, type)))`.
- **Found by:** Security & Code Quality specialist; verified.

### [S6] Target-type allowlist restricts Recall Knowledge to NPC/Hazard only
- **Category:** S10 (Security built in)
- **Impact:** Medium
- **Explanation:** Actor type is validated before any dialog opens, preventing use against PCs or other actor types.
- **Evidence:** `scripts/targeting.js:1,22-27` — `VALID_ACTOR_TYPES = new Set(["npc", "hazard"])`.
- **Found by:** Security & Code Quality specialist; verified.

### [S7] Clean, unidirectional dependency graph — zero circular imports, zero Foundry-global coupling in the pure-logic layer
- **Category:** S4 (Dependency direction is stable)
- **Impact:** Medium
- **Explanation:** All 23 import statements across the 14 script files form a strict DAG (`module.js → ui/scene-control.js → applications/recall-knowledge-dialog.js → {actor-data, data/dc-table, roll, repeat-attempts, reveal, chat/render-result}`, `reveal.js → {actor-data, data/false-info}`) with no back-edges. `scripts/data/*`, `actor-data.js`, `reveal.js`, and `repeat-attempts.js` are confirmed free of any Foundry globals (`game.`, `canvas.`, `ui.`, `Hooks.`, `ChatMessage.`, `Macro.`, `foundry.`) via full grep.
- **Evidence:** `grep -r "game\.\|canvas\.\|ui\.\|Hooks\.\|ChatMessage\.\|Macro\.\|foundry\." scripts/data/` → no matches.
- **Found by:** Coupling & Dependencies specialist; verified.

### [S8] Consistent dependency-injection of RNG for deterministic testability
- **Category:** S3 (Loose coupling)
- **Impact:** Medium
- **Explanation:** Every function involving randomness accepts `rng = Math.random` as a trailing parameter, letting tests supply deterministic seeded functions without a mocking framework.
- **Evidence:** `scripts/reveal.js:29` — `export function resolveReveal(facts, category, degree, revealedKeys = new Set(), alreadyIdentified = false, rng = Math.random)`; used in `tests/reveal.test.js:20` via `() => 0`.
- **Found by:** Coupling & Dependencies specialist; verified.

### [S9] Dialog is a thin orchestrator, not a god object, despite highest fan-in in the repo
- **Category:** S1 (Clear modular boundaries)
- **Impact:** Medium
- **Explanation:** `RecallKnowledgeDialog` has the highest import count (7) and line count (143) of any file, but contains no inline business logic — DC computation, degree-of-success, likelihood, reveal resolution, and false-info generation are all delegated to imported pure functions. It only wires `ApplicationV2` lifecycle, DOM events, and call sequencing.
- **Evidence:** `scripts/applications/recall-knowledge-dialog.js:1-143` — 7 imports, zero inline domain computation.
- **Found by:** Structure & Boundaries, Error Handling & Observability specialists; verified.

## Flaws/Risks

### [F1] "GM-only" companion chat message leaks the true DC/roll/degree to the rolling player
- **Category:** Flaw 30 (Security as an afterthought)
- **Impact:** High
- **Explanation:** The second `ChatMessage.create()` call sets `whisper` to GM recipients but never sets `blind: true` or overrides message authorship. Both chat messages are created client-side by the rolling player's own browser (the dialog that calls `renderResultChatMessage` runs entirely on the player's client). Per Foundry's `ChatMessage#visible` semantics, a whispered message's own author can always see it regardless of the whisper recipient list *unless* `blind: true` is set — this is the standard mechanism Foundry modules use for GM-only secret rolls, and it's absent here. This means the rolling player very likely sees the true DC, true roll total, and true degree of success in their own chat log immediately after every roll — defeating the module's central design invariant ("the DC is never shown explicitly," SPEC.md §6.2/§6.5) on the majority-case flow (a player rolling their own check, SPEC.md §4), not an edge case.
- **Evidence:** `scripts/chat/render-result.js:42-52` — `ChatMessage.create({ speaker, content: gmContent, whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id) })`, no `blind`, no `author` override; `speaker` (line 38) is shared with the public message. Full-repo grep confirms zero occurrences of `blind` anywhere in `scripts/`. No test file covers `render-result.js`.
- **Found by:** Security & Code Quality specialist (self-flagged 78% confidence); verified independently by re-reading the code and confirmed by the Verifier at 95% confidence.
- **Status:** Fixed
- **Status reason:** Added `blind: true` to the GM-only `ChatMessage.create()` call in `scripts/chat/render-result.js:48-53`, so the message is hidden from its own author (the rolling player) unless they're a GM, per Foundry's `ChatMessage#visible` semantics. Added `tests/render-result.test.js` (previously untested) as a safety net; red/green confirmed via a test asserting `blind === true` on the GM message.
- **Status date:** 2026-07-02
- **Status commit:** pending (see fix-architecture session commit)

### [F2] Entire Foundry-coupled surface — including where [F1] lives — has zero automated test coverage
- **Category:** Flaw 32 (Missing/inadequate test coverage for critical paths)
- **Impact:** High
- **Explanation:** `scripts/applications/recall-knowledge-dialog.js`, `scripts/chat/render-result.js`, `scripts/roll.js`, `scripts/targeting.js`, `scripts/ui/scene-control.js`, and `scripts/macro.js` have no corresponding test files. This is a deliberate, documented scope choice (`PLAN.md`), but it directly explains how [F1] went unnoticed: catching it requires observing chat-message visibility from a genuine second, non-author, non-GM browser session, and `PLAN.md`'s manual QA checklist doesn't call that out explicitly.
- **Evidence:** `tests/` contains exactly 5 files, all covering the pure-logic layer; none of the 6 Foundry-coupled files above have a test counterpart.
- **Found by:** Security & Code Quality specialist; verified.
- **Status:** Partially fixed
- **Status reason:** `render-result.js` and `roll.js` now have test files (`tests/render-result.test.js`, `tests/roll.test.js`) using `vi.stubGlobal`-mocked Foundry globals. `recall-knowledge-dialog.js`'s core roll sequence was extracted into `scripts/roll-sequence.js` and is covered by `tests/roll-sequence.test.js`; the dialog class itself (ApplicationV2 lifecycle/DOM wiring) remains untested by design, consistent with `PLAN.md`. `targeting.js`, `ui/scene-control.js`, and `macro.js` are still uncovered — out of scope for this fix session (developer chose to scope F2 to the files touched by F1/F4/F5 rather than build a full Foundry API stub harness).
- **Status date:** 2026-07-02
- **Status commit:** pending (see fix-architecture session commit)

### [F3] Detectable "tell" in false-info formatting undermines the critical-failure deception
- **Category:** Flaw 30 (Security as an afterthought)
- **Impact:** Medium
- **Explanation:** Real weakness/resistance facts include a numeric value and display label; false facts generated on a critical failure omit both, using the raw type slug with no number. A player could learn "no number = always false" over repeated play, contradicting SPEC.md §6.4's requirement that false info be "presented with the same confidence/formatting as real info."
- **Evidence:** `scripts/data/false-info.js:28` — `text: \`Weak to ${type}\`` (no value/label) vs. `scripts/actor-data.js:41` — `text: \`Weak to ${w.label} ${w.value}\``.
- **Found by:** Security & Code Quality specialist; verified.

### [F4] `#onRollSkill` has no re-entrancy guard and no error isolation across its multi-step, non-atomic sequence
- **Category:** Flaw 19 (Lack of idempotency) — also touches Flaw 26 (poor transactional boundaries), Flaw 27 (temporal coupling), Flaw 12 (hidden side effects)
- **Impact:** Medium
- **Explanation:** A single method chains roll → compute degree → resolve reveal → create two chat messages → read-modify-write a Combat flag → close dialog, with no button-disable/in-flight guard against a fast double-click firing the roll twice, and no try/catch anywhere in the chain — a failure between chat-message creation and the flag write desyncs visible chat state from GM-tracked throttle/identification state with no recovery path. Independently flagged from four different angles by three specialists, consolidated here as one root cause.
- **Evidence:** `scripts/applications/recall-knowledge-dialog.js:94-142` (no try/catch across the whole method); `scripts/repeat-attempts.js:72-87` (`recordAttempt`'s read-modify-write with no lock).
- **Found by:** Coupling & Dependencies, Integration & Data, Error Handling & Observability specialists (4-way cross-specialist agreement); verified.

### [F5] `rollRecallKnowledge` failure paths are unguarded and can throw or silently misclassify a rejection
- **Category:** Flaw 20 (Weak error handling strategy)
- **Impact:** Medium
- **Explanation:** `roll.js` throws a raw, unlocalized `Error` if `game.pf2e.actions.get("recall-knowledge")` is unavailable, and the `action.use(...)` call itself is also unguarded — a rejection (e.g. the user cancelling pf2e's own roll prompt) is indistinguishable from and not caught by the existing "resolved but malformed" branch. The caller awaits with no try/catch, so a thrown error becomes an unhandled promise rejection with no user feedback, unlike the sibling `!rollResult` branch which correctly shows `ui.notifications.error`.
- **Evidence:** `scripts/roll.js:11-13` — `if (!action) { throw new Error(...); }`; `scripts/applications/recall-knowledge-dialog.js:106` — `const rollResult = await rollRecallKnowledge({...})` with no surrounding try/catch.
- **Found by:** Error Handling & Observability specialist; verified.

### [F6] Zero logging/observability anywhere in the module
- **Category:** Flaw 21 (No observability plan) — also touches Flaw 34 (inconsistent error/logging conventions)
- **Impact:** Medium
- **Explanation:** No `console.*` calls exist anywhere in `scripts/`, and no debug setting is registered. Combined with several silent-failure/fallback paths ([F5] and others), there is no way to distinguish "intentional empty result" from "something broke" in a live game without attaching a debugger.
- **Evidence:** `grep -r "console\." scripts/` → no matches.
- **Found by:** Error Handling & Observability specialist; verified.

### [F7] `pickCategoryFact` is dead code in production (superseded export)
- **Category:** Flaw 31 (Dead code / unused dependencies)
- **Impact:** Low
- **Explanation:** Referenced only by its own definition and its own test; production code (`reveal.js`) uses `pickCategoryEntry` instead, added later to also carry the `key` needed for revealed-fact tracking.
- **Evidence:** `scripts/actor-data.js:71-75`; `grep -rn "pickCategoryFact\b"` matches only `actor-data.js` and `tests/actor-data.test.js`.
- **Found by:** Security & Code Quality specialist; verified.

### [F8] Stale/orphaned planning doc with unchecked checkboxes despite the described change being implemented
- **Category:** Flaw 31 (Dead code / unused dependencies)
- **Impact:** Low
- **Explanation:** All 7 step checkboxes are unchecked, yet the described critical-failure identification gating is already implemented (commit `796db6c`) — a confusing artifact for future readers.
- **Evidence:** `docs/superpowers/plans/2026-07-02-critical-failure-identity-consistency.md` — 7× `- [ ]`, 0× `- [x]`.
- **Found by:** Security & Code Quality specialist; verified.

### [F9] Unreachable `?? slug` fallback after `game.i18n.localize()`
- **Category:** Flaw 31 (Dead code / unused dependencies)
- **Impact:** Low
- **Explanation:** `localize()` always returns a string in Foundry (the key itself if untranslated), never `null`/`undefined`, so the trailing `?? slug` branch can never execute.
- **Evidence:** `scripts/applications/recall-knowledge-dialog.js:60` — `statistic?.label ?? game.i18n.localize(...) ?? slug`.
- **Found by:** Security & Code Quality specialist; verified.

### [F10] `resolveReveal`'s `isFalse` field is produced but never read downstream
- **Category:** Flaw 31 (Dead code / unused dependencies)
- **Impact:** Low
- **Explanation:** `isFalse` only appears in `reveal.js`'s own return statements; neither `render-result.js` nor the dialog reads it. Not a functional bug (SPEC.md intentionally renders false facts identically to true ones), but an unused field in an otherwise well-documented contract.
- **Evidence:** `grep -rn "isFalse" scripts/` → all matches confined to `scripts/reveal.js`.
- **Found by:** Integration & Data specialist; verified.

### [F11] Two semantically distinct "10"s in `dc-table.js`, only one named
- **Category:** Flaw 28 (Magic numbers/strings)
- **Impact:** Low
- **Explanation:** The PF2e ±10 critical-step rule is hardcoded as a literal `10` twice, while a separately-named `AVERAGE_D20_ROLL = 10` constant (used for a different purpose, expected-roll estimation) coincidentally shares the value.
- **Evidence:** `scripts/data/dc-table.js:73,75` (`rollTotal >= dc + 10` / `<= dc - 10`) vs. `dc-table.js:98` (`const AVERAGE_D20_ROLL = 10;`).
- **Found by:** Error Handling & Observability specialist; verified.

### [F12] `false-info.js` bypasses `actor-data.js`'s own category accessor
- **Category:** Flaw 6 (Leaky abstractions)
- **Impact:** Low
- **Explanation:** `invertToFalseWeakness`/`invertToFalseResistance` manually map over raw `facts.resistances`/`facts.immunities`/`facts.weaknesses` instead of calling the existing `listCategoryEntries(facts, category)` abstraction already used elsewhere (e.g. `reveal.js`) — partial, inconsistent adoption of the category abstraction.
- **Evidence:** `scripts/data/false-info.js:22-25` vs. `scripts/actor-data.js:39-53` (`listCategoryEntries`).
- **Found by:** Coupling & Dependencies specialist; verified.

### [F13] `computeHiddenDC` called twice independently per roll cycle
- **Category:** Flaw 13 (Inconsistent boundaries)
- **Impact:** Low
- **Explanation:** `_prepareContext()` and `#onRollSkill` each independently recompute the same deterministic value rather than threading a single computed DC through the dialog's lifecycle. No correctness impact today, but no single source of truth for "the current DC" within one dialog instance.
- **Evidence:** `scripts/applications/recall-knowledge-dialog.js:52,118` — `computeHiddenDC(this.#targetActor)` called verbatim at both lines.
- **Found by:** Structure & Boundaries specialist; verified.

### [F14] "Reveal object" shape is an implicit contract shared across 4 files
- **Category:** Flaw 9 (Shotgun surgery)
- **Impact:** Low
- **Explanation:** The `{ baseline, facts, isFalse, revealedKeys }` shape produced by `resolveReveal` is consumed via plain field access across 4 files with no shared type/schema definition — a shape change would require coordinated edits across all of them. Low impact given the module's small size makes this easy to verify by hand.
- **Evidence:** `scripts/reveal.js:29-69` (producer); `scripts/repeat-attempts.js:72-87`, `scripts/applications/recall-knowledge-dialog.js:127-139`, `scripts/chat/render-result.js:17-53` (consumers).
- **Found by:** Structure & Boundaries specialist; verified.

### [F15] Baseline reveal sentence is a hardcoded English string, not routed through `game.i18n`
- **Category:** Flaw 25 (Business logic in the UI — presentation logic embedded in the domain layer)
- **Impact:** Low
- **Explanation:** The domain-logic module builds the actual display sentence (including manual "a"/"an" grammar) directly, unlike every other user-facing string in the module, which goes through `game.i18n.localize` and `lang/en.json`. Breaks localizability for non-English Foundry installs.
- **Evidence:** `scripts/reveal.js:44` — `` `${facts.name} is a${/^[aeiou]/i.test(primaryTrait) ? "n" : ""} ${primaryTrait}.` ``.
- **Found by:** Error Handling & Observability specialist; verified.

## Coverage Checklist

### Flaw/Risk Types 1–34
| # | Type | Status | Finding |
|---|------|--------|---------|
| 1 | Global mutable state | Not observed | — |
| 2 | God object | Not observed | — |
| 3 | Tight coupling | Not observed | — |
| 4 | High/unstable dependencies | Not observed | — |
| 5 | Circular dependencies | Not observed | — |
| 6 | Leaky abstractions | Observed | #F12 |
| 7 | Over-abstraction | Not assessed | — |
| 8 | Premature optimization | Not assessed | — |
| 9 | Shotgun surgery | Observed | #F14 |
| 10 | Feature envy / anemic domain model | Not observed | — |
| 11 | Low cohesion | Not observed | — |
| 12 | Hidden side effects | Observed | #F4 |
| 13 | Inconsistent boundaries | Observed | #F13 |
| 14 | Distributed monolith | Not applicable | Single-process client-side module |
| 15 | Chatty service calls | Not applicable | Single-process client-side module |
| 16 | Synchronous-only integration | Not applicable | Single-process client-side module |
| 17 | No clear ownership of data | Not observed | Combat-flag ownership confirmed clean |
| 18 | Shared database across services | Not applicable | Single-process client-side module |
| 19 | Lack of idempotency | Observed | #F4 |
| 20 | Weak error handling strategy | Observed | #F5 |
| 21 | No observability plan | Observed | #F6 |
| 22 | Configuration sprawl | Not observed | `constants.js` centralized and frozen |
| 23 | Dependency injection misuse | Not observed | — |
| 24 | Inconsistent API contracts | Observed (minor) | #F10 |
| 25 | Business logic in the UI | Observed (reversed: presentation logic in domain layer) | #F15 |
| 26 | Poor transactional boundaries | Observed | #F4 |
| 27 | Temporal coupling | Observed | #F4 |
| 28 | Magic numbers/strings everywhere | Observed (minor) | #F11 |
| 29 | "Utility" dumping ground | Not observed | — |
| 30 | Security as an afterthought | Observed | #F1, #F3 |
| 31 | Dead code / unused dependencies | Observed | #F7, #F8, #F9, #F10 |
| 32 | Missing/inadequate test coverage for critical paths | Observed | #F2 |
| 33 | Hard-coded credentials or secrets in source | Not observed | — |
| 34 | Inconsistent error/logging conventions across services | Observed (minor) | #F6 |

### Strength Categories S1–S14
| # | Category | Status | Finding |
|---|----------|--------|---------|
| S1 | Clear modular boundaries | Observed | #S9 |
| S2 | High cohesion | Observed | (corroborating evidence, folded into #S9) |
| S3 | Loose coupling | Observed | #S8 |
| S4 | Dependency direction is stable | Observed | #S7 |
| S5 | Dependency management hygiene | Not assessed | No build step / minimal `package.json`, not independently re-verified |
| S6 | Consistent API contracts | Observed | (corroborating evidence, see #F10 for the one exception) |
| S7 | Robust error handling | Not observed | See #F4, #F5 |
| S8 | Observability present | Not observed | See #F6 |
| S9 | Configuration discipline | Observed | `constants.js`, `dc-table.js` centralization (not independently re-verified by Verifier) |
| S10 | Security built in | Observed | #S1, #S2, #S3, #S5, #S6 (undermined by #F1, #F3) |
| S11 | Testability & coverage | Observed | #S4 (gap noted at #F2) |
| S12 | Resilience patterns | Observed | Empty-category fallback handling (not independently re-verified by Verifier) |
| S13 | Domain modeling strength | Not assessed | Raised by Structure specialist, folded during verification |
| S14 | Simple, pragmatic abstractions | Observed | #S9 (delegation to pf2e's own live getters) |

## Hotspots

1. `scripts/chat/render-result.js` — home of the Critical-severity finding ([F1]), the single highest-risk file in the module, with zero test coverage.
2. `scripts/applications/recall-knowledge-dialog.js` — the most-coupled file in the repo (highest fan-in); houses the unguarded, non-atomic `#onRollSkill` sequence ([F4]) and the duplicate DC computation ([F13]), while also being a genuine structural strength (thin orchestrator, [S9]).
3. `scripts/roll.js` — the module's most fragile external contract: an undocumented pf2e `message: { create: false }` option is the only thing preventing pf2e's own chat card from leaking the DC, combined with unguarded failure paths ([F5]).

## Next Questions

1. Was the GM-only companion chat message (`render-result.js:48-52`) ever manually verified from a genuine second, non-author GM browser session — or only assumed correct because `whisper` was set?
2. Is the omission of `blind: true` on that message an intentional design choice, or an oversight?
3. Should the Foundry-API-coupled surface (dialog, chat rendering, roll invocation) gain any automated coverage (e.g. via a Foundry API stub), or is manual QA considered sufficient long-term for a module this size?
4. Is the false-info formatting gap (missing numeric values, raw type slugs) intentional, or an oversight from an earlier version of `false-info.js` that predates SPEC.md §6.4's "same confidence/formatting" requirement?
5. Is the currently-unused `reveal.isFalse` field intended for a future GM-facing feature (e.g., showing which fact was a lie), or safe to remove?

## Analysis Metadata

- **Agents dispatched:** 5 specialists (Structure & Boundaries, Coupling & Dependencies, Integration & Data, Error Handling & Observability, Security & Code Quality) + 1 Verifier
- **Scope:** Full repository — 13 script files, 5 test files, 2 templates, `lang/en.json`, CSS, `module.json`, `package.json`, `SPEC.md`, `PLAN.md`
- **Raw findings:** ~58 (before verification)
- **Verified findings:** 24 (15 flaws/risks + 9 strengths)
- **Filtered out:** ~34 (confirmed-absent candidates, cross-specialist duplicates merged into single findings, or below the 60% confidence bar after verification)
- **By impact:** 6 High, 9 Medium, 9 Low
- **Steering files consulted:** None found (no `CLAUDE.md`/`AGENTS.md`)
