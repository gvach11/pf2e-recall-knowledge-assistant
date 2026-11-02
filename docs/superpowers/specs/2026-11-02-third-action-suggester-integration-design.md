# Third Action Suggester → Recall Knowledge Assistant Integration — Design

**Date:** 2026-11-02
**Repos touched:**
- RKA: `D:\FoundryModule\Recall Knowledge Assistant` (id `pf2e-recall-knowledge-assistant`, branch `master`)
- TAS: `D:\FoundryModule\Foundry Module\pf2e-third-action-suggester` (id `pf2e-third-action-suggester`, branch `main`)

## 1. Intent

Third Action Suggester (TAS) shows a panel at the start of a combatant's turn
with rollable action suggestions. Recall Knowledge is one of them, but today
clicking it only whispers a chat reminder telling the player to roll it
themselves. RKA exists to make Recall Knowledge one click: target, pick a
category, roll, get a scoped reveal.

The integration makes the two feel like one product when both are installed:

1. Clicking Recall Knowledge in the TAS panel opens RKA's dialog for the
   character whose turn it is.
2. TAS only suggests Recall Knowledge when an attempt is actually worth it —
   at least one nearby enemy that this character hasn't failed against this
   encounter and still has something left to learn about.

Each module must still work perfectly on its own.

## 2. Goals, non-goals, anti-goals

**Goals**
- TAS routes Recall Knowledge clicks to RKA when RKA can handle them.
- TAS hides the Recall Knowledge suggestion when no nearby enemy is worth an
  attempt for this character.
- RKA publishes a small, versioned public API that TAS (and macros) can use.
- TAS gains an automated test setup (vitest), starting with the integration
  code.

**Non-goals**
- RKA for NPC actors. On an NPC's turn TAS keeps the existing chat reminder;
  RKA stays "player characters only" (SPEC §4).
- Refreshing the TAS panel mid-turn after an RK attempt. The panel is computed
  at turn start; if the player fails and clicks again, RKA's own dialog shows
  the "already attempted" message. (Designer's call — see §8.)
- A target picker inside RKA. Targeting stays Foundry's native Target tool.
- Testing the whole of TAS's `main.js`. Only the new integration file is
  covered now.

**Anti-goals** (would be a failure even if it technically works)
- Any leak RKA works hard to avoid: the TAS panel must never show an
  unidentified enemy's name, the DC, or anything that distinguishes a lie
  from a truth. The suggestion's "why" text never names an enemy.
- TAS breaking, erroring, or losing its current behaviour when RKA is absent,
  disabled, on an older version, or on Foundry v13 (where RKA can't load).
- RKA depending on TAS in any way. The dependency points one way: TAS → RKA.

## 3. Constraints

- RKA: Foundry v14 only, pf2e ≥ 8.1.2. TAS: currently Foundry v13
  minimum/verified; the integration only activates where both run (v14).
- RKA's existing no-argument `openDialog()` is used by the hotbar macro
  (`scripts/macro.js`) and must keep working unchanged.
- All new RKA user-facing strings go through `lang/en.json` under `RKA.*`.
  TAS has a `lang/en.json` but its existing strings are mostly hard-coded;
  follow whatever the surrounding TAS code does.
- RKA's pure-logic rule (live-test plan "Global Constraints"): logic that
  decides things takes plain data; anything touching `game`/`canvas`/`CONFIG`
  sits at the edges and is stubbed with `vi.stubGlobal` in tests. TAS's new
  integration file follows the same rule.
- Attempt state is read from the started Combat's flag
  `flags.pf2e-recall-knowledge-assistant.attempts` via the existing helpers in
  `scripts/repeat-attempts.js`. The status call only *reads*; it never writes,
  so it needs no socket relay and works for players.

## 4. Order of work

0. **Precondition — TAS working tree.** TAS has an uncommitted refactor in
   `scripts/main.js` (drops the unused `weapons` profile field; buckets enemy
   distance/conditions in one pass). Resolve it before starting (see §9).
1. **RKA 0.1.0 pre-release** (release chores only, no code changes): add
   LICENSE (MIT, copy TAS's with the same holder name), README (install,
   usage, settings, AI disclosure — same structure as TAS's), CHANGELOG;
   fill `module.json` `url`/`manifest`/`download` and make `authors` match
   TAS (`Vachna`, `https://github.com/gvach11`); `manifest` points at
   `https://raw.githubusercontent.com/gvach11/pf2e-recall-knowledge-assistant/master/module.json`
   (changed in final review: `releases/latest` skips pre-releases);
   stop tracking `.claude/settings.local.json` and gitignore it; a packaging
   script that zips only `module.json`, `scripts/`, `templates/`, `styles/`,
   `lang/`, `README.md`, `LICENSE`, `CHANGELOG.md`. Publish a GitHub
   **pre-release** `v0.1.0` with the zip and `module.json` attached. Before
   tagging, re-run the live checklist in
   `docs/superpowers/plans/2026-10-29-live-test-bug-fixes.md` Task 10 on HEAD
   (commit `04c85e2` changed lie behaviour after the last live check) and tick
   that plan's boxes.
2. **RKA 0.2.0** — the public API (§5).
3. **TAS 1.1.0** — routing, smarter suggestion, vitest (§6).
4. **Live test** both modules together in Foundry v14 (§7), then release both.
   TAS `module.json` `compatibility.verified` → `"14"` (minimum stays `"13"`).

## 5. RKA 0.2.0 — public API

Exposed at `game.modules.get("pf2e-recall-knowledge-assistant").api`, set in
the `ready` hook as today.

```js
api = {
  apiVersion: 1,
  openDialog({ actor, targetToken } = {}),
  getAttemptStatus({ actor, targetToken }),  // "available" | "blocked" | "exhausted" | "invalid"
}
```

### 5.1 `openDialog({ actor, targetToken } = {})`

- **No arguments**: exactly today's behaviour — target from
  `getValidatedSingleTarget()`, roller from `resolveRollingActor()`.
- **`actor` given**: that actor rolls instead of `resolveRollingActor()`'s
  pick. It must be `type === "character"` and `actor.isOwner` for the current
  user (a GM owns every character, so a GM may open it for a PC). Otherwise:
  warn and don't open. The warning wording is the builder's call; use a new
  `RKA.Warning.*` key rather than reusing `NoRollingActor` ("You don't have a
  character assigned…" would be wrong here).
- **`targetToken` given**: that token is the target instead of the user's
  current targets. It goes through the same checks as the current-target path
  (NPC or hazard only, same warning). To do this, split the per-token check
  out of `getValidatedSingleTarget()` into a reusable function; the
  count-of-targets checks stay where they are.
- **`targetToken` not given**: the user's current targets, validated exactly
  as today (no target / multiple targets / wrong type warnings).
- Returns nothing meaningful; callers don't wait on the dialog.

### 5.2 `getAttemptStatus({ actor, targetToken })`

Read-only. Answers "is another Recall Knowledge attempt by this character
against this token worth making right now?"

- `"invalid"` — actor isn't a character, or the token's actor isn't an NPC or
  hazard, or either is missing.
- `"blocked"` — `isAttemptBlocked(getActiveEncounter(), actor.uuid,
  targetToken.actor.uuid)` is true (failed earlier this encounter).
- `"exhausted"` — the character has nothing left to learn (§5.3).
- `"available"` — anything else, including "no started encounter" (nothing is
  remembered outside an encounter, so everything is still learnable).

Checked in that order. The target key is `targetToken.actor.uuid`, the same
value the dialog and roll sequence already use, so unlinked tokens resolve to
the same flag record.

### 5.3 "Nothing left to learn" (exhausted)

The character's record (`getRevealedFacts`, `isIdentified`) is compared with
the target's real facts (`getActorFacts` + `listCategoryEntries`). The target
is **exhausted** only when the character has identified it **and** every one
of the three categories (`weaknesses`, `resistances`, `traits`) is
exhausted.

A category is exhausted when either:
- `makeFactKey(category, NOTHING_NOTABLE_KEY)` is in the revealed set (a
  Success already reported it empty), **or**
- it has at least one *learnable* entry and every learnable entry's
  `makeFactKey(category, entry.key)` is in the revealed set.

**An empty category the character hasn't asked about is not exhausted**
(decided by the user: learning "it has no weaknesses" is worth an action).
Note that the nothing-notable key is recorded only when the player was shown
"nothing notable" (a Success on an empty category, or a Critical Success that
found nothing anywhere — the latter fixed in final review); a Critical Success
that substituted another category does not record it, so that empty category
stays learnable.

**Learnable entries** must match what `resolveReveal` can actually reveal as
a fact. For `traits` that means excluding the identity trait
(`pickIdentityTrait(facts.traits)`), because the baseline sentence states it
and `resolveReveal` never offers it as the Traits fact. A creature whose only
trait is its identity trait therefore has zero learnable traits, and its
Traits category is exhausted only once a Success there records "nothing
notable".

This comparison is pure: a function taking `(facts, revealedKeys,
identified)` and returning a boolean, unit-tested against the same shapes
`resolveReveal` uses. Tests must include at least one case built by running
`resolveReveal` results into the revealed set, so a future change to what
`resolveReveal` can reveal shows up as a failing test here. Where the
function lives (`reveal.js` next to `resolveReveal`, or a new module) is the
builder's call.

False facts are never recorded (critical-failure reveals return no
`revealedKeys`), so a lie never makes a target look more known than it is.

### 5.4 RKA docs

- SPEC.md: a new section describing the public API and the "exhausted" rule.
- README: a short "For module authors / macros" section listing the API.
- CHANGELOG 0.2.0 entry.

## 6. TAS 1.1.0

### 6.1 New file `scripts/integrations/rka.js`

All TAS knowledge of RKA lives here; `main.js` only calls into it. Suggested
shape (names are the builder's call):

- `getRkaApi()` — returns the API object only if the RKA module is active
  and `api.apiVersion >= 1`; otherwise `null`. Looked up at call time, never
  cached at load (RKA sets its API in `ready`; TAS's own `ready` handler may
  run first).
- `canRouteToRka(actor)` — `getRkaApi()` is non-null and `actor.type ===
  "character"`.
- `hasWorthwhileRecallTarget(actor, nearbyEnemyTokens)` — if
  `canRouteToRka(actor)`: true when some token's
  `getAttemptStatus({ actor, targetToken })` is `"available"`. Otherwise:
  `nearbyEnemyTokens.length > 0` (today's behaviour).
- `openRecallKnowledge(actor)` — calls `api.openDialog({ actor })`. Does not
  pass a target: the user's current Foundry target is used, and RKA shows its
  own warnings if there's none, several, or the wrong kind.

If the API call throws, TAS logs it and falls back to today's behaviour
(chat reminder on click; `hasNearbyEnemy` for the suggestion) — RKA bugs
must never break the TAS panel.

### 6.2 Changes in `main.js`

- `readBattlefieldContext` exposes the nearby enemy tokens it already builds
  (≤ 30 ft, hostile disposition, has an actor) and a new profile flag, e.g.
  `hasWorthwhileRecallTarget`, computed via §6.1. The default (no token / no
  canvas) is `false`, same as `hasNearbyEnemy`.
- The Recall Knowledge rule's condition replaces `p.hasNearbyEnemy` with the
  new flag. The expert-knowledge-skill check stays. The `why` text is
  unchanged and names no enemy.
- `_rollAction("recall-knowledge")`: if `canRouteToRka(this.actor)`, call
  `openRecallKnowledge(this.actor)`; otherwise post the existing
  `CHAT_ACTIONS` reminder unchanged.
- The suggestion's `isChatOnly` flag (which picks the info icon vs the d20
  icon in `suggestion-panel.hbs`) becomes false for Recall Knowledge when it
  will route to RKA, so the button looks rollable.
- `recall-knowledge` stays in `NO_TARGET_ACTIONS`; TAS's generic "select a
  target" check is skipped so RKA's more specific warnings show instead.

### 6.3 Test setup

- Add `package.json` (private, `"type": "module"`, `"test": "vitest run"`,
  vitest devDependency — mirror RKA's) and `node_modules/` in `.gitignore`.
- `tests/integrations/rka.test.js` covering §6.1 with stubbed `game`:
  RKA missing; RKA inactive; RKA active but no `apiVersion` (0.1.0); RKA
  active and current; NPC actor; status combinations (all blocked, all
  exhausted, one available, mix with `"invalid"`); empty enemy list; API that
  throws.
- TAS releases are hand-zipped today. The release zip must now explicitly
  leave out `package.json`, `package-lock.json`, `tests/`, `node_modules/` —
  a small packaging script like RKA's (§4 step 1) is the builder's call.

### 6.4 TAS metadata

- `module.json`: version `1.1.0`; `compatibility.verified` `"14"` after the
  live test; add `relationships.recommends` for
  `pf2e-recall-knowledge-assistant` (type `module`) so Foundry suggests it
  (designer's call — see §8).
- README: a section describing the integration and the fallback.
- CHANGELOG 1.1.0 entry.

## 7. Live verification (Foundry v14, both modules)

With a started encounter, a GM client and a player client:
- Player's turn, RK suggested, click with one enemy targeted → RKA dialog
  opens rolling as the turn's character (not some other selected token).
- Click with no target / two targets → RKA's own warnings, no TAS warning.
- Player fails against the only nearby enemy → on their next turn RK isn't
  suggested.
- Player learns everything about a creature (including "nothing notable" on
  an empty category) → RK isn't suggested on their next turn if that was the
  only nearby enemy; it *is* suggested while an empty category remains
  unasked.
- NPC turn (GM) → RK click posts the chat reminder as before.
- RKA disabled → TAS behaves exactly like 1.0.0 (info icon, chat reminder,
  suggested whenever an enemy is within 30 ft).
- Hotbar macro and scene-control button still open RKA as before.
- Player's panel and chat show no enemy names or DCs.

## 8. Calls made by the designer (not by the user)

- Mid-turn panel refresh is out of scope (§2).
- TAS declares RKA as `recommends`, not `requires` (§6.4).
- `apiVersion` is an integer feature flag, not semver matching.
- "No started encounter" counts as `"available"`.
- `openDialog` with an explicit `actor` refuses non-owned or non-character
  actors rather than silently falling back to `resolveRollingActor()`.
- If an RKA API call throws, TAS falls back silently to today's behaviour
  (logged to console only).
- Accepted side effect: when the suggestion disappears, the player can infer
  they've learned all there is about the nearby enemies. That's the point of
  the feature and reveals nothing beyond "you know it all".

## 9. Left to the builder

- Function and file names inside each repo, beyond the API names in §5.
- Where the "exhausted" pure function lives in RKA.
- Exact wording of new warning strings.
- Whether TAS's packaging is a script or a GitHub Action, and the same for
  RKA.
- Precondition (§4 step 0): whether TAS's uncommitted `main.js` refactor is
  committed or dropped is the user's decision; the builder asks before
  touching TAS.

**Not left to the builder:** pushing to GitHub, creating tags or GitHub
releases, and relaunching the Foundry world for live tests (it disconnects
the user's open client) each need the user's explicit go-ahead at the time.
