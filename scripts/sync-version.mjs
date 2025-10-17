/**
 * Sync versions across files based on package.json version.
 *
 * - Reads version from package.json (e.g., 1.2.3, 1.2.3-beta, 1.2.3+meta)
 * - Writes the base semver (without pre-release/build) to:
 *   - src-tauri/Cargo.toml
 *   - src-tauri/tauri.conf.json
 *
 * Usage: pnpm sync-version
 */

import fs from "fs/promises";
import path from "path";

function getBaseVersion(v) {
  // strip pre-release (-alpha/-beta/-rc) and build metadata (+...)
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

async function writeCargoVersion(baseVersion) {
  const cargoPath = path.join(process.cwd(), "src-tauri", "Cargo.toml");
  const content = await fs.readFile(cargoPath, "utf8");
  const lines = content.split("\n");
  const updated = lines.map((line) =>
    line.trim().startsWith("version =")
      ? line.replace(/version\s*=\s*"[^"]+"/, `version = "${baseVersion}` + `"`)
      : line,
  );
  await fs.writeFile(cargoPath, updated.join("\n"), "utf8");
}

async function writeTauriConfigVersion(baseVersion) {
  const tauriPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
  const raw = await fs.readFile(tauriPath, "utf8");
  const cfg = JSON.parse(raw);
  cfg.version = baseVersion;
  await fs.writeFile(tauriPath, JSON.stringify(cfg, null, 2), "utf8");
}

async function main() {
  try {
    const version = await readPackageVersion();
    const base = getBaseVersion(version);
    console.log(`[sync-version] package.json: ${version} → base: ${base}`);
    await writeCargoVersion(base);
    await writeTauriConfigVersion(base);
    console.log("[sync-version] Updated Cargo.toml and tauri.conf.json");
  } catch (err) {
    console.error("[sync-version] Failed:", err);
    process.exit(1);
  }
}

await main();

