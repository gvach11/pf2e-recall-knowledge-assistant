import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderResultChatMessage } from "../scripts/chat/render-result.js";
import { DEGREES } from "../scripts/constants.js";

const ROLLING_ACTOR = { name: "Rolling PC" };
const TARGET_ACTOR = { name: "Test Ghoul" };

function baseArgs(overrides = {}) {
  return {
    degree: DEGREES.SUCCESS,
    dc: 20,
    rollTotal: 25,
    rollingActor: ROLLING_ACTOR,
    targetActor: TARGET_ACTOR,
    alreadyIdentified: false,
    reveal: { baseline: "Test Ghoul is an undead.", facts: ["Weak to fire 5"], isFalse: false, revealedKeys: ["weaknesses:fire"] },
    ...overrides,
  };
}

describe("renderResultChatMessage", () => {
  let createCalls;
  let renderTemplateSpy;

  beforeEach(() => {
    createCalls = [];
    renderTemplateSpy = vi.fn().mockResolvedValue("<div>rendered</div>");

    vi.stubGlobal("game", { i18n: { localize: (key) => key } });
    vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: renderTemplateSpy } } });
    vi.stubGlobal("ChatMessage", {
      getSpeaker: vi.fn(() => ({ alias: "Rolling PC" })),
      getWhisperRecipients: vi.fn(() => [{ id: "gmUser1" }, { id: "gmUser2" }]),
      create: vi.fn(async (data) => {
        createCalls.push(data);
        return data;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the real target name in the header once identified", async () => {
    await renderResultChatMessage(baseArgs({ degree: DEGREES.SUCCESS, alreadyIdentified: false }));
    expect(renderTemplateSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ targetName: "Test Ghoul" }));
  });

  it("hides the target name behind 'RKA.UnknownTarget' when not yet identified", async () => {
    await renderResultChatMessage(baseArgs({ degree: DEGREES.FAILURE, alreadyIdentified: false }));
    expect(renderTemplateSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ targetName: "RKA.UnknownTarget" }));
  });

  it("creates a public chat message with no dc/rollTotal/degree in its content context", async () => {
    await renderResultChatMessage(baseArgs());
    expect(createCalls[0]).toEqual({ speaker: { alias: "Rolling PC" }, content: "<div>rendered</div>" });
  });

  it("creates a second, GM-only message whispered to GM recipients containing the true dc/roll/degree", async () => {
    await renderResultChatMessage(baseArgs({ dc: 22, rollTotal: 30, degree: DEGREES.CRITICAL_SUCCESS }));
    const gmMessage = createCalls[1];
    expect(gmMessage.whisper).toEqual(["gmUser1", "gmUser2"]);
    expect(gmMessage.content).toContain("DC 22");
    expect(gmMessage.content).toContain("Roll 30");
  });

  it("characterization (pre-fix): the GM-only message does not set blind, so its own author can see it", async () => {
    await renderResultChatMessage(baseArgs());
    const gmMessage = createCalls[1];
    expect(gmMessage.blind).toBeUndefined();
  });
});
