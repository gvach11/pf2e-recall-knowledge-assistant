# Recall Knowledge Assistant — Specification (Draft v0.1)

## 1. Overview

A FoundryVTT module for the **Pathfinder 2e (pf2e)** system that streamlines the
**Recall Knowledge** action. When a player targets an enemy token and opens the
module's dialog, they get:

1. Shows which skills are relevant to the target and the DC each would face.
2. Lets the player pick a skill and roll (or request the GM roll).
3. Reveals a scoped piece of information (weakness, resistance, immunity, trait,
   etc.) based on the degree of success — including deliberately **false**
   information on a critical failure.

Goal: lower the friction of using Recall Knowledge so players reach for it more
often, and make the action feel rewarding rather than a coin-flip for a GM
info-dump.

## 2. Rules Grounding (Archives of Nethys)

- **Recall Knowledge** (basic action, 1 action): pick a skill relevant to the
  subject, ask the GM one question. Outcomes:
  - **Critical Success**: accurate info, plus something subtler (e.g. a
    non-obvious weakness or a reaction trigger).
  - **Success**: accurate info — "a sentence with name, type/category, and
    basic context" (for a creature: one of its best-known attributes).
  - **Failure**: no information.
  - **Critical Failure**: GM may answer **falsely**, or give no information.
  - Follow-up attempts on the same subject should get progressively harder;
    once a character has attempted an incredibly hard check or failed a
    check, further attempts are fruitless (GM Core pg. 54, "Additional
    Knowledge").
  [Source: Recall Knowledge rules](https://2e.aonprd.com/Rules.aspx?ID=2638), [Recall Knowledge action](https://2e.aonprd.com/Actions.aspx?ID=2367)

- **DC**: for a creature (has a level), use the **level-based DC**, adjusted
  for rarity. [Source: Level-Based DCs](https://2e.aonprd.com/Rules.aspx?ID=2629)

  | Level | DC | Level | DC | Level | DC |
  |---|---|---|---|---|---|
  | 0 | 14 | 9 | 26 | 18 | 38 |
  | 1 | 15 | 10 | 27 | 19 | 39 |
  | 2 | 16 | 11 | 28 | 20 | 40 |
  | 3 | 18 | 12 | 30 | 21 | 42 |
  | 4 | 19 | 13 | 31 | 22 | 44 |
  | 5 | 20 | 14 | 32 | 23 | 46 |
  | 6 | 22 | 15 | 34 | 24 | 48 |
  | 7 | 23 | 16 | 35 | 25 | 50 |
  | 8 | 24 | 17 | 36 | | |

  Rarity adjustment (standard GM Core guidance): Uncommon +2, Rare +5,
  Unique +10 (applied on top of the level DC).

- **Skill-to-trait mapping** for creature identification (AoN table), e.g.
  Aberration → Occultism, Animal → Nature, Astral/Beast/Dragon → Arcana or
  Nature depending on type, Fungus/Plant → Nature, Undead → Religion,
  Humanoid → Society, Construct → Crafting or Occultism, Fiend → Religion,
  Celestial → Religion, etc. Some creatures are identifiable by more than one
  skill; Lore skills specific to the creature type always apply.

- **Lore DCs**: an applicable Lore uses an easier DC than the standard one —
  **easy** or **very easy**, at the GM's discretion. pf2e computes both on
  NPCs (`identificationDCs.lore`), rarity included. RKA's handling is §6.8.

## 3. Technical Foundation (pf2e system / Foundry API)

- The pf2e system already ships a built-in Recall Knowledge action usable as:
  `game.pf2e.actions.get('recall-knowledge').use({ statistic: 'society' })`
  — this rolls the check and posts a chat card. **We use it only to get the
  roll** (so bonus/modifier math stays aligned with system updates), but we
  do **not** let it post its default chat card or pass it the DC — that
  card would print the DC and degree-of-success directly, which conflicts
  with the "DC is never shown" decision (§4). Instead: take the raw roll
  total, compute degree-of-success ourselves against the hidden DC, and
  render our own result message.
  [Source: pf2e Recall Knowledge action macro](https://github.com/foundryvtt/pf2e/issues/15214)
- Target actor data of interest lives under `actor.system`:
  - `system.attributes.weaknesses[]` — `{ type, value, exceptions? }`
  - `system.attributes.resistances[]` — `{ type, value, exceptions? }`
  - `system.attributes.immunities[]` — `{ type, exceptions? }`
  - `system.traits.value[]` — creature traits (used for skill-relevance
    lookup and for revealing "traits" as an info category)
  - `system.skills` — the *rolling* actor's (PC's) proficiencies, used to
    compute which skills they can even attempt and their bonus.
- UI entry point note: clicking a token does **not**, by default, give
  players any HUD for tokens they don't own/have at least Observer
  permission on — the core `TokenHUD` (via `renderTokenHUD`) only renders
  for controllable/owned tokens, and enemy tokens are normally "none"
  permission for players. This is why the module uses the **Target** flow
  instead (§4) rather than hooking token clicks/HUD directly.
- Existing prior art to be aware of / differentiate from: **PF2e Workbench**
  (has a "Recall Knowledge" chat-button feature with optional trait list),
  **PF2e Toolbelt** (absorbed the old PF2e Npc Knowledges module), **PF2e See
  Simple Scale Statistics** (shows GM where a stat falls on a scale). None of
  these appear to do player-facing, token-click-triggered, category-scoped
  reveals with critical-failure false information — that's this module's
  niche.

## 4. Key Decisions (resolved)

- **Trigger UX**: Use Foundry's native **Target** tool. The player targets an
  enemy token, then opens the Recall Knowledge dialog via a persistent UI
  button / hotbar macro (acting on `game.user.targets`). No permission
  workarounds, no core HUD overrides.
- **False information (critical failure)**: Generated by **inverting a real
  fact** about the target itself — e.g. claim a weakness for a damage type
  it's actually resistant/immune to, or assert a trait/immunity it doesn't
  have that's plausible for its type. No external lookup table or authored
  decoy pool needed for v1.
- **Reveal scope (v1)**: Strict RAW scope — **Weaknesses, Resistances/
  Immunities, and Traits only**. Saves/Speed/Special Abilities are out of
  scope for v1 (candidate for a later version).
- **Target version**: **Foundry VTT v14** (current version) and its
  corresponding pf2e system release. No legacy-version support in v1.
- **Who rolls**: **Only the clicking/targeting player** rolls their own
  check. No group/party check variant in v1.
- **Empty-category fallback**: On a **success**, if the chosen category has
  nothing to reveal for that target, say so explicitly ("nothing notable in
  that regard") rather than silently failing or reassigning the category.
  On a **critical success**, if the chosen category is empty (or as the
  bonus reveal), **randomly pick one of the other relevant categories** to
  reveal instead, so a critical success always yields something useful.
- **GM approval**: **Fully automatic reveal** — no GM-gated approval step in
  v1. The one GM step is *before* a Lore roll, deciding whether that Lore
  applies and how easy it is (§6.8); the reveal after any roll stays
  automatic.
- **Roll execution**: Use the pf2e system's built-in Recall Knowledge action
  to roll (for correct, up-to-date bonus math), but never let it post its
  own chat card or receive the DC. We read back the raw roll total, compare
  it to the hidden DC ourselves, and render our own result message. This is
  what keeps the DC from ever leaking to the player.
- **Target restrictions**: Only actors of type **`npc`** or **`hazard`** are
  valid targets (PCs and other actor types are excluded outright). Exactly
  **one** target must be selected (via `game.user.targets`) — if zero or
  more than one token is targeted, show a warning and don't open the
  dialog.
- **Baseline success info**: A plain success or critical success **always**
  includes a baseline name/type confirmation (matching the RAW guarantee in
  §2), in addition to the category-specific reveal. "Nothing notable in
  that regard" (§6.3) only ever applies to the category-specific part of
  the result, never to the whole outcome — a success can never yield zero
  information.
- **Repeat-attempt scope**: Tracked per (rolling character, target) for the
  duration of the active **encounter** (combat), stored as a flag on the
  combat/encounter data so it survives reloads and clears automatically
  when that combat ends. Outside of combat, no throttling applies. Keyed
  by the **acting character's actor**, not the Foundry user/login — Recall
  Knowledge represents a character's own memory, so one player controlling
  multiple PCs must not have one character's failure block another's
  attempt.
- **Repeat-attempt throttle policy**: A character is blocked from further
  attempts against the same target, for the rest of the active encounter,
  after any **failure or critical failure**, or — with **harder follow-ups**
  on (the default, §6.6) — after its incredibly hard fourth attempt. Each
  follow-up is a step harder than the last. With harder follow-ups off,
  successes never block and every attempt is at the normal DC (the 1.1
  behavior).
- **Per-NPC override/blacklist**: Deferred out of v1 (see §8 Out of Scope).
  A GM can control what's revealed today simply by what they put in an
  NPC's Weakness/Resistance/Immunity/Trait fields.
- **False-trait selection (critical failure)**: When inventing a false
  trait, pick from the same fixed creature-type trait list already used
  for skill relevance (§2's skill-to-trait table — Aberration, Animal,
  Undead, Fiend, etc.), excluding whichever the target actually has. This
  reuses existing data instead of needing a new "plausible confusion"
  table.

## 5. User Stories

- As a **player**, when I target an enemy token and hit the Recall Knowledge
  button, I want a dialog for it, so I don't have to remember the rule or
  ask the GM to adjudicate manually every time.
- As a **player**, I want to see which of my skills apply and roughly how
  hard the check will be, so I can choose intelligently (or decide it's not
  worth the action).
- As a **player**, I want to choose *what kind* of information I'm fishing
  for (weakness, resistance/immunity, trait, etc.), so the reveal is useful
  and not a random firehose.
- As a **player**, on a critical success I want *more* than on a success
  (two facts vs. one), rewarding good rolls.
- As a **player**, on a critical failure I want to be told something
  confident-sounding but wrong, so bad rolls carry a real risk instead of
  just "nothing happens."
- As a **player** with a Lore skill (including a custom one), I want to try
  it against a target and have the GM rule on whether it applies, so my
  character's specialist knowledge counts without me arguing the case out
  of game.
- As a **GM**, when a player tries a Lore, I want a quick popup to decline it
  or allow it at an easy or very easy DC, so I adjudicate in one click and
  the roll then runs as normal.
- As a **GM**, I want some way to keep the module from spoiling a homebrew
  NPC's twist. In v1, the only control I have is what I put in an NPC's
  Weakness/Resistance/Immunity/Trait fields — reveal itself is automatic,
  and per-NPC overrides/blacklisting are planned for a later phase (§8).

## 6. Functional Requirements

### 6.1 Trigger
- Player selects a target via Foundry's native Target tool, then opens the
  **Recall Knowledge dialog** via a persistent UI button / hotbar macro,
  which reads `game.user.targets` for the current target.
- Valid targets are actors of type **`npc`** or **`hazard`** only (PCs and
  any other actor type are excluded).
- Exactly **one** target must be selected. If zero or more than one token
  is targeted, show a warning ("target exactly one creature or hazard
  first") instead of opening the dialog.

### 6.2 Dialog Contents
- List of skills relevant to the target (derived from its traits), followed
  by every Lore skill the character has, which the GM rules on (§6.8). The **DC is never shown
  explicitly** — showing a raw number invites metagaming (comparing it to
  known creature stat blocks) instead of an in-fiction guess. Each skill
  instead shows a qualitative **likelihood** label, computed from the
  character's modifier in that skill vs. the target's (hidden) DC:
  - **Untrained** in the skill: always shown as "Unfamiliar — you're
    unlikely to recall anything reliable," regardless of the numeric
    modifier, since RAW untrained Recall Knowledge is rarely reliable.
  - **Trained+**: the DC has to be beaten by (roll + modifier), not by the
    modifier alone, so bucket by an **expected roll total** — modifier plus
    an average d20 roll (~10) — compared to the DC, not modifier vs. DC
    directly:
    - Expected total `>= DC`: "Confident" (succeeds on an average roll)
    - Expected total `DC-1` down to `DC-9`: "Uncertain" (fails on average,
      not critically)
    - Expected total `<= DC-10`: "Unfamiliar" (critically fails even on an
      average roll)
  - Exact bucket boundaries/labels are a tuning detail for the
    implementation plan, not fixed here — the requirement is *qualitative
    only*, never a bare number.
- **Information category** selector: Weaknesses, Resistances/Immunities,
  Traits (strict RAW scope per §4 — no Saves/Speed/Special Abilities in v1).
- A Roll button that invokes the check (via the system's built-in Recall
  Knowledge action, per §4 "Roll execution") and then resolves the reveal
  based on the result, computed against the hidden DC ourselves.
- **The target's real name isn't shown** in the dialog header until this
  character has identified it (see the next point): a first attempt hasn't
  earned identity yet, so it shows a generic placeholder ("Unknown
  Creature" / "Unknown Hazard"). A follow-up after a Success shows the real
  name, matching what the chat already told the player. The same applies
  to the chat message header on Failure/Critical Failure —
  only Success/Critical Success actually earns the identity reveal, and
  that happens through the baseline text itself (§6.3), not a header
  label. Showing the real name unconditionally would leak identity for
  free and override any GM choice to hide a token's nameplate.
- **Identity, once earned, stays known this encounter**: a character who
  identified the target on an earlier attempt (Success/Critical Success)
  must keep seeing the real name in the dialog and chat headers on later
  attempts, even after a later Critical Failure — a bad roll doesn't erase something already
  learned. This is tracked per (character, target) alongside the
  repeat-attempt throttle state (§6.6), not derived from the current
  attempt's degree alone.

### 6.3 Outcome Resolution
| Degree | Result |
|---|---|
| Critical Success | Always include the baseline name/type confirmation, plus reveal **2** pieces of info: 1 from the chosen category (or, if that category is empty for this target, from a randomly-picked other relevant category), plus 1 more from a **randomly-picked other relevant category** as the "subtler" bonus fact. |
| Success | Always include the baseline name/type confirmation, plus reveal **1** piece of info in the chosen category. If the category is empty for this target, the category-specific part says so explicitly (e.g. "nothing notable in that regard") — the baseline confirmation is still given, so a success never yields zero information. |
| Failure | No information revealed. Chat/dialog clearly says "you recall nothing certain." |
| Critical Failure | **If the target is already identified** (this character earned it on an earlier attempt this encounter): the result is shaped **exactly like a Success** — the same true baseline name/type confirmation, plus **1 false** piece of info in the chosen category (player isn't told it's false). If no safe false fact exists in the chosen category (§6.4), the category-specific part says "nothing notable in that regard", just as an empty Success does; it never answers a different category. **If the target is not yet identified**: treated exactly like Failure — no information revealed at all, real or false. A specific false claim about a creature whose identity is unknown is an inherent tell (RAW itself permits Critical Failure to "give no information, as on a failure"). |

### 6.4 False Information Generation (critical failure)
- **Only applies once the target is already identified** this encounter
  (§6.2/§6.3) — a Critical Failure against a not-yet-identified target
  never reaches this logic at all; it's treated like a Failure instead.
- Generated by **inverting a real fact** about the target (§4): e.g. claim a
  weakness to a damage type it's actually resistant/immune to, or assert a
  trait/immunity it doesn't have. Needs a per-category inversion rule:
  - Weaknesses ↔ Resistances/Immunities: swap direction on an existing
    entry, or assert a weakness to a type the creature actually resists.
    Only types pf2e itself recognizes as weakness (resp. resistance)
    types qualify — many immunities are conditions or effects
    ("unconscious", "death effects") that no creature can be weak to, and
    a lie built from one would be an obvious tell.
  - **Must never contradict a fact already truthfully revealed** to this
    character about this target earlier in the same encounter (tracked
    alongside the repeat-attempt state, §6.6). That includes a Success's
    "nothing notable in that regard": once a category was reported empty,
    a later lie there stays "nothing notable". Conversely, if no safe lie
    exists but the character already knows a true fact in that category,
    the lie repeats that true fact rather than claim "nothing notable".
  - Traits: pick a false trait from the same fixed creature-type trait list
    used for skill relevance (§2), excluding traits the target actually
    has, rather than an arbitrary/nonsense trait.
  - **Stays in the chosen category.** If the chosen category has nothing
    safe to invert (empty, no believable type, or everything already
    known), the lie is "nothing notable in that regard" with the usual
    baseline — never a fact from another category, since a Success never
    answers a different category and doing so would expose the lie.

### 6.5 GM Visibility & Control
- Reveal is **fully automatic** — no GM approval step in the reveal flow
  (§4). The roll happens and the dialog resolves immediately for the
  player. (A Lore roll needs the GM's go-ahead *before* it is rolled,
  §6.8; once rolled, it resolves the same way.)
- GM should still be able to see the true roll and true result regardless
  of outcome (e.g., a GM-only chat flavor line, or a toggle for "blind GM").
- No per-NPC override/blacklist in v1 — deferred (§8 Out of Scope).

### 6.6 Repeat Attempts
- Track prior Recall Knowledge attempts per (rolling character's actor,
  target) pair for the duration of the active **encounter**, stored as a
  flag on the combat/encounter data (survives reloads, clears automatically
  when that combat ends). No throttling outside of an active encounter.
  Keyed by the acting character, not the Foundry user/login, so a player
  controlling multiple PCs gets independent throttling per character.
- **Which encounter**: the started combat the **target** is a combatant
  in (matched by the target's actor uuid, the same key attempts use) — not
  whichever combat a user's tracker happens to show. A target that isn't in
  any started combat is "outside an encounter": no throttling, nothing
  recorded. If several started combats contain the target, prefer the one
  the tracker shows (`game.combat`), otherwise the first found. This keeps a
  forgotten old encounter from catching rolls meant for a different fight
  or made outside combat.
- Concrete policy: block further attempts against that target for the rest
  of the encounter after any **failure or critical failure**.
- **Harder follow-ups** (world setting "Harder follow-up attempts", on by
  default): GM Core pg. 54 raises the DC for each follow-up, and after an
  incredibly hard attempt further ones are fruitless. Each attempt this
  character has already made against this target this encounter raises
  the next one a step: the 1st is at the normal DC, the 2nd hard (+2), the
  3rd very hard (+5), the 4th incredibly hard (+10), and after the 4th the
  character is blocked just as after a failure. The step is added to
  whatever DC the attempt would otherwise have (rarity and, for a Lore, the
  GM's ease included); it's counted from the record's attempt count, so
  only completed rolls count — a cancelled roll or declined Lore doesn't.
  Outside an encounter nothing is counted, so every attempt is normal. The
  setting is read on every check, so turning it off mid-encounter restores
  the normal DC (and lifts the attempt cap) right away; failures still
  block either way.
- Player-facing: the dialog says a follow-up is harder, never by how much;
  the DC stays hidden (§6.5). The GM-only detail message names the step,
  and the GM's Lore popup (§6.8) shows both DCs already raised.
- The **same per-(character, target) record** also carries: whether the
  character has identified the target (§6.2, stays true once earned) and
  the stable set of true facts already revealed to them (§6.4, so false
  info never contradicts known truth). This isn't optional bookkeeping —
  without it, a later attempt would present the target as unidentified
  again and could invent false info contradicting an earlier true reveal.

### 6.7 Public API
Published in the `ready` hook at
`game.modules.get("pf2e-recall-knowledge-assistant").api`, for macros and
other modules (first consumer: Third Action Suggester). RKA never depends on
any of them.

```js
api = {
  apiVersion: 1,
  openDialog({ actor, targetToken } = {}),
  getAttemptStatus({ actor, targetToken }),  // "available" | "blocked" | "exhausted" | "invalid"
}
```

- **`apiVersion`**: an integer feature flag. Callers check
  `api.apiVersion >= 1`; it changes only when callers must detect a change.
- **`openDialog`** with no arguments is the scene button / macro behaviour
  (§6.1): the user's single current target, rolled by `resolveRollingActor()`.
  A given `targetToken` replaces the user's targets and gets the same
  NPC/Hazard check. A given `actor` replaces the automatic roller pick; it
  must be a character the user owns (a GM owns every character), otherwise
  the user is warned and the dialog doesn't open. It is never silently
  swapped for another actor.
- **`getAttemptStatus`** is read-only and answers, in this order:
  - `"invalid"`: the actor isn't a character, or the token's actor isn't an
    NPC or Hazard (or either is missing);
  - `"blocked"`: this character failed against this target earlier this
    encounter, or has made its last (incredibly hard) follow-up (§6.6);
  - `"exhausted"`: this character has nothing left to learn about it (below);
  - `"available"`: anything else, including no started encounter, since
    nothing is remembered outside one.

  The target is keyed by `targetToken.actor.uuid`, as the dialog does, so
  each unlinked token is its own target.

**Nothing left to learn** ("exhausted"): the character has identified the
target **and** every category is answered. A category is answered when a
Success there reported "nothing notable", or when it has at least one
learnable fact and every learnable fact is known. Learnable facts are the
ones a reveal can actually show (§6.3): for Traits, that excludes the
identity trait, which the baseline sentence states instead. **An empty
category nobody has asked about still counts as learnable**: learning "it has
no weaknesses" is worth an action. "Nothing notable" is recorded whenever the
player was shown it: by a Success on an empty category, or by a Critical
Success that found nothing in any category. A Critical Success that switched
away from an empty category to reveal something else doesn't record it, so
that category stays learnable. Lies are never recorded (§6.4), so
a critical failure never makes a target look more known than it is.

**Accepted trade-off (RAW over secrecy):** a Critical Failure lie on an
identified target blocks further attempts like any failure (§6.6), while a
Success only does as the last follow-up. A caller that hides Recall Knowledge for `"blocked"`
targets therefore lets a player infer that a Success-looking result was a
lie, as reopening the dialog already does. Kept deliberately to follow RAW.

**Known limitations (accepted):**
- *Unlinked PC tokens.* Records are keyed by the rolling actor's uuid; an
  unlinked PC token has its own actor, so it and the assigned character keep
  separate records. Unlinked PC tokens are a pf2e setup mistake.

### 6.8 Lore Skills (GM-approved)
Whether a Lore applies to a target is a GM ruling (RAW), and custom Lores
("Gravedigger Lore", "Lore of House Varn") can't be matched to traits by
code. So RKA doesn't guess: every Lore goes to the GM, who declines it or
allows it at one of pf2e's two Lore DCs (§2). After an approval the roll
behaves exactly like any other skill's.

**Player dialog**
- Below the regular skills, list **every Lore skill the character has**
  (pf2e lore statistics, any rank), labelled **"GM decides"** in place of a
  likelihood. No likelihood is computed for Lores, and Lores are never
  pulled into the regular list even if pf2e names them for a target.
- Choosing a Lore and pressing Roll **does not roll**. It sends a request to
  the active GM and puts the dialog in a **waiting** state: "Waiting for the
  GM…" with a **Cancel** button; the skill, category and Roll controls are
  disabled until the wait ends.
- The usual repeat-attempt block (§6.6) applies before asking: a blocked
  character can't send a Lore request either.
- **No active GM**: Lore entries are shown but disabled, with a tooltip
  saying a GM must be connected to rule on Lore.

**GM popup**
- Opens on the **active GM's** client only (`game.users.activeGM`). It
  shows the character's name, the Lore, the category being asked about,
  and the target's **real** name and token art (the GM sees all of it
  anyway).
- Three buttons: **Decline**, **Easy (DC X)**, **Very easy (DC Y)**. The GM
  sees the numbers; the player never does.
- Closing the popup without choosing counts as **Decline**.
- Each request gets its own popup; two players asking at once get two.

**DCs**
- NPCs: read from pf2e's `identificationDCs.lore` (easy first, very easy
  second), the same live getter the standard DC comes from (§3).
- Hazards: pf2e doesn't compute these, so RKA mirrors pf2e's rule —
  rarity and ease are combined as steps on pf2e's DC-adjustment scale
  (incredibly easy −10, very easy −5, easy −2, normal 0, hard +2, very hard
  +5, incredibly hard +10), clamped to its ends, then applied to the level
  DC. E.g. a rare hazard's easy Lore DC is level DC +2, not +5−2.
- The GM's reply names the ease (`easy` / `very-easy`), not a number; the
  player's client computes the DC itself, as it already does for the
  standard DC.

**Outcomes**
- **Allowed**: the dialog leaves the waiting state and the roll runs
  exactly as for any other skill (§6.3–§6.6), against the chosen DC: same
  reveal, chat card, attempt record and block-on-failure. The GM-only chat
  detail notes that it was a Lore roll and which ease was chosen.
- **Declined**: the player is told the GM ruled that this Lore doesn't help
  here, and the dialog returns to normal. **A decline doesn't count as an
  attempt** — nothing was rolled, so nothing is recorded and the player can
  pick another skill.
- **Approval doesn't carry over**: every Lore roll asks again, even for the
  same Lore and target later in the encounter.
- **Cancelled** (player presses Cancel or closes the dialog): the GM's
  popup for that request closes, and nothing is recorded.
- **GM disconnects** while a request is waiting (or the active GM changes):
  the wait ends as if cancelled, and the player is told the GM is no
  longer available.
- If the player then cancels pf2e's own Check Modifiers dialog, it's the
  existing "cancelled" outcome: nothing recorded, and the next Lore roll
  asks again.

**GM rolling for a character**: when the requester is the active GM
(e.g. through `openDialog({ actor })`, §6.7), there's no round trip: the
same Decline / Easy / Very easy choice is shown locally and the roll
follows.

**Messages and trust** (same socket and checks as the attempt relay):
- Request (player → GM): request id, rolling actor, target actor and
  target token (the token is what the popup's art comes from), Lore slug,
  category. The GM acts only if the sender owns the rolling actor and it
  has that Lore; a request that fails these checks is dropped silently
  (the player can still Cancel).
- Reply (GM → player): request id and decision. The player's client acts
  only on a reply for the request it's waiting on, from the user who is
  currently the active GM. Stale or unknown ids are ignored.
- Cancel (player → GM): request id; closes that popup.

**Unchanged**: the public API (§6.7) — `getAttemptStatus` and `apiVersion`
are unaffected, since what's left to learn doesn't depend on which skill is
used.

**Designer's calls** (not discussed with the user; easy to revisit):
- The player is never told which ease the GM picked, only that the Lore
  was allowed — the ease is a near-direct DC hint.
- The dialog redraws its Lore entries live when a GM connects or
  disconnects, so they enable/disable without reopening.
- After an approval, the original Roll click is passed on to pf2e as for
  any skill, so modifier keys (e.g. skipping the Check Modifiers dialog)
  still work.
- The socket handler currently acts only on the active GM's client;
  replies and cancels need routing to the right client. How is left to
  the builder.

**Verified against pf2e** (installed system source, 2026-11-03):
`identificationDCs.lore` is `[easy, very-easy]`, and pf2e combines rarity
and ease by adding their positions on the 7-step scale (normal at the
middle) and clamping, which is the hazard rule above. **To confirm live
while building**: the built-in recall-knowledge action accepts a Lore
statistic slug (e.g. `undead-lore`) as `statistic`.

## 7. Open Questions

None outstanding — all resolved into §4 Key Decisions.

## 8. Out of Scope (v1)

- Non-PF2e systems.
- Saves, Speed, and Special Ability/spellcasting reveals (per §4 scope
  decision).
- Automatic narrative generation via LLM (false info is rule-based
  inversion, not AI-generated, for v1).
- Mobile/touch-specific input handling beyond whatever Foundry's canvas
  already provides.
- **Per-NPC override/blacklist** for GM-controlled exclusion of specific
  actors/facts from reveals — deferred to a later phase (candidate v1.1).
  In v1, a GM controls this only by what they put in an NPC's Weakness/
  Resistance/Immunity/Trait fields.

## 9. Next Steps

- ✅ Reviewed via `paad:pushback` — all findings resolved into §4 Key
  Decisions and the functional requirements above.
- Turn this spec into an implementation plan (Plan mode) and check
  plan/spec alignment with `paad:alignment`.
