import useSWR from "swr";
import {
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
  useEffect,
} from "react";
import { useLockFn } from "ahooks";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { Event, UnlistenFn } from "@tauri-apps/api/event";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import ReactMarkdown from "react-markdown";

// Новые импорты
import { DialogRef } from "@/components/base";
import { useUpdateState, useSetUpdateState } from "@/services/states";
import { portableFlag } from "@/pages/_layout";
import { useListen } from "@/hooks/use-listen";
import { showNotice } from "@/services/noticeService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ExternalLink } from "lucide-react";

export const UpdateViewer = forwardRef<DialogRef>((props, ref) => {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [currentProgressListener, setCurrentProgressListener] =
    useState<UnlistenFn | null>(null);

  const updateState = useUpdateState();
  const setUpdateState = useSetUpdateState();
  const { addListener } = useListen();

  const { data: updateInfo } = useSWR("checkUpdate", checkUpdate, {
    errorRetryCount: 2,
    revalidateIfStale: false,
    focusThrottleInterval: 36e5,
  });

  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }));

  const markdownContent = useMemo(() => {
    if (!updateInfo?.body) return t("New Version is available");
    return updateInfo.body;
  }, [updateInfo, t]);

  const breakChangeFlag = useMemo(() => {
    return updateInfo?.body?.toLowerCase().includes("break change") ?? false;
  }, [updateInfo]);

  const onUpdate = useLockFn(async () => {
    if (portableFlag) {
      showNotice("error", t("Portable Updater Error"));
      return;
    }
    if (!updateInfo?.body) return;
    if (breakChangeFlag) {
      showNotice("error", t("Break Change Update Error"));
      return;
    }
    if (updateState) return;

    setUpdateState(true);
    setDownloaded(0); // Сбрасываем прогресс перед новой загрузкой
    setTotal(0);

    if (currentProgressListener) currentProgressListener();

    const progressListener = await addListener(
      "tauri://update-download-progress",
      (e: Event<any>) => {
        setTotal(e.payload.contentLength);
        setDownloaded((prev) => prev + e.payload.chunkLength);
      },
    );
    setCurrentProgressListener(() => progressListener);

    try {
      await updateInfo.downloadAndInstall();
      await relaunch();
    } catch (err: any) {
      showNotice("error", err?.message || err.toString());
    } finally {
      setUpdateState(false);
      progressListener?.();
      setCurrentProgressListener(null);
    }
  });

  useEffect(() => {
    return () => {
      currentProgressListener?.();
    };
  }, [currentProgressListener]);

  const downloadProgress = total > 0 ? (downloaded / total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex justify-between items-center pr-5">
            <DialogTitle>
              {t("New Version")} v{updateInfo?.version}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openUrl(
                  `https://github.com/ckeiituk/clash-verge-rev-lite/releases/tag/v${updateInfo?.version}`,
                )
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("Go to Release Page")}
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto my-4 pr-6 -mr-6">
          {breakChangeFlag && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("Warning")}</AlertTitle>
              <AlertDescription>{t("Break Change Warning")}</AlertDescription>
            </Alert>
          )}
          {/* Оборачиваем ReactMarkdown для красивой стилизации */}
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </article>
        </div>

        {updateState && (
          <div className="w-full space-y-1">
            <Progress value={downloadProgress} />
            <p className="text-xs text-muted-foreground text-right">
              {Math.round(downloadProgress)}%
            </p>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("Cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={onUpdate}
            disabled={updateState || breakChangeFlag}
          >
            {t("Update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
