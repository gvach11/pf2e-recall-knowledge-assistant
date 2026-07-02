# Design: Critical Failure / Identity Consistency

## Context

The module already guarantees two things (implemented and tested earlier this
session): a target's real name is never shown until a character earns it via
Success/Critical Success, and once earned it stays known for the rest of the
encounter even through a later Critical Failure.

That left a gap: on a character's *first-ever* attempt against a target, if
that attempt is a Critical Failure, the header correctly withholds the name —
but the body still asserted a specific false fact (a weakness/resistance/
trait). "I don't know what this is, but I'm certain about one of its specific
traits" is an inherent tell, independent of wording — it doesn't correspond to
any way a true reveal can look (a true reveal always pairs a fact with the
identity it belongs to).

Two fixes were discussed and rejected before landing here:
- **Give a false type/category guess in both header and body.** Solves the
  immediate tell, but still leaves a header/body seam relative to Failure
  (name-shaped content appears on 3 of 4 degrees, absent only on Failure),
  which is itself a distinguishable pattern across messages.
- **Always reveal the true name on Critical Failure, only the fact is
  false.** Fully internally consistent, but inverts the risk curve: Critical
  Failure would guarantee identity for free (something even a middling
  Failure doesn't give), making the worst roll outcome feel better than an
  ordinary bad one. Also reopens the free-identity-leak problem the earlier
  fix closed.

## Decision

**On Critical Failure, if the character has not already identified the
target this encounter, treat the outcome exactly like a plain Failure** — no
baseline, no fact (true or false), generic "Unknown Creature" header, "you
recall nothing certain" body. Identical output to Failure; nothing to
distinguish them.

**If the character already identified the target** (via an earlier Success/
Critical Success this encounter), Critical Failure keeps its current,
already-correct behavior: real name in the header, one false fact in the
body — guaranteed never to contradict a fact already truthfully revealed
(existing `revealedFacts` exclusion logic).

This is licensed directly by the actual rule text — Critical Failure lets the
GM "answer falsely, **or give no information, as on a failure**" — so folding
the unidentified case into Failure isn't a compromise on the rules, it's
using a branch they already offer. It also means false info only ever
appears mixed in among facts the character already trusts as true, which
arguably makes it a more effective (more dangerous) lie than a guess about a
total stranger creature would have been.

**Important:** the *true* degree of the roll (Critical Failure) is still
recorded for repeat-attempt throttling and shown to the GM — this change
only affects what's *revealed to the player*, not the underlying roll
outcome. A Critical Failure still blocks further attempts against that
target this encounter, same as before.

## Scope of the change

Small, localized to logic already built and tested this session:

- `scripts/reveal.js`'s `resolveReveal()` gains an `alreadyIdentified`
  parameter. When `degree === CRITICAL_FAILURE && !alreadyIdentified`, it
  returns the same shape the Failure branch already returns
  (`{ baseline: null, facts: [], isFalse: false, revealedKeys: [] }`)
  instead of calling into false-info generation.
- `scripts/applications/recall-knowledge-dialog.js` already computes
  `alreadyIdentified` (via `isIdentified()`) for the chat header — it just
  needs to also pass that value into `resolveReveal()`.
- No change needed in `scripts/chat/render-result.js` (header logic already
  correctly resolves to the generic placeholder in this case) or
  `scripts/repeat-attempts.js` (throttling already keys off the true degree,
  untouched).

## Testing

Extend `tests/reveal.test.js`: a Critical Failure with `alreadyIdentified:
false` must return the exact Failure shape (no facts, no baseline). A
Critical Failure with `alreadyIdentified: true` must retain current
behavior (one false, non-contradictory fact). Existing Failure and
already-identified Critical Failure tests continue to guard the unchanged
paths.

## Not doing

- Not persisting or sharing false guesses across different party members —
  out of scope, this design doesn't introduce any false guess at all.
- Not touching plain Failure's behavior — already correct and untouched by
  this change.
