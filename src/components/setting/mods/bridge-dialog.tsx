import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface BridgeRelease {
  version: string;
  download_url: string;
  body: string;
}

interface BridgeStatus {
  release: BridgeRelease | null;
  forced: boolean;
}

interface BridgeProgress {
  downloaded: number;
  total: number;
  phase: string;
}

// localStorage (not sessionStorage): lightweight mode destroys the webview,
// which would reset a session-scoped flag and re-show a dismissed dialog on
// every webview re-creation. Keyed per version so a newer release re-prompts.
const dismissKey = (version: string) => `outclash:bridge-dismissed:${version}`;

const isDismissed = (version: string) => {
  try {
    return localStorage.getItem(dismissKey(version)) === "1";
  } catch {
    return false;
  }
};

const markDismissed = (version: string) => {
  try {
    localStorage.setItem(dismissKey(version), "1");
  } catch {
    // ignore storage failures
  }
};

const clearDismissed = (version: string) => {
  try {
    localStorage.removeItem(dismissKey(version));
  } catch {
    // ignore storage failures
  }
};

export function BridgeDialog() {
  const { t } = useTranslation();
  const [release, setRelease] = useState<BridgeRelease | null>(null);
  const [visible, setVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<BridgeProgress>({
    downloaded: 0,
    total: 0,
    phase: "downloading",
  });

  const showRelease = (r: BridgeRelease, forced: boolean) => {
    if (forced) clearDismissed(r.version);
    setRelease(r);
    setVisible(forced || !isDismissed(r.version));
  };

  const dismiss = () => {
    if (release) markDismissed(release.version);
    setVisible(false);
  };

  // The backend checks in the background and caches the result, so read the
  // cache first (instant, also carries the tray-click "forced" flag); fall
  // back to a live check when the cache is still empty right after startup.
  useEffect(() => {
    let cancelled = false;
    invoke<BridgeStatus>("bridge_status")
      .then((status) => {
        if (cancelled) return null;
        if (status?.release) {
          showRelease(status.release, status.forced);
          return null;
        }
        return invoke<BridgeRelease | null>("bridge_check");
      })
      .then((r) => {
        if (!cancelled && r) showRelease(r, false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Background discovery while the webview is alive
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<BridgeRelease & { forced: boolean }>("bridge-available", (event) => {
      showRelease(event.payload, event.payload.forced);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Allow settings "Check for Updates" to trigger this dialog immediately
  useEffect(() => {
    const handleRecheck = (e: Event) => {
      const detail = (e as CustomEvent<BridgeRelease>).detail;
      if (detail) showRelease(detail, true);
    };
    window.addEventListener("bridge-recheck", handleRecheck);
    return () => window.removeEventListener("bridge-recheck", handleRecheck);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<BridgeProgress>("bridge-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const handleUpdate = async () => {
    if (!release) return;
    setDownloading(true);
    try {
      await invoke("bridge_download", { url: release.download_url });
      // Installer launched — dismiss dialog, app stays running.
      // The installer will ask the user to close when they click Install.
      dismiss();
    } catch {
      setDownloading(false);
    }
  };

  const handleCancel = () => {
    setDownloading(false);
    dismiss();
  };

  if (!release || !visible) return null;

  const isInstalling = progress.phase === "installing";
  const pct =
    progress.total > 0 ? (progress.downloaded / progress.total) * 100 : 0;
  const downloadedMB = (progress.downloaded / 1024 / 1024).toFixed(1);
  const totalMB = (progress.total / 1024 / 1024).toFixed(1);

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => !open && !downloading && dismiss()}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!downloading}>
        <DialogHeader>
          <DialogTitle>
            {isInstalling
              ? t("Launching installer...")
              : downloading
                ? t("Downloading new version...")
                : t("BridgeUpdateTitle", { version: release.version })}
          </DialogTitle>
        </DialogHeader>

        {downloading ? (
          <div className="space-y-2 py-4">
            {isInstalling ? (
              <p className="text-xs text-muted-foreground text-center">
                {t("Please wait, the installer will open shortly...")}
              </p>
            ) : (
              <>
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground text-center">
                  {downloadedMB} / {totalMB} MB ({Math.round(pct)}%)
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">
            <p>{t("BridgeUpdateBody")}</p>
          </div>
        )}

        <DialogFooter>
          {downloading && !isInstalling ? (
            <Button variant="ghost" onClick={handleCancel}>
              {t("Cancel")}
            </Button>
          ) : !downloading ? (
            <>
              <Button variant="ghost" onClick={() => dismiss()}>
                {t("Later")}
              </Button>
              <Button onClick={handleUpdate}>{t("Update")}</Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
