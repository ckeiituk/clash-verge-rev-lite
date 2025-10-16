import { listen, UnlistenFn, EventCallback } from "@tauri-apps/api/event";
import { event } from "@tauri-apps/api";
import { useRef } from "react";

export const useListen = () => {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isTauriEnv =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in (window as any) || "__TAURI__" in (window as any));

  const addListener = async <T>(
    eventName: string,
    handler: EventCallback<T>,
  ) => {
    if (!isTauriEnv) {
      // Return a no-op unlisten in web:dev
      const noop = () => {};
      return noop;
    }
    const unlisten = await listen(eventName, handler);
    unlistenFns.current.push(unlisten);
    return unlisten;
  };
  const removeAllListeners = () => {
    unlistenFns.current.forEach((unlisten) => unlisten());
    unlistenFns.current = [];
  };

  const setupCloseListener = async function () {
    if (!isTauriEnv) return;
    // Do not clear listeners on close-requested (we hide to tray). Clean up only when window is destroyed.
    await event.once("tauri://destroyed", async () => {
      removeAllListeners();
    });
  };

  return {
    addListener,
    setupCloseListener,
  };
};
