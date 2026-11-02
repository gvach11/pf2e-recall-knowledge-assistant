import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const REPO = "https://github.com/gvach11/pf2e-recall-knowledge-assistant";

describe("module.json release URLs", () => {
  it("downloads the zip attached to this version's release", () => {
    expect(manifest.download).toBe(`${REPO}/releases/download/v${manifest.version}/${manifest.id}.zip`);
  });

  it("serves the manifest from a URL that works while releases are pre-releases", () => {
    // GitHub's releases/latest skips pre-releases, so it would 404 here.
    expect(manifest.manifest).toBe("https://raw.githubusercontent.com/gvach11/pf2e-recall-knowledge-assistant/master/module.json");
  });
});
