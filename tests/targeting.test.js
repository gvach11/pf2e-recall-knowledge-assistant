import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUnknownTargetLabelKey, getValidatedSingleTarget } from "../scripts/targeting.js";

function fakeTargets(tokens) {
  return {
    size: tokens.length,
    first: () => tokens[0],
  };
}

describe("getValidatedSingleTarget", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.fn();
    vi.stubGlobal("ui", { notifications: { warn: warnSpy } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key }, user: { targets: fakeTargets([]) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("warns and returns null when nothing is targeted", () => {
    game.user.targets = fakeTargets([]);

    const result = getValidatedSingleTarget();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.NoTarget");
  });

  it("warns and returns null when more than one token is targeted", () => {
    game.user.targets = fakeTargets([{ actor: { type: "npc" } }, { actor: { type: "npc" } }]);

    const result = getValidatedSingleTarget();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.MultipleTargets");
  });

  it("warns and returns null when the single target is not an NPC or Hazard", () => {
    game.user.targets = fakeTargets([{ actor: { type: "character" } }]);

    const result = getValidatedSingleTarget();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidTargetType");
  });

  it("returns the token when exactly one valid NPC is targeted", () => {
    const token = { actor: { type: "npc" } };
    game.user.targets = fakeTargets([token]);

    const result = getValidatedSingleTarget();

    expect(result).toBe(token);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns the token when exactly one valid Hazard is targeted", () => {
    const token = { actor: { type: "hazard" } };
    game.user.targets = fakeTargets([token]);

    const result = getValidatedSingleTarget();

    expect(result).toBe(token);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("getUnknownTargetLabelKey", () => {
  it("calls an unidentified hazard an unknown hazard", () => {
    expect(getUnknownTargetLabelKey({ type: "hazard" })).toBe("RKA.UnknownHazard");
  });

  it("calls an unidentified NPC an unknown creature", () => {
    expect(getUnknownTargetLabelKey({ type: "npc" })).toBe("RKA.UnknownTarget");
  });
});
