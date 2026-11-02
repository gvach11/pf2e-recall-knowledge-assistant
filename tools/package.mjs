// Builds the release zip: only what Foundry loads, at the zip root (no
// wrapping folder), plus a copy of module.json for the release assets.
// Not part of the module runtime.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const RELEASE_FILES = ["module.json", "scripts", "templates", "styles", "lang", "README.md", "LICENSE", "CHANGELOG.md"];

const { id } = JSON.parse(readFileSync("module.json", "utf8"));
const zipPath = join("dist", `${id}.zip`);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
copyFileSync("module.json", join("dist", "module.json"));

// bsdtar writes a zip when -a sees the .zip extension; GNU tar (e.g. Git
// Bash's) can't, so on Windows use the system tar explicitly.
const tar = process.platform === "win32" ? join(process.env.SystemRoot, "System32", "tar.exe") : "bsdtar";
execFileSync(tar, ["-a", "-c", "-f", zipPath, ...RELEASE_FILES], { stdio: "inherit" });

console.log(`Wrote ${zipPath}`);
