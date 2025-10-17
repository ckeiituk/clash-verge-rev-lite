/**
 * Verify versions are in sync across files based on package.json version.
 *
 * - Reads version from package.json (e.g., 1.2.3, 1.2.3-beta, 1.2.3+meta)
 * - Computes base semver (without pre-release/build) and compares with:
 *   - src-tauri/Cargo.toml
 *   - src-tauri/tauri.conf.json
 *
 * Exits with code 1 if any mismatch is found.
 *
 * Usage: pnpm verify-version
 */

import fs from "fs/promises";
import path from "path";

function getBaseVersion(v) {
  let base = v.replace(/-(alpha|beta|rc)(\.\d+)?/i, "");
  base = base.replace(/\+[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*/g, "");
  return base;
}

async function readPackageVersion() {
  const pkgPath = path.join(process.cwd(), "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  if (!pkg.version || typeof pkg.version !== "string") {
    throw new Error("package.json version is missing or invalid");
  }
  return pkg.version.startsWith("v") ? pkg.version.slice(1) : pkg.version;
}

async function readCargoVersion() {
  const cargoPath = path.join(process.cwd(), "src-tauri", "Cargo.toml");
  const content = await fs.readFile(cargoPath, "utf8");
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("Failed to read version from Cargo.toml");
  return match[1];
}

async function readTauriConfigVersion() {
  const tauriPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
  const raw = await fs.readFile(tauriPath, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.version || typeof cfg.version !== "string") {
    throw new Error("tauri.conf.json version is missing or invalid");
  }
  return cfg.version;
}

async function main() {
  try {
    const pkgVersion = await readPackageVersion();
    const base = getBaseVersion(pkgVersion);
    const cargoVersion = await readCargoVersion();
    const tauriVersion = await readTauriConfigVersion();

    const errors = [];
    if (cargoVersion !== base) {
      errors.push(`Cargo.toml version mismatch: expected ${base}, got ${cargoVersion}`);
    }
    if (tauriVersion !== base) {
      errors.push(`tauri.conf.json version mismatch: expected ${base}, got ${tauriVersion}`);
    }

    if (errors.length) {
      console.error("[verify-version] Version mismatches detected:\n" + errors.join("\n"));
      process.exit(1);
    }
    console.log(`[verify-version] OK — base=${base}`);
  } catch (err) {
    console.error("[verify-version] Failed:", err);
    process.exit(1);
  }
}

await main();

