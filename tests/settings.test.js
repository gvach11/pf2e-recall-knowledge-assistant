import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSettings } from "../scripts/settings.js";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

describe("registerSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers harder follow-ups as a world setting the GM sees, on by default", () => {
    const register = vi.fn();
    vi.stubGlobal("game", { settings: { register } });

    registerSettings();

    expect(register).toHaveBeenCalledWith(
      MODULE_ID,
      SETTINGS.HARDER_FOLLOW_UPS,
      expect.objectContaining({ scope: "world", config: true, type: Boolean, default: true })
    );
  });
});
