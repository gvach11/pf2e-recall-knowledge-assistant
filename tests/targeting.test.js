import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTargetDisplayName, getUnknownTargetLabelKey, getValidatedSingleTarget, validateTargetToken } from "../scripts/targeting.js";

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

describe("getTargetDisplayName", () => {
  beforeEach(() => {
    vi.stubGlobal("game", { i18n: { localize: (key) => key } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names a target the character has identified", () => {
    expect(getTargetDisplayName({ type: "npc", name: "Wight" }, true)).toBe("Wight");
  });

  it("hides a target the character hasn't identified behind the placeholder", () => {
    expect(getTargetDisplayName({ type: "npc", name: "Wight" }, false)).toBe("RKA.UnknownTarget");
    expect(getTargetDisplayName({ type: "hazard", name: "Hidden Pit" }, false)).toBe("RKA.UnknownHazard");
  });
});

describe("validateTargetToken", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.fn();
    vi.stubGlobal("ui", { notifications: { warn: warnSpy } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts an NPC token without warning", () => {
    const token = { actor: { type: "npc" } };
    expect(validateTargetToken(token)).toBe(token);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts a hazard token", () => {
    const token = { actor: { type: "hazard" } };
    expect(validateTargetToken(token)).toBe(token);
  });

  it("rejects a character token with the invalid-type warning", () => {
    expect(validateTargetToken({ actor: { type: "character" } })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidTargetType");
  });

  it("accepts a TokenDocument and returns its canvas Token, which the dialog needs", () => {
    const placeable = { actor: { type: "npc" }, document: {} };
    const tokenDocument = { documentName: "Token", actor: { type: "npc" }, object: placeable };
    expect(validateTargetToken(tokenDocument)).toBe(placeable);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects a TokenDocument that isn't on the canvas", () => {
    expect(validateTargetToken({ documentName: "Token", actor: { type: "npc" }, object: null })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidTargetType");
  });

  it("rejects a token whose actor is gone with the same warning", () => {
    expect(validateTargetToken({ actor: null })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidTargetType");
  });
});
