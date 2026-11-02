import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/ui/scene-control.js", () => ({
  registerSceneControl: vi.fn(),
  openRecallKnowledgeDialog: vi.fn(),
}));
vi.mock("../scripts/macro.js", () => ({ ensureHotbarMacro: vi.fn() }));
vi.mock("../scripts/socket.js", () => ({ registerSocket: vi.fn() }));

describe("module ready hook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes the versioned public API other modules depend on", async () => {
    const callbacks = {};
    const moduleEntry = {};
    vi.stubGlobal("Hooks", { once: (name, fn) => (callbacks[name] = fn) });
    vi.stubGlobal("game", { modules: { get: () => moduleEntry }, user: { isGM: true } });

    await import("../scripts/module.js");
    const { openRecallKnowledgeDialog } = await import("../scripts/ui/scene-control.js");
    const { getAttemptStatus } = await import("../scripts/attempt-status.js");
    callbacks.ready();

    expect(moduleEntry.api).toEqual({ apiVersion: 1, openDialog: openRecallKnowledgeDialog, getAttemptStatus });
  });
});
