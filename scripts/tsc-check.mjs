// Cross-platform helper for the `tsc` pre-commit hook and `npm install`.
//
// Why this exists:
// This repo is worked on from both Windows and WSL, which SHARE one
// node_modules/ folder. TypeScript 7 ships its compiler as a per-platform
// binary package (@typescript/typescript-<os>-<arch>), and npm only installs
// the one matching the OS that last ran the install. So whichever OS didn't
// run the last `npm install` fails with:
//   Error: Unable to resolve @typescript/typescript-linux-x64 ...
//
// This script detects the current platform, installs its TypeScript binary if
// missing (non-destructively, --no-save --force so the other platform's binary
// is kept), then runs `tsc --noEmit`.
//
// Usage:
//   node scripts/tsc-check.mjs           # ensure binary + run tsc --noEmit
//   node scripts/tsc-check.mjs --ensure  # ensure binary only (postinstall)

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgName = `@typescript/typescript-${process.platform}-${process.arch}`;
const pkgDir = join(root, "node_modules", "@typescript", pkgName.replace("@typescript/", ""));

function tsVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "node_modules", "typescript", "package.json"), "utf8"),
    );
    return pkg.version;
  } catch {
    return null;
  }
}

function ensureBinary() {
  if (existsSync(pkgDir)) return true;
  const version = tsVersion();
  if (!version) {
    console.error("tsc-check: node_modules/typescript not found — run `npm install` first.");
    return false;
  }
  console.log(`tsc-check: installing ${pkgName}@${version} for ${process.platform}/${process.arch}…`);
  const res = spawnSync("npm", ["install", "--no-save", "--force", `${pkgName}@${version}`], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  return res.status === 0 && existsSync(pkgDir);
}

if (!ensureBinary()) process.exit(1);
if (process.argv.includes("--ensure")) process.exit(0);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: root, stdio: "inherit", shell: true });
process.exit(tsc.status ?? 1);
