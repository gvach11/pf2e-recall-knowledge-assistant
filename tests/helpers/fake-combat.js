// A Combat stand-in whose flags behave like Foundry's: `setFlag` accepts a
// dotted key path ("attempts.<key>") and only lands after a tick, the way a
// real document update waits on the server round-trip. That delay is what
// lets tests reproduce two writes racing each other.
export function createFakeCombat({ id = "c1", canModify = true } = {}) {
  const flags = {};
  return {
    id,
    canUserModify: () => canModify,
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
