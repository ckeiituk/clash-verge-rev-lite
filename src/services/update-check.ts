import { check, Update } from "@tauri-apps/plugin-updater";

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
