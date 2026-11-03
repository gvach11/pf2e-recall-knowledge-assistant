import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/applications/lore-decision-prompt.js", () => ({ promptGmLoreDecision: vi.fn() }));

import { promptGmLoreDecision } from "../scripts/applications/lore-decision-prompt.js";
import {
  LORE_MESSAGES,
  cancelPendingLoreRequest,
  handleLoreCancel,
  handleLoreReply,
  handleLoreRequest,
  onUserConnectionChange,
  requestLoreDecision,
} from "../scripts/lore-approval.js";
import { SOCKET_NAME } from "../scripts/constants.js";

const GM = { id: "gm1", isSelf: false };
const PLAYER = { id: "player1" };

const wizard = {
  uuid: "Actor.wiz",
  name: "Wizard",
  skills: { "undead-lore": { slug: "undead-lore", label: "Undead Lore", lore: true }, arcana: { slug: "arcana", label: "Arcana" } },
  testUserPermission: (user) => user.id === PLAYER.id,
};
const skeleton = { uuid: "Scene.s.Token.t.Actor.skel", type: "npc", name: "Skeleton", identificationDCs: { lore: [{ dc: 11 }, { dc: 8 }] } };
const skeletonToken = { uuid: "Scene.s.Token.t", texture: { src: "skeleton.webp" } };

const ARGS = { rollingActor: wizard, targetActor: skeleton, targetToken: skeletonToken, loreSlug: "undead-lore", category: "weaknesses" };

let ids;

function stubGame({ activeGM = GM, user = PLAYER } = {}) {
  vi.stubGlobal("game", {
    user,
    users: { activeGM, get: (id) => [PLAYER, GM].find((u) => u.id === id) },
    socket: { emit: vi.fn() },
    i18n: { localize: (key) => key },
  });
  vi.stubGlobal("fromUuidSync", (uuid) => ({ [wizard.uuid]: wizard, [skeleton.uuid]: skeleton, [skeletonToken.uuid]: skeletonToken })[uuid] ?? null);
}

function emitted(type) {
  return game.socket.emit.mock.calls.filter(([, message]) => message.type === type).map(([, message]) => message);
}

// A prompt the test resolves by hand, and whose close() the test can observe.
function controllablePrompt() {
  let resolve;
  const prompt = { decision: new Promise((r) => (resolve = r)), close: vi.fn(() => resolve("declined")) };
  promptGmLoreDecision.mockReturnValueOnce(prompt);
  return { prompt, choose: (decision) => resolve(decision) };
}

beforeEach(() => {
  ids = 0;
  vi.stubGlobal("foundry", { utils: { randomID: () => `req${++ids}` } });
  stubGame();
});

afterEach(() => {
  cancelPendingLoreRequest();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("requestLoreDecision (player)", () => {
  it("is unavailable with no active GM, and sends nothing", async () => {
    stubGame({ activeGM: null });
    expect(await requestLoreDecision(ARGS)).toBe("unavailable");
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("asks the active GM over the module socket", () => {
    requestLoreDecision(ARGS);
    expect(game.socket.emit).toHaveBeenCalledWith(SOCKET_NAME, {
      type: LORE_MESSAGES.REQUEST,
      requestId: "req1",
      actorUuid: wizard.uuid,
      targetUuid: skeleton.uuid,
      targetTokenUuid: skeletonToken.uuid,
      loreSlug: "undead-lore",
      category: "weaknesses",
    });
  });

  it("resolves with the active GM's reply", async () => {
    const decision = requestLoreDecision(ARGS);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "easy" }, GM.id);
    expect(await decision).toBe("easy");
  });

  it("ignores a reply from anyone but the active GM", async () => {
    const decision = requestLoreDecision(ARGS);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "very-easy" }, "someoneElse");
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "declined" }, GM.id);
    expect(await decision).toBe("declined");
  });

  it("ignores a reply meant for another user", async () => {
    const decision = requestLoreDecision(ARGS);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: "player2", decision: "very-easy" }, GM.id);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "easy" }, GM.id);
    expect(await decision).toBe("easy");
  });

  it("ignores a reply to an old request", async () => {
    const decision = requestLoreDecision(ARGS);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "stale", userId: PLAYER.id, decision: "very-easy" }, GM.id);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "easy" }, GM.id);
    expect(await decision).toBe("easy");
  });

  it("ignores a reply with a decision it doesn't know", async () => {
    const decision = requestLoreDecision(ARGS);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "trivial" }, GM.id);
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "declined" }, GM.id);
    expect(await decision).toBe("declined");
  });

  it("cancelling resolves 'cancelled' and tells the GM", async () => {
    const decision = requestLoreDecision(ARGS);
    cancelPendingLoreRequest();
    expect(await decision).toBe("cancelled");
    expect(emitted(LORE_MESSAGES.CANCEL)).toEqual([{ type: LORE_MESSAGES.CANCEL, requestId: "req1" }]);
  });

  it("a second request cancels the first", async () => {
    const first = requestLoreDecision(ARGS);
    requestLoreDecision(ARGS);
    expect(await first).toBe("cancelled");
    expect(emitted(LORE_MESSAGES.CANCEL)).toEqual([{ type: LORE_MESSAGES.CANCEL, requestId: "req1" }]);
    expect(emitted(LORE_MESSAGES.REQUEST).map((m) => m.requestId)).toEqual(["req1", "req2"]);
  });

  it("ends the wait when the GM it asked is no longer the active GM", async () => {
    const decision = requestLoreDecision(ARGS);
    game.users.activeGM = null;
    onUserConnectionChange();
    expect(await decision).toBe("unavailable");
  });

  it("keeps waiting when someone else connects or leaves", async () => {
    const decision = requestLoreDecision(ARGS);
    onUserConnectionChange();
    handleLoreReply({ type: LORE_MESSAGES.REPLY, requestId: "req1", userId: PLAYER.id, decision: "easy" }, GM.id);
    expect(await decision).toBe("easy");
  });

  it("asks locally, with no round trip, when the requester is the active GM", async () => {
    stubGame({ activeGM: { id: GM.id, isSelf: true }, user: GM });
    const { choose } = controllablePrompt();
    const decision = requestLoreDecision(ARGS);
    choose("very-easy");
    expect(await decision).toBe("very-easy");
    expect(game.socket.emit).not.toHaveBeenCalled();
  });
});

describe("handleLoreRequest (GM)", () => {
  const request = (overrides = {}) => ({
    type: LORE_MESSAGES.REQUEST,
    requestId: "r1",
    actorUuid: wizard.uuid,
    targetUuid: skeleton.uuid,
    targetTokenUuid: skeletonToken.uuid,
    loreSlug: "undead-lore",
    category: "weaknesses",
    ...overrides,
  });

  beforeEach(() => {
    stubGame({ activeGM: { id: GM.id, isSelf: true }, user: GM });
  });

  it("shows the GM the request with real names, token art and both DCs", () => {
    controllablePrompt();
    handleLoreRequest(request(), PLAYER.id);
    expect(promptGmLoreDecision).toHaveBeenCalledWith({
      characterName: "Wizard",
      loreLabel: "Undead Lore",
      categoryLabel: "RKA.Category.weaknesses",
      targetName: "Skeleton",
      targetImg: "skeleton.webp",
      dcs: { easy: 11, veryEasy: 8 },
    });
  });

  it("replies to the requester with the GM's decision", async () => {
    const { choose } = controllablePrompt();
    const handled = handleLoreRequest(request(), PLAYER.id);
    choose("easy");
    await handled;
    expect(emitted(LORE_MESSAGES.REPLY)).toEqual([{ type: LORE_MESSAGES.REPLY, requestId: "r1", userId: PLAYER.id, decision: "easy" }]);
  });

  it.each([
    ["the sender doesn't own the character", request(), "someoneElse"],
    ["the skill isn't a Lore", request({ loreSlug: "arcana" }), PLAYER.id],
    ["the character has no such skill", request({ loreSlug: "dragon-lore" }), PLAYER.id],
    ["the category is unknown", request({ category: "saves" }), PLAYER.id],
    ["the target isn't an NPC or hazard", request({ targetUuid: wizard.uuid }), PLAYER.id],
  ])("drops the request silently when %s", async (_, message, senderId) => {
    await handleLoreRequest(message, senderId);
    expect(promptGmLoreDecision).not.toHaveBeenCalled();
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("closes the popup and sends no reply when the requester cancels", async () => {
    const { prompt } = controllablePrompt();
    const handled = handleLoreRequest(request(), PLAYER.id);
    handleLoreCancel({ type: LORE_MESSAGES.CANCEL, requestId: "r1" }, PLAYER.id);
    await handled;
    expect(prompt.close).toHaveBeenCalled();
    expect(emitted(LORE_MESSAGES.REPLY)).toEqual([]);
  });

  it("ignores a cancel from anyone but the requester", async () => {
    const { prompt, choose } = controllablePrompt();
    const handled = handleLoreRequest(request(), PLAYER.id);
    handleLoreCancel({ type: LORE_MESSAGES.CANCEL, requestId: "r1" }, "someoneElse");
    expect(prompt.close).not.toHaveBeenCalled();
    choose("declined");
    await handled;
    expect(emitted(LORE_MESSAGES.REPLY)).toHaveLength(1);
  });
});
