import { check, Update } from "@tauri-apps/plugin-updater";

const FILE_SOURCE_ENABLED =
  (import.meta.env.VITE_UPDATE_REMINDER_FILE_SOURCE ?? "false")
    .toString()
    .toLowerCase() === "true";

const isTauriEnv =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export type UpdateInfo = Update | null;

export const checkForUpdate = async (): Promise<UpdateInfo> => {
  if (!isTauriEnv) {
    return null;
  }

  return await check();
};

export const safeCheckForUpdate = async (): Promise<UpdateInfo> => {
  try {
    return await checkForUpdate();
  } catch (error) {
    console.error("[update-check] Failed to check for updates", error);
    return null;
  }
};

export const ensureUpdateInfo = (
  update: UpdateInfo,
): update is Update => update !== null;

export const getIsTauriEnv = (): boolean => isTauriEnv;

export interface LocalUpdateInfo {
  version: string;
  title?: string;
  body?: string;
  stalenessMs?: number;
  lastModified: number;
}

const parseDuration = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && direct > 0) {
    return direct;
  }

  const match = trimmed.match(/^(milliseconds|ms|seconds|s|minutes|m|hours|h|days|d)\s*:?\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return undefined;

  const unit = match[1].toLowerCase();
  const numeric = Number(match[2]);
  if (Number.isNaN(numeric) || numeric <= 0) return undefined;

  switch (unit) {
    case "milliseconds":
    case "ms":
      return numeric;
    case "seconds":
    case "s":
      return numeric * 1000;
    case "minutes":
    case "m":
      return numeric * 60 * 1000;
    case "hours":
    case "h":
      return numeric * 60 * 60 * 1000;
    case "days":
    case "d":
      return numeric * 24 * 60 * 60 * 1000;
    default:
      return undefined;
  }
};

const parseUpdateFile = (raw: string, lastModified: number): LocalUpdateInfo | null => {
  const lines = raw.split(/\r?\n/);
  let version: string | undefined;
  let title: string | undefined;
  const bodyLines: string[] = [];
  let stalenessMs: number | undefined;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!key) return;
    const value = rest.join("=").trim();
    switch (key.toLowerCase()) {
      case "version":
        if (value) version = value;
        break;
      case "title":
        if (value) title = value;
        break;
      case "body":
        if (value) bodyLines.push(value);
        break;
      case "staleness":
        stalenessMs = parseDuration(value);
        break;
      default:
        break;
    }
  });

  if (!version) return null;

  return {
    version,
    title,
    body: bodyLines.length > 0 ? bodyLines.join("\n") : undefined,
    stalenessMs,
    lastModified,
  };
};

export const isFileSourceEnabled = () => FILE_SOURCE_ENABLED;

export const loadLocalUpdateInfo = async (): Promise<LocalUpdateInfo | null> => {
  if (!FILE_SOURCE_ENABLED || !isTauriEnv) {
    return null;
  }

  try {
    const pathApi = await import("@tauri-apps/api/path");
    const fsApi = await import("@tauri-apps/plugin-fs");

    const dir = await pathApi.appConfigDir();
    const filePath = await pathApi.join(dir, "UPDATE.txt");

    if (!(await fsApi.exists(filePath))) {
      return null;
    }

    const [raw, stats] = await Promise.all([
      fsApi.readTextFile(filePath),
      fsApi.stat(filePath),
    ]);

    const modifiedAt = stats.mtime ? stats.mtime.getTime() : Date.now();
    return parseUpdateFile(raw, modifiedAt);
  } catch (error) {
    console.warn("[update-check] Failed to load local update info", error);
    return null;
  }
};
