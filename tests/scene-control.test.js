import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/targeting.js", () => ({
  getValidatedSingleTarget: vi.fn(),
}));
vi.mock("../scripts/applications/recall-knowledge-dialog.js", () => ({
  RecallKnowledgeDialog: vi.fn(),
}));

const { getValidatedSingleTarget } = await import("../scripts/targeting.js");
const { RecallKnowledgeDialog } = await import("../scripts/applications/recall-knowledge-dialog.js");
const { registerSceneControl, openRecallKnowledgeDialog } = await import("../scripts/ui/scene-control.js");

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
    RecallKnowledgeDialog.mockReset();
    vi.stubGlobal("ui", { notifications: { warn: warnSpy } });
    vi.stubGlobal("game", { i18n: { localize: (key) => key }, user: { character: null } });
    vi.stubGlobal("canvas", { tokens: { controlled: [] } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing if no valid target is selected", () => {
    getValidatedSingleTarget.mockReturnValue(null);

    openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("warns and does not open the dialog if there is no rolling actor", () => {
    getValidatedSingleTarget.mockReturnValue({ actor: { type: "npc" } });
    game.user.character = null;
    canvas.tokens.controlled = [];

    openRecallKnowledgeDialog();

    expect(warnSpy).toHaveBeenCalledWith("RKA.Warning.NoRollingActor");
    expect(RecallKnowledgeDialog).not.toHaveBeenCalled();
  });

  it("opens the dialog with the user's assigned character as rolling actor", () => {
    const targetToken = { actor: { type: "npc" } };
    const character = { name: "PC" };
    getValidatedSingleTarget.mockReturnValue(targetToken);
    game.user.character = character;
    const renderSpy = vi.fn();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: renderSpy }));

    openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: character });
    expect(renderSpy).toHaveBeenCalledWith(true);
  });

  it("falls back to the controlled token's actor when the user has no assigned character", () => {
    const targetToken = { actor: { type: "npc" } };
    const controlledActor = { name: "Controlled PC" };
    getValidatedSingleTarget.mockReturnValue(targetToken);
    game.user.character = null;
    canvas.tokens.controlled = [{ actor: controlledActor }];
    const renderSpy = vi.fn();
    RecallKnowledgeDialog.mockImplementation(() => ({ render: renderSpy }));

    openRecallKnowledgeDialog();

    expect(RecallKnowledgeDialog).toHaveBeenCalledWith({ targetToken, rollingActor: controlledActor });
  });
});
