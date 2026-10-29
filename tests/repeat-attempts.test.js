import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeCombat } from "./helpers/fake-combat.js";
import {
  attemptKey,
  shouldBlockAfter,
  isAttemptBlocked,
  recordAttempt,
  isIdentified,
  getRevealedFacts,
  getActiveEncounter,
} from "../scripts/repeat-attempts.js";
import { DEGREES } from "../scripts/constants.js";

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

describe("getActiveEncounter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores a combat that exists but hasn't started", () => {
    vi.stubGlobal("game", { combat: { started: false } });
    expect(getActiveEncounter()).toBeNull();
  });

  it("returns the viewed combat once it has started", () => {
    const combat = { started: true };
    vi.stubGlobal("game", { combat });
    expect(getActiveEncounter()).toBe(combat);
  });

  it("is null with no combat at all", () => {
    vi.stubGlobal("game", { combat: undefined });
    expect(getActiveEncounter()).toBeNull();
  });
});
