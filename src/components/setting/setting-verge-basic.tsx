import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { copyClashEnv } from "@/services/cmds";
import { useVerge } from "@/hooks/use-verge";
import { useSetThemeMode } from "@/services/states";
import { languages } from "@/services/i18n";
import { showNotice } from "@/services/noticeService";
import getSystem from "@/utils/get-system";
import { routers } from "@/pages/_routers";

import { DialogRef, Switch } from "@/components/base";
import { TooltipIcon } from "@/components/base/base-tooltip-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GuardState } from "./mods/guard-state";
import { ThemeModeSwitch } from "./mods/theme-mode-switch"; // Импортируем наш новый компонент

import {
  Copy,
  Languages,
  Palette,
  MousePointerClick,
  Terminal,
  Home,
  FileTerminal,
  SwatchBook,
  LayoutTemplate,
  Sparkles,
  Keyboard,
} from "lucide-react";

import { ConfigViewer } from "./mods/config-viewer";
import { HotkeyViewer } from "./mods/hotkey-viewer";
import { MiscViewer } from "./mods/misc-viewer";
import { ThemeViewer } from "./mods/theme-viewer";
import { LayoutViewer } from "./mods/layout-viewer";
import { UpdateViewer } from "./mods/update-viewer";
import { BackupViewer } from "./mods/backup-viewer";

interface Props {
  onError?: (err: Error) => void;
}

const OS = getSystem();

const languageOptions = Object.entries(languages).map(([code, _]) => {
  const labels: { [key: string]: string } = {
    en: "English",
    ru: "Русский",
    zh: "中文",
    fa: "فارسی",
    tt: "Татар",
    id: "Bahasa Indonesia",
    ar: "العربية",
    ko: "한국어",
    tr: "Türkçe",
  };
  return { code, label: labels[code] || code };
});

const SettingRow = ({
  label,
  extra,
  children,
  onClick,
}: {
  label: React.ReactNode;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
}) => (
  <div
    className={`flex items-center justify-between py-3 border-b border-border last:border-b-0 ${onClick ? "cursor-pointer hover:bg-accent/50 -mx-3 px-3 rounded-md" : ""}`}
    onClick={onClick}
  >
    <div className="flex items-center gap-2">
      <div className="text-sm font-medium">{label}</div>
      {extra && <div className="text-muted-foreground">{extra}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const LabelWithIcon = ({
  icon,
  text,
}: {
  icon: React.ElementType;
  text: string;
}) => {
  const Icon = icon;
  return (
    <span className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {text}
    </span>
  );
};

const SettingVergeBasic = ({ onError }: Props) => {
  const { t } = useTranslation();
  const { verge, patchVerge, mutateVerge } = useVerge();
  const setThemeMode = useSetThemeMode();
  const {
    theme_mode,
    language,
    tray_event,
    env_type,
    startup_script,
    start_page,
  } = verge ?? {};

  const configRef = useRef<DialogRef>(null);
  const hotkeyRef = useRef<DialogRef>(null);
  const miscRef = useRef<DialogRef>(null);
  const themeRef = useRef<DialogRef>(null);
  const layoutRef = useRef<DialogRef>(null);
  const updateRef = useRef<DialogRef>(null);
  const backupRef = useRef<DialogRef>(null);

  const onChangeData = (patch: any) => {
    // Optimistically update SWR cache
    mutateVerge({ ...verge, ...patch }, false);
    // If theme mode is changed, also update local theme context immediately
    if (Object.prototype.hasOwnProperty.call(patch, "theme_mode")) {
      const mode = patch.theme_mode as "light" | "dark" | "system" | undefined;
      if (mode === "light" || mode === "dark" || mode === "system") {
        setThemeMode(mode);
      }
    }
  };

  const onCopyClashEnv = useCallback(async () => {
    await copyClashEnv();
    showNotice("success", t("Copy Success"), 1000);
  }, [t]);

  const onSelectFormat = (value: string) => value;

  return (
    <div>
      <h3 className="text-lg font-medium mb-4">{t("Verge Basic Setting")}</h3>
      <div className="space-y-1">
        <ThemeViewer ref={themeRef} />
        <ConfigViewer ref={configRef} />
        <HotkeyViewer ref={hotkeyRef} />
        <MiscViewer ref={miscRef} />
        <LayoutViewer ref={layoutRef} />
        <UpdateViewer ref={updateRef} />
        <BackupViewer ref={backupRef} />

        <SettingRow
          label={<LabelWithIcon icon={Languages} text={t("Language")} />}
        >
          <GuardState
            value={language ?? "en"}
            onCatch={onError}
            onChangeProps="onValueChange"
            onFormat={onSelectFormat}
            onChange={(e) => onChangeData({ language: e })}
            onGuard={(e) => patchVerge({ language: e })}
          >
            <Select>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map(({ code, label }) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuardState>
        </SettingRow>

        <SettingRow
          label={<LabelWithIcon icon={Palette} text={t("Theme Mode")} />}
        >
          <GuardState
            value={theme_mode}
            onCatch={onError}
            onChange={(e) => onChangeData({ theme_mode: e })}
            onGuard={(e) => patchVerge({ theme_mode: e })}
          >
            <ThemeModeSwitch />
          </GuardState>
        </SettingRow>

        {OS !== "linux" && (
          <SettingRow
            label={
              <LabelWithIcon
                icon={MousePointerClick}
                text={t("Tray Click Event")}
              />
            }
          >
            <GuardState
              value={tray_event ?? "main_window"}
              onCatch={onError}
              onFormat={(v) => v}
              onChange={(e) => onChangeData({ tray_event: e })}
              onGuard={(e) => patchVerge({ tray_event: e })}
              onChangeProps="onValueChange"
            >
              <Select>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main_window">
                    {t("Show Main Window")}
                  </SelectItem>
                  <SelectItem value="tray_menu">
                    {t("Show Tray Menu")}
                  </SelectItem>
                  <SelectItem value="system_proxy">
                    {t("System Proxy")}
                  </SelectItem>
                  <SelectItem value="tun_mode">{t("Tun Mode")}</SelectItem>
                  <SelectItem value="disable">{t("Disable")}</SelectItem>
                </SelectContent>
              </Select>
            </GuardState>
          </SettingRow>
        )}

        <SettingRow
          label={<LabelWithIcon icon={Home} text={t("Start Page")} />}
        >
          <GuardState
            value={start_page ?? "/"}
            onCatch={onError}
            onChangeProps="onValueChange"
            onFormat={(value: string) => value}
            onChange={(e) => onChangeData({ start_page: e })}
            onGuard={(e) => patchVerge({ start_page: e })}
          >
            <Select>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {routers
                  .filter((page) => page.label && page.path !== "/")
                  .map((page) => (
                    <SelectItem key={page.path} value={page.path}>
                      {t(page.label!)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </GuardState>
        </SettingRow>

        {/*<SettingRow*/}
        {/*  onClick={() => themeRef.current?.open()}*/}
        {/*  label={<LabelWithIcon icon={SwatchBook} text={t("Theme Setting")} />}*/}
        {/*/>*/}
        <SettingRow
          onClick={() => layoutRef.current?.open()}
          label={
            <LabelWithIcon icon={LayoutTemplate} text={t("Layout Setting")} />
          }
        />
        <SettingRow
          onClick={() => miscRef.current?.open()}
          label={<LabelWithIcon icon={Sparkles} text={t("Miscellaneous")} />}
        />
        <SettingRow
          onClick={() => hotkeyRef.current?.open()}
          label={<LabelWithIcon icon={Keyboard} text={t("Hotkey Setting")} />}
        />
      </div>
    </div>
  );
};

export default SettingVergeBasic;
