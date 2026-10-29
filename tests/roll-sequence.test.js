import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRollSequence } from "../scripts/roll-sequence.js";
import { DEGREES } from "../scripts/constants.js";
import { attemptKey } from "../scripts/repeat-attempts.js";
import { createFakeCombat } from "./helpers/fake-combat.js";

vi.mock("../scripts/roll.js", () => ({
  rollRecallKnowledge: vi.fn(),
}));
vi.mock("../scripts/chat/render-result.js", () => ({
  renderResultChatMessage: vi.fn(),
}));
vi.mock("../scripts/socket.js", () => ({
  persistAttempt: vi.fn(),
}));

const { rollRecallKnowledge } = await import("../scripts/roll.js");
const { renderResultChatMessage } = await import("../scripts/chat/render-result.js");
const { persistAttempt } = await import("../scripts/socket.js");

const ROLLING_ACTOR = { uuid: "Actor.pc1" };
const TARGET_ACTOR = { uuid: "Actor.target1", type: "npc", name: "Test Ghoul", identificationDCs: { standard: { dc: 20 } } };
const FACTS = { name: "Test Ghoul", traits: ["undead"], weaknesses: [], resistances: [], immunities: [] };

function baseArgs(overrides = {}) {
  return {
    combat: createFakeCombat(),
    rollingActor: ROLLING_ACTOR,
    targetActor: TARGET_ACTOR,
    facts: FACTS,
    selectedSkill: "religion",
    selectedCategory: "weaknesses",
    event: {},
    dc: 20,
    ...overrides,
  };
}

describe("executeRollSequence", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.stubGlobal("ui", { notifications: { warn: vi.fn(), error: vi.fn() } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key } });
    rollRecallKnowledge.mockReset();
    renderResultChatMessage.mockReset();
    persistAttempt.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("returns 'blocked' and warns without rolling when the attempt is already throttled", async () => {
    const combat = createFakeCombat();
    await combat.setFlag("pf2e-recall-knowledge-assistant", "attempts", {
      [attemptKey(ROLLING_ACTOR.uuid, TARGET_ACTOR.uuid)]: { count: 1, blocked: true, identified: false, revealedFacts: [] },
    });

    const result = await executeRollSequence(baseArgs({ combat }));

    expect(result).toEqual({ outcome: "blocked" });
    expect(ui.notifications.warn).toHaveBeenCalledWith("RKA.Warning.AlreadyAttempted");
    expect(rollRecallKnowledge).not.toHaveBeenCalled();
  });

  it("returns 'no-roll' and shows an error when the roll produces no result", async () => {
    rollRecallKnowledge.mockResolvedValue(null);

    const result = await executeRollSequence(baseArgs());

    expect(result).toEqual({ outcome: "no-roll" });
    expect(ui.notifications.error).toHaveBeenCalledWith("RKA.Error.RollFailed");
    expect(renderResultChatMessage).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("completes the full sequence and persists the attempt after the chat message renders", async () => {
    rollRecallKnowledge.mockResolvedValue({ rollTotal: 25, naturalD20: 12 });
    renderResultChatMessage.mockResolvedValue(undefined);
    const combat = createFakeCombat();

    const result = await executeRollSequence(baseArgs({ combat }));

    expect(result.outcome).toBe("completed");
    expect(result.degree).toBe(DEGREES.SUCCESS);
    expect(renderResultChatMessage).toHaveBeenCalledTimes(1);

    const reveal = renderResultChatMessage.mock.calls[0][0].reveal;
    expect(persistAttempt).toHaveBeenCalledWith(combat, "Actor.pc1", "Actor.target1", DEGREES.SUCCESS, reveal.revealedKeys);
    expect(renderResultChatMessage.mock.invocationCallOrder[0]).toBeLessThan(persistAttempt.mock.invocationCallOrder[0]);
  });

  it("catches a rejected roll, notifies the user, and does not throw", async () => {
    const error = new Error("user cancelled the roll prompt");
    rollRecallKnowledge.mockRejectedValue(error);

    const result = await executeRollSequence(baseArgs());

    expect(result).toEqual({ outcome: "error" });
    expect(ui.notifications.error).toHaveBeenCalledWith("RKA.Error.RollFailed");
    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
  });

  it("catches a failure creating the chat message, notifies the user, and skips persisting the attempt", async () => {
    rollRecallKnowledge.mockResolvedValue({ rollTotal: 25, naturalD20: 12 });
    const error = new Error("ChatMessage.create failed");
    renderResultChatMessage.mockRejectedValue(error);

    const result = await executeRollSequence(baseArgs());

    expect(result).toEqual({ outcome: "error" });
    expect(ui.notifications.error).toHaveBeenCalledWith("RKA.Error.RollFailed");
    expect(persistAttempt).not.toHaveBeenCalled();
  });

  it("catches roll.js's thrown error when pf2e's recall-knowledge action is unavailable", async () => {
    const error = new Error("pf2e's built-in recall-knowledge action is unavailable");
    rollRecallKnowledge.mockRejectedValue(error);

    const result = await executeRollSequence(baseArgs());

    expect(result).toEqual({ outcome: "error" });
    expect(ui.notifications.error).toHaveBeenCalledWith("RKA.Error.RollFailed");
  });

  it("uses the explicitly passed dc, not a value independently recomputed from the target actor", async () => {
    // TARGET_ACTOR's own identificationDCs would yield dc=20; passing dc=5
    // here and asserting SUCCESS (not CRITICAL_FAILURE) proves the caller's
    // computed dc is what's actually used (architecture report F13).
    rollRecallKnowledge.mockResolvedValue({ rollTotal: 10, naturalD20: 10 });
    renderResultChatMessage.mockResolvedValue(undefined);

    const result = await executeRollSequence(baseArgs({ dc: 5 }));

    expect(result.degree).toBe(DEGREES.SUCCESS);
  });
});
