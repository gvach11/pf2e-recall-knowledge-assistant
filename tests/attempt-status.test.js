import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCombat } from "./helpers/fake-combat.js";
import { recordAttempt } from "../scripts/repeat-attempts.js";
import { getAttemptStatus } from "../scripts/attempt-status.js";
import { CATEGORIES, NOTHING_NOTABLE_KEY, makeFactKey } from "../scripts/constants.js";

const pc = { uuid: "Actor.pc1", type: "character" };

function ghoul(uuid = "Actor.ghoul") {
  return {
    uuid,
    type: "npc",
    name: "Test Ghoul",
    system: {
      traits: { value: ["undead"] },
      attributes: {
        weaknesses: [{ type: "fire", value: 5, typeLabel: "fire", label: "fire 5" }],
        resistances: [{ type: "cold", value: 5, typeLabel: "cold", label: "cold 5" }],
        immunities: [{ type: "poison", typeLabel: "poison", label: "poison" }],
      },
    },
  };
}

const everything = [
  makeFactKey(CATEGORIES.WEAKNESSES, "fire"),
  makeFactKey(CATEGORIES.RESISTANCES, "cold"),
  makeFactKey(CATEGORIES.RESISTANCES, "poison"),
  makeFactKey(CATEGORIES.TRAITS, NOTHING_NOTABLE_KEY),
];

describe("getAttemptStatus", () => {
  let combat;
  let targetToken;

  beforeEach(() => {
    targetToken = { actor: ghoul() };
    combat = createFakeCombat({ actorUuids: [targetToken.actor.uuid] });
    vi.stubGlobal("game", { combat, combats: [combat] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invalid without an actor", () => {
    expect(getAttemptStatus({ targetToken })).toBe("invalid");
  });

  it("invalid for an NPC roller", () => {
    expect(getAttemptStatus({ actor: { uuid: "Actor.n", type: "npc" }, targetToken })).toBe("invalid");
  });

  it("invalid when the token has no actor", () => {
    expect(getAttemptStatus({ actor: pc, targetToken: { actor: null } })).toBe("invalid");
  });

  it("invalid when the target is a character", () => {
    expect(getAttemptStatus({ actor: pc, targetToken: { actor: { uuid: "Actor.pc2", type: "character" } } })).toBe("invalid");
  });

  it("available when the target's encounter hasn't started", async () => {
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "failure");
    combat.started = false;
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("available");
  });

  it("available when the tracker shows an old encounter the target isn't in", async () => {
    // The reported bug: a forgotten started encounter with another cast,
    // shown in the tracker, held a failure against this target.
    const oldFight = createFakeCombat({ id: "old", actorUuids: ["Actor.wolf"] });
    await recordAttempt(oldFight, pc.uuid, targetToken.actor.uuid, "failure");
    vi.stubGlobal("game", { combat: oldFight, combats: [oldFight] });
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("available");
  });

  it("blocked after a failure", async () => {
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "failure");
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("blocked");
  });

  it("exhausted once everything is known", async () => {
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "success", everything);
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("exhausted");
  });

  it("available while something is left", async () => {
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "success", [makeFactKey(CATEGORIES.WEAKNESSES, "fire")]);
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("available");
  });

  it("blocked wins over exhausted", async () => {
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "success", everything);
    await recordAttempt(combat, pc.uuid, targetToken.actor.uuid, "failure");
    expect(getAttemptStatus({ actor: pc, targetToken })).toBe("blocked");
  });

  it("each unlinked token is its own target", async () => {
    const tokenA = { actor: ghoul("Scene.s.Token.a.Actor.x") };
    const tokenB = { actor: ghoul("Scene.s.Token.b.Actor.x") };
    combat.combatants.push({ actor: tokenA.actor }, { actor: tokenB.actor });
    await recordAttempt(combat, pc.uuid, tokenA.actor.uuid, "failure");

    expect(getAttemptStatus({ actor: pc, targetToken: tokenA })).toBe("blocked");
    expect(getAttemptStatus({ actor: pc, targetToken: tokenB })).toBe("available");
  });
});
