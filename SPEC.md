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
    once a check is very hard or has failed, further attempts are fruitless.
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
  v1.
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
  after any **failure or critical failure**. Successes/critical successes
  never block — a character can keep rolling to fish other categories as
  long as they keep succeeding.
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
- List of skills relevant to the target (derived from its traits, plus any
  Lore skills the target's type suggests). The **DC is never shown
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
- **The target's real name is never shown** in the dialog header — the
  dialog always renders before a roll happens, so identity hasn't been
  earned yet. Use a generic placeholder ("Unknown Creature") instead. The
  same applies to the chat message header on Failure/Critical Failure —
  only Success/Critical Success actually earns the identity reveal, and
  that happens through the baseline text itself (§6.3), not a header
  label. Showing the real name unconditionally would leak identity for
  free and override any GM choice to hide a token's nameplate.
- **Identity, once earned, stays known this encounter**: a character who
  identified the target on an earlier attempt (Success/Critical Success)
  must keep seeing the real name in the header on later attempts, even a
  later Critical Failure — a bad roll doesn't erase something already
  learned. This is tracked per (character, target) alongside the
  repeat-attempt throttle state (§6.6), not derived from the current
  attempt's degree alone.

### 6.3 Outcome Resolution
| Degree | Result |
|---|---|
| Critical Success | Always include the baseline name/type confirmation, plus reveal **2** pieces of info: 1 from the chosen category (or, if that category is empty for this target, from a randomly-picked other relevant category), plus 1 more from a **randomly-picked other relevant category** as the "subtler" bonus fact. |
| Success | Always include the baseline name/type confirmation, plus reveal **1** piece of info in the chosen category. If the category is empty for this target, the category-specific part says so explicitly (e.g. "nothing notable in that regard") — the baseline confirmation is still given, so a success never yields zero information. |
| Failure | No information revealed. Chat/dialog clearly says "you recall nothing certain." |
| Critical Failure | **If the target is already identified** (this character earned it on an earlier attempt this encounter): reveal **1 false** piece of info in the chosen category, presented with the same confidence/formatting as real info (player isn't told it's false). **If the target is not yet identified**: treated exactly like Failure — no information revealed at all, real or false. A specific false claim about a creature whose identity is unknown is an inherent tell (RAW itself permits Critical Failure to "give no information, as on a failure"). |

### 6.4 False Information Generation (critical failure)
- **Only applies once the target is already identified** this encounter
  (§6.2/§6.3) — a Critical Failure against a not-yet-identified target
  never reaches this logic at all; it's treated like a Failure instead.
- Generated by **inverting a real fact** about the target (§4): e.g. claim a
  weakness to a damage type it's actually resistant/immune to, or assert a
  trait/immunity it doesn't have. Needs a per-category inversion rule:
  - Weaknesses ↔ Resistances/Immunities: swap direction on an existing
    entry, or assert a weakness to a type the creature actually resists.
  - **Must never contradict a fact already truthfully revealed** to this
    character about this target earlier in the same encounter (tracked
    alongside the repeat-attempt state, §6.6). If the chosen category's
    real material is fully excluded by what's already known, fall back
    through the other categories (still excluding already-known facts);
    if nothing safe remains anywhere, treat that attempt like a Failure
    (no info) rather than force a contradictory or invented lie.
  - Traits: pick a false trait from the same fixed creature-type trait list
    used for skill relevance (§2), excluding traits the target actually
    has, rather than an arbitrary/nonsense trait.
  - **Empty-data fallback**: if the chosen category is Weaknesses or
    Resistances/Immunities but the target has no real entries there to
    invert (nothing to flip), fall back to a false trait instead, so the
    falsehood is always grounded in real data rather than invented from
    nothing.

### 6.5 GM Visibility & Control
- Reveal is **fully automatic** — no GM approval step in the reveal flow
  (§4). The roll happens and the dialog resolves immediately for the
  player.
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
- Concrete policy: block further attempts against that target for the rest
  of the encounter after any **failure or critical failure**. This is the
  module's interpretation of the RAW guidance ("once failed or DC is very
  hard, further attempts are fruitless") — successes/critical successes
  never block.
- The **same per-(character, target) record** also carries: whether the
  character has identified the target (§6.2, stays true once earned) and
  the stable set of true facts already revealed to them (§6.4, so false
  info never contradicts known truth). This isn't optional bookkeeping —
  without it, a later attempt would present the target as unidentified
  again and could invent false info contradicting an earlier true reveal.

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
