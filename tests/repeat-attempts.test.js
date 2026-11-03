import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCombat } from "./helpers/fake-combat.js";
import {
  attemptKey,
  shouldBlockAfter,
  isAttemptBlocked,
  recordAttempt,
  isIdentified,
  getRevealedFacts,
  getEncounterFor,
  getFollowUpStep,
} from "../scripts/repeat-attempts.js";
import { DEGREES, MODULE_ID, SETTINGS } from "../scripts/constants.js";

// The "harder follow-ups" world setting, as game.settings would answer it.
function stubHarderFollowUps(enabled) {
  vi.stubGlobal("game", {
    settings: { get: (scope, key) => (scope === MODULE_ID && key === SETTINGS.HARDER_FOLLOW_UPS ? enabled : undefined) },
  });
}

beforeEach(() => {
  stubHarderFollowUps(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attemptKey", () => {
  it("produces a flag-path-safe key with no dots", () => {
    const key = attemptKey("Actor.pc.1", "Actor.abc.123");
    expect(key).not.toContain(".");
  });
});

describe("shouldBlockAfter", () => {
  it("blocks after failure or critical failure only", () => {
    expect(shouldBlockAfter(DEGREES.FAILURE)).toBe(true);
    expect(shouldBlockAfter(DEGREES.CRITICAL_FAILURE)).toBe(true);
    expect(shouldBlockAfter(DEGREES.SUCCESS)).toBe(false);
    expect(shouldBlockAfter(DEGREES.CRITICAL_SUCCESS)).toBe(false);
  });
});


const PC_1 = "Actor.pc1";
const PC_2 = "Actor.pc2";
const TARGET_1 = "Actor.target1";
const TARGET_2 = "Actor.target2";

describe("isAttemptBlocked / recordAttempt", () => {
  it("is never blocked with no active combat", () => {
    expect(isAttemptBlocked(null, PC_1, TARGET_1)).toBe(false);
  });

  it("is not blocked before any attempt is recorded", () => {
    const combat = createFakeCombat();
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(false);
  });

  it("stays unblocked after a success, and blocks after a failure", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(false);

    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.FAILURE);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(true);
  });

  it("keeps different targets independent for the same character", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_FAILURE);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(true);
    expect(isAttemptBlocked(combat, PC_1, TARGET_2)).toBe(false);
  });

  it("does not let one party member's critical failure block another party member (even under the same Foundry login)", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_FAILURE);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(true);
    // PC_2 is a different character rolling against the same target — must
    // stay unblocked regardless of which human/login controls it.
    expect(isAttemptBlocked(combat, PC_2, TARGET_1)).toBe(false);
  });

  it("recording one character's attempt never overwrites another character's record written at the same moment", async () => {
    // Two players' attempts relayed to the GM together: both writes are in
    // flight before either lands, so a whole-map write would drop one.
    const combat = createFakeCombat();
    await Promise.all([
      recordAttempt(combat, PC_1, TARGET_1, DEGREES.FAILURE),
      recordAttempt(combat, PC_2, TARGET_1, DEGREES.SUCCESS),
    ]);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(true);
    expect(isIdentified(combat, PC_2, TARGET_1)).toBe(true);
  });
});

describe("harder follow-ups (GM Core pg. 54)", () => {
  async function succeed(combat, times) {
    for (let i = 0; i < times; i++) await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS);
  }

  it("starts at the normal DC, with or without an encounter", () => {
    expect(getFollowUpStep(null, PC_1, TARGET_1)).toBe("normal");
    expect(getFollowUpStep(createFakeCombat(), PC_1, TARGET_1)).toBe("normal");
  });

  it("makes each follow-up a step harder: hard, very hard, then incredibly hard", async () => {
    const combat = createFakeCombat();
    await succeed(combat, 1);
    expect(getFollowUpStep(combat, PC_1, TARGET_1)).toBe("hard");
    await succeed(combat, 1);
    expect(getFollowUpStep(combat, PC_1, TARGET_1)).toBe("very-hard");
    await succeed(combat, 1);
    expect(getFollowUpStep(combat, PC_1, TARGET_1)).toBe("incredibly-hard");
  });

  it("blocks further attempts once an incredibly hard one has been made", async () => {
    const combat = createFakeCombat();
    await succeed(combat, 3);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(false);
    await succeed(combat, 1);
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(true);
  });

  it("counts each character's attempts at each target separately", async () => {
    const combat = createFakeCombat();
    await succeed(combat, 2);
    expect(getFollowUpStep(combat, PC_2, TARGET_1)).toBe("normal");
    expect(getFollowUpStep(combat, PC_1, TARGET_2)).toBe("normal");
  });

  it("keeps every attempt at the normal DC, never running out, when the setting is off", async () => {
    stubHarderFollowUps(false);
    const combat = createFakeCombat();
    await succeed(combat, 5);
    expect(getFollowUpStep(combat, PC_1, TARGET_1)).toBe("normal");
    expect(isAttemptBlocked(combat, PC_1, TARGET_1)).toBe(false);
  });
});

describe("isIdentified", () => {
  it("is false with no active combat or before any attempt", () => {
    expect(isIdentified(null, PC_1, TARGET_1)).toBe(false);
    const combat = createFakeCombat();
    expect(isIdentified(combat, PC_1, TARGET_1)).toBe(false);
  });

  it("becomes true after a Success or Critical Success", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS);
    expect(isIdentified(combat, PC_1, TARGET_1)).toBe(true);
  });

  it("stays false after a Failure or Critical Failure", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_FAILURE);
    expect(isIdentified(combat, PC_1, TARGET_1)).toBe(false);
  });

  it("regression: stays true on a later Critical Failure once already identified", async () => {
    // Reported bug: crit-success identified the target, then a later
    // critical failure made the chat header revert to "Unknown Creature".
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_SUCCESS);
    expect(isIdentified(combat, PC_1, TARGET_1)).toBe(true);

    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_FAILURE);
    expect(isIdentified(combat, PC_1, TARGET_1)).toBe(true);
  });

  it("is independent per character and per target", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS);
    expect(isIdentified(combat, PC_1, TARGET_2)).toBe(false);
    expect(isIdentified(combat, PC_2, TARGET_1)).toBe(false);
  });
});

describe("getRevealedFacts / recordAttempt revealed-key tracking", () => {
  it("is empty before any attempt", () => {
    expect(getRevealedFacts(null, PC_1, TARGET_1)).toEqual([]);
    const combat = createFakeCombat();
    expect(getRevealedFacts(combat, PC_1, TARGET_1)).toEqual([]);
  });

  it("accumulates keys across multiple attempts without duplicates", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS, ["resistances:cold"]);
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.CRITICAL_SUCCESS, ["resistances:cold", "traits:undead"]);

    const facts = getRevealedFacts(combat, PC_1, TARGET_1);
    expect(facts.sort()).toEqual(["resistances:cold", "traits:undead"]);
  });

  it("keeps revealed facts independent per character and per target", async () => {
    const combat = createFakeCombat();
    await recordAttempt(combat, PC_1, TARGET_1, DEGREES.SUCCESS, ["resistances:cold"]);
    expect(getRevealedFacts(combat, PC_2, TARGET_1)).toEqual([]);
    expect(getRevealedFacts(combat, PC_1, TARGET_2)).toEqual([]);
  });
});

describe("getEncounterFor", () => {
  const skeleton = { uuid: "Scene.s1.Token.t1.Actor.skel" };
  const fight = (id, actorUuids, options = {}) => createFakeCombat({ id, actorUuids, ...options });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null without a target actor", () => {
    vi.stubGlobal("game", { combat: null, combats: [fight("c1", [skeleton.uuid])] });
    expect(getEncounterFor(null)).toBeNull();
  });

  it("ignores a combat that hasn't started", () => {
    const setup = fight("c1", [skeleton.uuid], { started: false });
    vi.stubGlobal("game", { combat: setup, combats: [setup] });
    expect(getEncounterFor(skeleton)).toBeNull();
  });

  it("ignores a started combat the target isn't in", () => {
    const oldFight = fight("old", ["Actor.wolf"]);
    vi.stubGlobal("game", { combat: oldFight, combats: [oldFight] });
    expect(getEncounterFor(skeleton)).toBeNull();
  });

  it("finds the started combat the target is in, whatever the tracker shows", () => {
    const oldFight = fight("old", ["Actor.wolf"]);
    const current = fight("new", [skeleton.uuid]);
    vi.stubGlobal("game", { combat: oldFight, combats: [oldFight, current] });
    expect(getEncounterFor(skeleton)).toBe(current);
  });

  it("prefers the tracker's combat when several contain the target", () => {
    const first = fight("a", [skeleton.uuid]);
    const second = fight("b", [skeleton.uuid]);
    vi.stubGlobal("game", { combat: second, combats: [first, second] });
    expect(getEncounterFor(skeleton)).toBe(second);
  });

  it("otherwise takes the first combat that contains the target", () => {
    const first = fight("a", [skeleton.uuid]);
    const second = fight("b", [skeleton.uuid]);
    const unrelated = fight("c", ["Actor.wolf"]);
    vi.stubGlobal("game", { combat: unrelated, combats: [unrelated, first, second] });
    expect(getEncounterFor(skeleton)).toBe(first);
  });
});
