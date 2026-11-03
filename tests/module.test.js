import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/ui/scene-control.js", () => ({
  registerSceneControl: vi.fn(),
  openRecallKnowledgeDialog: vi.fn(),
}));
vi.mock("../scripts/macro.js", () => ({ ensureHotbarMacro: vi.fn() }));
vi.mock("../scripts/socket.js", () => ({ registerSocket: vi.fn() }));
vi.mock("../scripts/settings.js", () => ({ registerSettings: vi.fn() }));

describe("module ready hook", () => {
  const moduleEntry = {};
  const hooksOn = vi.fn();

  beforeAll(async () => {
    const callbacks = {};
    vi.stubGlobal("Hooks", { once: (name, fn) => (callbacks[name] = fn), on: hooksOn });
    vi.stubGlobal("game", { modules: { get: () => moduleEntry }, user: { isGM: true } });

    await import("../scripts/module.js");
    callbacks.init();
    callbacks.ready();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("publishes the versioned public API other modules depend on", async () => {
    const { openRecallKnowledgeDialog } = await import("../scripts/ui/scene-control.js");
    const { getAttemptStatus } = await import("../scripts/attempt-status.js");

    expect(moduleEntry.api).toEqual({ apiVersion: 1, openDialog: openRecallKnowledgeDialog, getAttemptStatus });
  });

  it("registers the module's settings on init", async () => {
    const { registerSettings } = await import("../scripts/settings.js");

    expect(registerSettings).toHaveBeenCalled();
  });

  it("ends a waiting Lore request when GMs connect or leave", async () => {
    const { onUserConnectionChange } = await import("../scripts/lore-approval.js");

    expect(hooksOn).toHaveBeenCalledWith("userConnected", onUserConnectionChange);
  });
});
