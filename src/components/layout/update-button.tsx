import { useEffect, useMemo, useRef } from "react";
import { UpdateViewer } from "../setting/mods/update-viewer";
import { DialogRef } from "../base";
import { Button } from "@/components/ui/button";
import { t } from "i18next";
import { Download } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { cn } from "@root/lib/utils";
import { useUpdateCheck } from "@/services/update-check";
import { useVerge } from "@/hooks/use-verge";

interface Props {
  className?: string;
}

const STORAGE_KEY = "outclash:lastUpdateViewerVersion";

type StoredVersion = string | null;

// localStorage (not sessionStorage): lightweight mode destroys the webview,
// and a session-scoped flag would re-open the viewer on every re-creation.
const readStoredVersion = (): StoredVersion => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredVersion = (value: StoredVersion) => {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // ignore storage failures
  }
};

export const UpdateButton = (props: Props) => {
  const { className } = props;
  const { state: sidebarState } = useSidebar();
  const viewerRef = useRef<DialogRef>(null);
  const lastOpenedVersionRef = useRef<StoredVersion>(null);
  const { snapshot, badgeOnly, refresh } = useUpdateCheck();
  const { verge } = useVerge();
  const autoCheckUpdate = verge?.auto_check_update;

  useEffect(() => {
    lastOpenedVersionRef.current = readStoredVersion();
  }, []);

  // The daily poll lives here (always mounted in the sidebar) rather than on
  // the home page, so it keeps running no matter which page the window was
  // left on.
  useEffect(() => {
    if (!autoCheckUpdate) return;

    const touch = () => {
      try {
        localStorage.setItem("last_check_update", Date.now().toString());
      } catch {
        // ignore storage failures
      }
    };

    touch();
    refresh().catch(console.error);

    const timeout = setTimeout(() => {
      refresh().catch(console.error);
    }, 5000);

    const interval = setInterval(
      () => {
        touch();
        refresh().catch(console.error);
      },
      24 * 60 * 60 * 1000,
    );

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [autoCheckUpdate, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      viewerRef.current?.open();
    };
    window.addEventListener("outclash:open-update-viewer", handler);
    return () =>
      window.removeEventListener("outclash:open-update-viewer", handler);
  }, []);

  const version = snapshot?.version;
  const versionKey = version
    ? `${snapshot?.source ?? "tauri"}:${version}`
    : null;

  useEffect(() => {
    if (!versionKey) return;

    if (badgeOnly) {
      lastOpenedVersionRef.current = versionKey;
      writeStoredVersion(versionKey);
      return;
    }

    if (lastOpenedVersionRef.current === versionKey) return;

    lastOpenedVersionRef.current = versionKey;
    writeStoredVersion(versionKey);

    // for mock updates, keep behavior consistent: open only once per version per session
    viewerRef.current?.open();
  }, [versionKey, badgeOnly]);

  const hasUpdate = Boolean(version);
  const labelText = t("New update");
  const tooltipText = version ? `${labelText} v${version}` : labelText;
  const indicator = useMemo(() => {
    if (!hasUpdate) return null;
    return (
      <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(15,23,42,0.65)] dark:shadow-[0_0_0_2px_rgba(15,23,42,0.95)]" />
      </span>
    );
  }, [hasUpdate]);

  if (!hasUpdate) return null;

  return (
    <>
      <UpdateViewer ref={viewerRef} />
      {sidebarState === "collapsed" ? (
        <Button
          variant="outline"
          size="icon"
          className={cn("relative", className)}
          style={{ overflow: "visible" }}
          aria-label={tooltipText}
          disabled={badgeOnly}
          onClick={() => {
            if (badgeOnly) return;
            viewerRef.current?.open();
          }}
          title={tooltipText}
        >
          {indicator}
          <Download />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className={cn(
            "relative flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden text-center",
            className,
          )}
          style={{ overflow: "visible" }}
          disabled={badgeOnly}
          onClick={() => {
            if (badgeOnly) return;
            viewerRef.current?.open();
          }}
          title={tooltipText}
        >
          {indicator}
          <Download />
          <span className="min-w-0 truncate" aria-hidden="true">
            {labelText}
          </span>
        </Button>
      )}
    </>
  );
};
