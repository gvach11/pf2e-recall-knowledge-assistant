import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/targeting.js", () => ({
  getValidatedSingleTarget: vi.fn(),
  validateTargetToken: vi.fn(),
}));
vi.mock("../scripts/applications/recall-knowledge-dialog.js", () => ({
  RecallKnowledgeDialog: vi.fn(),
}));

const { getValidatedSingleTarget, validateTargetToken } = await import("../scripts/targeting.js");
const { RecallKnowledgeDialog } = await import("../scripts/applications/recall-knowledge-dialog.js");
const { registerSceneControl, openRecallKnowledgeDialog, resolveRollingActor } = await import("../scripts/ui/scene-control.js");
const { DIALOG_ID } = await import("../scripts/constants.js");

describe("registerSceneControl", () => {
  let hooksOn;

  beforeEach(() => {
    hooksOn = vi.fn();
    vi.stubGlobal("Hooks", { on: hooksOn });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a 'getSceneControlButtons' hook", () => {
    registerSceneControl();

    expect(hooksOn).toHaveBeenCalledWith("getSceneControlButtons", expect.any(Function));
  });

  it("adds a 'recall-knowledge' tool to the token layer controls", () => {
    registerSceneControl();
    const hookCallback = hooksOn.mock.calls[0][1];
    const tokenControls = { tools: {} };

    hookCallback({ tokens: tokenControls });

    expect(tokenControls.tools["recall-knowledge"]).toMatchObject({
      name: "recall-knowledge",
      title: "RKA.SceneControl.Title",
      button: true,
    });
  });

  it("does nothing if the token layer controls are absent", () => {
    registerSceneControl();
    const hookCallback = hooksOn.mock.calls[0][1];

    expect(() => hookCallback({})).not.toThrow();
  });
});

describe("openRecallKnowledgeDialog", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.fn();
    getValidatedSingleTarget.mockReset();
    validateTargetToken.mockReset();
    RecallKnowledgeDialog.mockReset();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: vi.fn() }));
    vi.stubGlobal("ui", { notifications: { warn: warnSpy } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key }, user: { character: null } });
    vi.stubGlobal("canvas", { tokens: { controlled: [] } });
    vi.stubGlobal("foundry", { applications: { instances: new Map() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing if no valid target is selected", async () => {
    getValidatedSingleTarget.mockReturnValue(null);

    await openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("warns and does not open the dialog if there is no rolling actor", async () => {
    getValidatedSingleTarget.mockReturnValue({ actor: { type: "npc" } });
    game.user.character = null;
    canvas.tokens.controlled = [];

    await openRecallKnowledgeDialog();

    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.NoRollingActor");
    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("opens the dialog with the user's assigned character as rolling actor", async () => {
    const targetToken = { actor: { type: "npc" } };
    const character = { name: "PC" };
    getValidatedSingleTarget.mockReturnValue(targetToken);
    game.user.character = character;
    const renderSpy = vi.fn();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: renderSpy }));

    await openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: character });
    expect(renderSpy).toHaveBeenCalledWith(true);
  });

  it("falls back to the controlled token's actor when the user has no assigned character", async () => {
    const targetToken = { actor: { type: "npc" } };
    const controlledActor = { name: "Controlled PC", type: "character", isOwner: true };
    getValidatedSingleTarget.mockReturnValue(targetToken);
    game.user.character = null;
    canvas.tokens.controlled = [{ actor: controlledActor }];
    const renderSpy = vi.fn();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: renderSpy }));

    await openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: controlledActor });
  });
});

describe("openRecallKnowledgeDialog with a dialog already open", () => {
  beforeEach(() => {
    getValidatedSingleTarget.mockReset();
    getValidatedSingleTarget.mockReturnValue({ actor: { type: "npc" } });
    RecallKnowledgeDialog.mockReset();
    vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key }, user: { character: { type: "character", isOwner: true } } });
    vi.stubGlobal("canvas", { tokens: { controlled: [] } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes the open dialog first, so a Lore request it's waiting on is cancelled (SPEC.md §6.8)", async () => {
    const order = [];
    const open = { close: vi.fn(async () => order.push("closed old")) };
    vi.stubGlobal("foundry", { applications: { instances: new Map([[DIALOG_ID, open]]) } });
    RecallKnowledgeDialog.mockImplementation(() => ({ render: () => order.push("rendered new") }));

    await openRecallKnowledgeDialog();

    expect(order).toEqual(["closed old", "rendered new"]);
  });
});

describe("openRecallKnowledgeDialog with a given actor or target", () => {
  let warnSpy;
  const targetToken = { actor: { type: "npc" } };

  beforeEach(() => {
    warnSpy = vi.fn();
    getValidatedSingleTarget.mockReset();
    getValidatedSingleTarget.mockReturnValue(targetToken);
    validateTargetToken.mockReset();
    RecallKnowledgeDialog.mockReset();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: vi.fn() }));
    vi.stubGlobal("ui", { notifications: { warn: warnSpy } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key }, user: { character: null } });
    vi.stubGlobal("canvas", { tokens: { controlled: [] } });
    vi.stubGlobal("foundry", { applications: { instances: new Map() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens for a given owned character even when another character's token is controlled", async () => {
    const actor = { name: "Turn PC", type: "character", isOwner: true };
    canvas.tokens.controlled = [{ actor: { name: "Other PC", type: "character", isOwner: true } }];

    await openRecallKnowledgeDialog({ actor });

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: actor });
  });

  it("a GM opens it for a player's character", async () => {
    // A GM owns every actor, so isOwner is true for a player's character.
    const actor = { name: "Player PC", type: "character", isOwner: true };

    await openRecallKnowledgeDialog({ actor });

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: actor });
  });

  it("refuses a given character the user doesn't own", async () => {
    await openRecallKnowledgeDialog({ actor: { type: "character", isOwner: false } });

    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidRollingActor");
    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("refuses a given NPC", async () => {
    await openRecallKnowledgeDialog({ actor: { type: "npc", isOwner: true } });

    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.InvalidRollingActor");
    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("uses a given target token instead of the user's targets", async () => {
    const given = { actor: { type: "hazard" } };
    validateTargetToken.mockReturnValue(given);
    const actor = { type: "character", isOwner: true };

    await openRecallKnowledgeDialog({ actor, targetToken: given });

    expect(validateTargetToken).toHaveBeenCalledWith(given);
    expect(getValidatedSingleTarget).not.toHaveBeenCalled();
    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken: given, rollingActor: actor });
  });

  it("stops when the given target token is invalid", async () => {
    validateTargetToken.mockReturnValue(null);
    const actor = { type: "character", isOwner: true };
    game.user.character = actor;

    await openRecallKnowledgeDialog({ actor, targetToken: { actor: { type: "character" } } });

    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith("RKA.Warning.InvalidRollingActor");
  });
});

describe("resolveRollingActor", () => {
  const assigned = { name: "Assigned Wizard", type: "character", isOwner: true };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stub({ controlled = [], character = assigned } = {}) {
    vi.stubGlobal("game", { user: { character } });
    vi.stubGlobal("canvas", { tokens: { controlled: controlled.map((actor) => ({ actor })) } });
  }

  it("rolls as a controlled character the player owns, even when another character is assigned", () => {
    const bard = { name: "Bard", type: "character", isOwner: true };
    stub({ controlled: [bard] });
    expect(resolveRollingActor()).toBe(bard);
  });

  it("uses the assigned character when nothing is controlled", () => {
    stub();
    expect(resolveRollingActor()).toBe(assigned);
  });

  it("ignores a controlled NPC token and uses the assigned character", () => {
    stub({ controlled: [{ name: "Goblin", type: "npc", isOwner: true }] });
    expect(resolveRollingActor()).toBe(assigned);
  });

  it("ignores a controlled character the user doesn't own", () => {
    stub({ controlled: [{ name: "Someone else's PC", type: "character", isOwner: false }] });
    expect(resolveRollingActor()).toBe(assigned);
  });

  it("is null with nothing controlled and no assigned character", () => {
    stub({ character: null });
    expect(resolveRollingActor()).toBeNull();
  });
});
