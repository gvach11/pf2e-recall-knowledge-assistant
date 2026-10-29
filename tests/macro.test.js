import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureHotbarMacro } from "../scripts/macro.js";
import { MODULE_ID } from "../scripts/constants.js";

describe("ensureHotbarMacro", () => {
  let macroCreate;

  beforeEach(() => {
    macroCreate = vi.fn();
    vi.stubGlobal("Macro", { create: macroCreate });
    vi.stubGlobal("game", { macros: { find: vi.fn(() => undefined) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing if a trigger macro already exists", async () => {
    game.macros.find = vi.fn(() => ({ name: "Recall Knowledge" }));

    await ensureHotbarMacro();

    expect(macroCreate).not.toHaveBeenCalled();
  });

  it("creates a script macro flagged as the trigger macro when none exists", async () => {
    game.macros.find = vi.fn(() => undefined);

    await ensureHotbarMacro();

    expect(macroCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Recall Knowledge",
        type: "script",
        scope: "global",
        command: `game.modules.get("${MODULE_ID}").api.openDialog();`,
        flags: { [MODULE_ID]: { isTriggerMacro: true } },
      })
    );
  });

  it("looks up existing macros via the module's trigger-macro flag", async () => {
    const finder = vi.fn(() => undefined);
    game.macros.find = finder;

    await ensureHotbarMacro();

    const predicate = finder.mock.calls[0][0];
    const fakeGetFlag = vi.fn((scope, key) => scope === MODULE_ID && key === "isTriggerMacro");
    expect(predicate({ getFlag: fakeGetFlag })).toBe(true);
  });
});
