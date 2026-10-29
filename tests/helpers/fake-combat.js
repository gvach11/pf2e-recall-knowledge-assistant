// Fields Foundry v14's Combat update permission lets a non-GM change.
const PLAYER_UPDATABLE_FIELDS = ["_id", "round", "turn", "combatants"];

// A Combat stand-in whose flags behave like Foundry's: `setFlag` accepts a
// dotted key path ("attempts.<key>") and only lands after a tick, the way a
// real document update waits on the server round-trip. That delay is what
// lets tests reproduce two writes racing each other.
//
// `canUserModify` mirrors v14's Combat#canUpdate: the answer depends on the
// changed fields, so a player asked about no data at all is told "yes".
// `isGM: false` makes this combat behave as seen from a player's client.
export function createFakeCombat({ id = "c1", isGM = true } = {}) {
  const flags = {};
  return {
    id,
    canUserModify: (user, action, data = {}) => isGM || Object.keys(data).every((key) => PLAYER_UPDATABLE_FIELDS.includes(key)),
    getFlag: (scope, key) => readPath(flags, `${scope}.${key}`),
    setFlag: async (scope, key, value) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      writePath(flags, `${scope}.${key}`, value);
    },
  };
}

function readPath(obj, path) {
  return path.split(".").reduce((node, part) => node?.[part], obj);
}

function writePath(obj, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let node = obj;
  for (const part of parts) node = node[part] ??= {};
  node[last] = value;
}
