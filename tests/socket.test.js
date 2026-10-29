import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistAttempt, handleSocketMessage, registerSocket, SOCKET_NAME } from "../scripts/socket.js";
import { isAttemptBlocked, isIdentified } from "../scripts/repeat-attempts.js";
import { DEGREES } from "../scripts/constants.js";
import { createFakeCombat } from "./helpers/fake-combat.js";

const PC = "Actor.pc1";
const TARGET = "Scene.s1.Token.t1.Actor.npc1";
const SENDER = { id: "player1" };

function stubGame({ isGM = false, activeGM = { isSelf: false }, combat = null, ownsActor = true } = {}) {
  vi.stubGlobal("game", {
    user: { id: isGM ? "gm1" : "player1", isGM },
    users: { activeGM, get: (id) => (id === SENDER.id ? SENDER : undefined) },
    combats: { get: (id) => (combat && combat.id === id ? combat : undefined) },
    socket: { emit: vi.fn(), on: vi.fn() },
    i18n: { localize: (key) => key },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("fromUuidSync", (uuid) => (uuid === PC ? { testUserPermission: () => ownsActor } : null));
}

function message(overrides = {}) {
  return {
    type: "recordAttempt",
    combatId: "c1",
    actorUuid: PC,
    targetUuid: TARGET,
    degree: DEGREES.FAILURE,
    newRevealedKeys: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistAttempt", () => {
  it("skips everything when there is no encounter", async () => {
    stubGame();
    expect(await persistAttempt(null, PC, TARGET, DEGREES.FAILURE, [])).toBe("skipped");
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("records directly when this user can update the combat (the GM)", async () => {
    const combat = createFakeCombat({ isGM: true });
    stubGame({ isGM: true, combat });

    expect(await persistAttempt(combat, PC, TARGET, DEGREES.FAILURE, [])).toBe("recorded");
    expect(isAttemptBlocked(combat, PC, TARGET)).toBe(true);
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("relays to the active GM when this user can't update the combat (a player)", async () => {
    const combat = createFakeCombat({ isGM: false });
    stubGame({ combat });

    const result = await persistAttempt(combat, PC, TARGET, DEGREES.SUCCESS, ["traits:undead"]);

    expect(result).toBe("relayed");
    expect(game.socket.emit).toHaveBeenCalledWith(SOCKET_NAME, {
      type: "recordAttempt",
      combatId: "c1",
      actorUuid: PC,
      targetUuid: TARGET,
      degree: DEGREES.SUCCESS,
      newRevealedKeys: ["traits:undead"],
    });
    expect(combat.getFlag("pf2e-recall-knowledge-assistant", "attempts")).toBeUndefined();
  });

  it("warns the player instead of erroring when no GM is connected to record it", async () => {
    const combat = createFakeCombat({ isGM: false });
    stubGame({ combat, activeGM: null });

    expect(await persistAttempt(combat, PC, TARGET, DEGREES.FAILURE, [])).toBe("unrecorded");
    expect(ui.notifications.warn).toHaveBeenCalledWith("RKA.Warning.NoGmToRecord");
    expect(game.socket.emit).not.toHaveBeenCalled();
  });
});

describe("handleSocketMessage", () => {
  it("records a relayed attempt on the active GM when the sender owns the rolling actor", async () => {
    const combat = createFakeCombat();
    stubGame({ isGM: true, activeGM: { isSelf: true }, combat });

    await handleSocketMessage(message({ degree: DEGREES.SUCCESS, newRevealedKeys: ["traits:undead"] }), SENDER.id);

    expect(isIdentified(combat, PC, TARGET)).toBe(true);
  });

  it("ignores a message for an actor the sender doesn't own", async () => {
    const combat = createFakeCombat();
    stubGame({ isGM: true, activeGM: { isSelf: true }, combat, ownsActor: false });

    await handleSocketMessage(message(), SENDER.id);

    expect(combat.getFlag("pf2e-recall-knowledge-assistant", "attempts")).toBeUndefined();
  });

  it("does nothing on a client that isn't the active GM", async () => {
    const combat = createFakeCombat();
    stubGame({ isGM: true, activeGM: { isSelf: false }, combat });

    await handleSocketMessage(message(), SENDER.id);

    expect(combat.getFlag("pf2e-recall-knowledge-assistant", "attempts")).toBeUndefined();
  });

  it("ignores a malformed degree or revealed-key list", async () => {
    const combat = createFakeCombat();
    stubGame({ isGM: true, activeGM: { isSelf: true }, combat });

    await handleSocketMessage(message({ degree: "totallyIdentified" }), SENDER.id);
    await handleSocketMessage(message({ newRevealedKeys: [{ injected: true }] }), SENDER.id);

    expect(combat.getFlag("pf2e-recall-knowledge-assistant", "attempts")).toBeUndefined();
  });
});

describe("registerSocket", () => {
  it("listens on the module's socket channel", () => {
    stubGame();
    registerSocket();
    expect(game.socket.on).toHaveBeenCalledWith(SOCKET_NAME, handleSocketMessage);
  });
});
