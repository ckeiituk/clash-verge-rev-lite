import { useEffect } from "react";
import { useVerge } from "@/hooks/use-verge";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Theme as TauriTheme } from "@tauri-apps/api/window";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { defaultTheme, defaultDarkTheme } from "@/pages/_theme";

type MaybeTauriWindow = Window &
  typeof globalThis & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };

const hasTauriInternals = (
  win: Window & typeof globalThis,
): win is MaybeTauriWindow =>
  "__TAURI_INTERNALS__" in (win as MaybeTauriWindow) ||
  "__TAURI__" in (win as MaybeTauriWindow);

type ThemeProviderProps = {
  children: React.ReactNode;
};

function hexToHsl(hex?: string): string | undefined {
  if (!hex) return undefined;
  let r = 0,
    g = 0,
    b = 0;
  hex = hex.replace("#", "");
  if (hex.length === 3)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];

  r = parseInt(hex.substring(0, 2), 16) / 255;
  g = parseInt(hex.substring(2, 4), 16) / 255;
  b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${(h * 360).toFixed(1)} ${s.toFixed(3)} ${l.toFixed(3)}`;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { verge } = useVerge();

  const themeModeSetting = verge?.theme_mode || "system";
  const customThemeSettings = verge?.theme_setting || {};

  useEffect(() => {
    const root = window.document.documentElement; // <html> тег
    const tauriWindow =
      typeof window !== "undefined" && hasTauriInternals(window)
        ? getCurrentWebviewWindow()
        : undefined;

    const safeSetTheme = (theme: TauriTheme): Promise<void> => {
      if (!tauriWindow) {
        return Promise.resolve();
      }
      return tauriWindow.setTheme(theme);
    };
    const listenThemeChange = (
      handler: Parameters<WebviewWindow["onThemeChanged"]>[0],
    ): Promise<UnlistenFn> => {
      if (!tauriWindow) {
        return Promise.resolve(() => {});
      }
      return tauriWindow.onThemeChanged(handler);
    };

    const applyTheme = (mode: "light" | "dark") => {
      root.classList.remove("light", "dark");
      root.classList.add(mode);

      void safeSetTheme(mode as TauriTheme).catch(console.error);

      const basePalette = mode === "light" ? defaultTheme : defaultDarkTheme;

      const variables = {
        "--background": hexToHsl(basePalette.background_color),
        "--foreground": hexToHsl(
          customThemeSettings.primary_text || basePalette.primary_text,
        ),
        "--card": hexToHsl(basePalette.background_color), // Используем тот же фон
        "--card-foreground": hexToHsl(
          customThemeSettings.primary_text || basePalette.primary_text,
        ),
        "--popover": hexToHsl(basePalette.background_color),
        "--popover-foreground": hexToHsl(
          customThemeSettings.primary_text || basePalette.primary_text,
        ),
        "--primary": hexToHsl(
          customThemeSettings.primary_color || basePalette.primary_color,
        ),
        "--primary-foreground": hexToHsl("#ffffff"), // Предполагаем белый текст на основном цвете
        "--secondary": hexToHsl(
          customThemeSettings.secondary_color || basePalette.secondary_color,
        ),
        "--secondary-foreground": hexToHsl(
          customThemeSettings.primary_text || basePalette.primary_text,
        ),
        "--muted-foreground": hexToHsl(
          customThemeSettings.secondary_text || basePalette.secondary_text,
        ),
        "--destructive": hexToHsl(
          customThemeSettings.error_color || basePalette.error_color,
        ),
        "--ring": hexToHsl(
          customThemeSettings.primary_color || basePalette.primary_color,
        ),
      };

      for (const [key, value] of Object.entries(variables)) {
        if (value) root.style.setProperty(key, value);
      }

      if (customThemeSettings.font_family) {
        root.style.setProperty("--font-sans", customThemeSettings.font_family);
      } else {
        root.style.removeProperty("--font-sans");
      }

      let styleElement = document.querySelector("style#verge-theme");
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = "verge-theme";
        document.head.appendChild(styleElement!);
      }
      if (styleElement) {
        styleElement.innerHTML = customThemeSettings.css_injection || "";
      }
    };

    if (themeModeSetting === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      applyTheme(systemTheme);
      const unlistenPromise = listenThemeChange(({ payload }) => {
        if (verge?.theme_mode === "system") applyTheme(payload);
      });
      return () => {
        void unlistenPromise.then((unlisten) => unlisten());
      };
    } else {
      applyTheme(themeModeSetting);
    }
  }, [themeModeSetting, customThemeSettings, verge?.theme_mode]);

  return <>{children}</>;
}
