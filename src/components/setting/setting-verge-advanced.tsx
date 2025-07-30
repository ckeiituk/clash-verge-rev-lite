import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { version } from "@root/package.json";

// Сервисы и хуки
import {
  exitApp,
  openAppDir,
  openCoreDir,
  openLogsDir,
  openDevTools,
  exportDiagnosticInfo,
} from "@/services/cmds";
import { showNotice } from "@/services/noticeService";

// Компоненты
import { DialogRef } from "@/components/base";
import { TooltipIcon } from "@/components/base/base-tooltip-icon";
import { Button } from "@/components/ui/button";

// --- НАЧАЛО ИЗМЕНЕНИЙ 1: Импортируем все нужные иконки ---
import {
  Settings,
  Copy,
  Info,
  Archive,
  FileCode,
  Folder,
  FolderCog,
  FolderClock,
  RefreshCw,
  Terminal,
  Feather,
  LogOut,
  ClipboardList,
} from "lucide-react";

// Модальные окна
import { ConfigViewer } from "./mods/config-viewer";
import { HotkeyViewer } from "./mods/hotkey-viewer";
import { MiscViewer } from "./mods/misc-viewer";
import { ThemeViewer } from "./mods/theme-viewer";
import { LayoutViewer } from "./mods/layout-viewer";
import { UpdateViewer } from "./mods/update-viewer";
import { BackupViewer } from "./mods/backup-viewer";
import { LiteModeViewer } from "./mods/lite-mode-viewer";

interface Props {
  onError?: (err: Error) => void;
}

// Наш переиспользуемый компонент для строки настроек
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
      {/* Мы ожидаем, что label теперь может быть сложным компонентом */}
      <div className="text-sm font-medium">{label}</div>
      {extra && <div className="text-muted-foreground">{extra}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const SettingVergeAdvanced = ({ onError }: Props) => {
  const { t } = useTranslation();

  const configRef = useRef<DialogRef>(null);
  const hotkeyRef = useRef<DialogRef>(null);
  const miscRef = useRef<DialogRef>(null);
  const themeRef = useRef<DialogRef>(null);
  const layoutRef = useRef<DialogRef>(null);
  const updateRef = useRef<DialogRef>(null);
  const backupRef = useRef<DialogRef>(null);
  const liteModeRef = useRef<DialogRef>(null);

  const onCheckUpdate = async () => {
    try {
      const info = await checkUpdate();
      if (!info?.available) {
        showNotice("success", t("Currently on the Latest Version"));
      } else {
        updateRef.current?.open();
      }
    } catch (err: any) {
      showNotice("error", err.message || err.toString());
    }
  };

  const onExportDiagnosticInfo = useCallback(async () => {
    await exportDiagnosticInfo();
    showNotice("success", t("Copy Success"), 1000);
  }, []);

  // Вспомогательная функция для создания лейбла с иконкой
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

  return (
    <div>
      <h3 className="text-lg font-medium mb-4">
        {t("Verge Advanced Setting")}
      </h3>
      <div className="space-y-1">
        <ThemeViewer ref={themeRef} />
        <ConfigViewer ref={configRef} />
        <HotkeyViewer ref={hotkeyRef} />
        <MiscViewer ref={miscRef} />
        <LayoutViewer ref={layoutRef} />
        <UpdateViewer ref={updateRef} />
        <BackupViewer ref={backupRef} />
        <LiteModeViewer ref={liteModeRef} />

        {/* --- НАЧАЛО ИЗМЕНЕНИЙ 2: Добавляем иконки к каждому пункту --- */}
        <SettingRow
          onClick={() => backupRef.current?.open()}
          label={<LabelWithIcon icon={Archive} text={t("Backup Setting")} />}
          extra={<TooltipIcon tooltip={t("Backup Setting Info")} />}
        />
        <SettingRow
          onClick={() => configRef.current?.open()}
          label={<LabelWithIcon icon={FileCode} text={t("Runtime Config")} />}
        />
        <SettingRow
          onClick={openAppDir}
          label={<LabelWithIcon icon={Folder} text={t("Open Conf Dir")} />}
          extra={<TooltipIcon tooltip={t("Open Conf Dir Info")} />}
        />
        <SettingRow
          onClick={openCoreDir}
          label={<LabelWithIcon icon={FolderCog} text={t("Open Core Dir")} />}
        />
        <SettingRow
          onClick={openLogsDir}
          label={<LabelWithIcon icon={FolderClock} text={t("Open Logs Dir")} />}
        />
        <SettingRow
          onClick={onCheckUpdate}
          label={
            <LabelWithIcon icon={RefreshCw} text={t("Check for Updates")} />
          }
        />
        <SettingRow
          onClick={openDevTools}
          label={<LabelWithIcon icon={Terminal} text={t("Open Dev Tools")} />}
        />
        <SettingRow
          label={
            <LabelWithIcon
              icon={Feather}
              text={t("LightWeight Mode Settings")}
            />
          }
          extra={<TooltipIcon tooltip={t("LightWeight Mode Info")} />}
          onClick={() => liteModeRef.current?.open()}
        />

        <SettingRow
          label={<LabelWithIcon icon={Info} text={t("Verge Version")} />}
        >
          <p className="text-sm font-medium pr-2 font-mono">v{version}</p>
        </SettingRow>
      </div>
    </div>
  );
};

export default SettingVergeAdvanced;
