import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rollRecallKnowledge } from "../scripts/roll.js";

const ROLLING_ACTOR = { name: "Rolling PC" };
const TARGET_ACTOR = { name: "Test Ghoul" };

function fakeD20Roll(total, naturalResult) {
  return {
    total,
    terms: [{ faces: 20, results: [{ result: naturalResult, active: true }] }],
  };
}

describe("rollRecallKnowledge", () => {
  let actionUse;

  beforeEach(() => {
    actionUse = vi.fn();
    vi.stubGlobal("game", { pf2e: { actions: { get: vi.fn(() => ({ use: actionUse })) } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the roll total and natural d20 on a normal roll", async () => {
    actionUse.mockResolvedValue([{ roll: fakeD20Roll(25, 18) }]);

    const result = await rollRecallKnowledge({ rollingActor: ROLLING_ACTOR, targetActor: TARGET_ACTOR, statistic: "religion", event: {} });

    expect(result).toEqual({ rollTotal: 25, naturalD20: 18 });
  });

  it("suppresses pf2e's own chat card by passing message: { create: false }", async () => {
    actionUse.mockResolvedValue([{ roll: fakeD20Roll(25, 18) }]);

    await rollRecallKnowledge({ rollingActor: ROLLING_ACTOR, targetActor: TARGET_ACTOR, statistic: "religion", event: {} });

    expect(actionUse).toHaveBeenCalledWith(expect.objectContaining({ message: { create: false } }));
  });

  it("returns null when the resolved roll is malformed", async () => {
    actionUse.mockResolvedValue([{ roll: null }]);

    const result = await rollRecallKnowledge({ rollingActor: ROLLING_ACTOR, targetActor: TARGET_ACTOR, statistic: "religion", event: {} });

    expect(result).toBeNull();
  });

  it("characterization (pre-fix): throws a raw Error when pf2e's recall-knowledge action is unavailable", async () => {
    game.pf2e.actions.get.mockReturnValue(undefined);

    await expect(
      rollRecallKnowledge({ rollingActor: ROLLING_ACTOR, targetActor: TARGET_ACTOR, statistic: "religion", event: {} })
    ).rejects.toThrow("pf2e's built-in recall-knowledge action is unavailable");
  });

  it("characterization (pre-fix): a rejected action.use() propagates as an unhandled rejection", async () => {
    actionUse.mockRejectedValue(new Error("user cancelled the roll prompt"));

    await expect(
      rollRecallKnowledge({ rollingActor: ROLLING_ACTOR, targetActor: TARGET_ACTOR, statistic: "religion", event: {} })
    ).rejects.toThrow("user cancelled the roll prompt");
  });
});
