import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { UserAttentionType } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { UpdateReminderCard } from "@/components/update/update-reminder-card";
import { UpdateReminderToast } from "@/components/update/update-reminder-toast";
import { UpdateReminderDebugPanel } from "@/components/update/update-reminder-debug-panel";
import { useVerge } from "@/hooks/use-verge";
import { useUpdateState } from "@/services/states";
import {
  FIRST_REMINDER_DELAY_MS,
  REMINDER_INTERVAL_MS,
  SNOOZE_OPTIONS,
  UpdateReminderStyle,
  getLastNotificationAt,
  getLastShownAt,
  getSnoozedUntil,
  isVersionDismissed,
  useUpdateReminderState,
} from "@/services/update-reminder-state";
import {
  ensureUpdateInfo,
  getIsTauriEnv,
  isFileSourceEnabled,
  loadLocalUpdateInfo,
  safeCheckForUpdate,
} from "@/services/update-check";

interface ReminderData {
  version: string;
  body?: string | null;
  titleText?: string;
  isMock?: boolean;
  intervalOverrideMs?: number;
  source: "plugin" | "file" | "debug";
  revision?: number;
}

const computeSnippet = (body?: string | null): string | undefined => {
  if (!body) return undefined;
  const normalized = body.replace(/\r\n/g, "\n");
  const firstParagraph = normalized.split(/\n{2,}/)[0] ?? "";
  const singleLine = firstParagraph.replace(/\s+/g, " ").trim();
  if (!singleLine) return undefined;
  const maxLength = 200;
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
};

const DEBUG_FORCE =
  (import.meta.env.VITE_UPDATE_REMINDER_DEBUG_FORCE ?? "false")
    .toString()
    .toLowerCase() === "true";
const DEBUG_FLAG =
  (import.meta.env.VITE_UPDATE_REMINDER_DEBUG ?? "true")
    .toString()
    .toLowerCase() !== "false";
const isDebugEnabled = (import.meta.env.DEV && DEBUG_FLAG) || DEBUG_FORCE;

const MIN_RESCHEDULE_DELAY = 5 * 1000;
const LOCAL_FILE_REFRESH_INTERVAL_MS = 15 * 1000;

type BackgroundBehavior = "os" | "attention" | "none";
const BACKGROUND_BEHAVIOR: BackgroundBehavior = (() => {
  const v = (import.meta.env.VITE_UPDATE_REMINDER_BACKGROUND as string | undefined)?.toLowerCase();
  return v === "attention" || v === "none" ? (v as BackgroundBehavior) : "os";
})();

const FILE_SOURCE_ENABLED = isFileSourceEnabled();

const getDetectionKey = (reminder: ReminderData): string => {
  if (typeof reminder.revision === "number") {
    return `${reminder.version}:${reminder.revision}`;
  }
  return reminder.version;
};

const getIsWindowActive = (): boolean => {
  if (typeof document === "undefined") return true;
  const isVisible = document.visibilityState === "visible";
  const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return isVisible && hasFocus;
};

export const UpdateReminderProvider = ({ children }: PropsWithChildren) => {
  const {
    state,
    dismissVersion,
    snoozeVersion,
    markShown,
    markNotified,
    setPreferredStyle,
    setPauseWhileFullscreen,
    setManualPauseUntil,
    resetState,
  } =
    useUpdateReminderState();
  const { verge } = useVerge();
  const updateInProgress = useUpdateState();
  const { t } = useTranslation();

  const autoCheck = verge?.auto_check_update;
  const shouldCheck = autoCheck || autoCheck === null;

  const { data: updateResult } = useSWR(
    shouldCheck ? "checkUpdate" : null,
    safeCheckForUpdate,
    {
      errorRetryCount: 2,
      revalidateIfStale: false,
      focusThrottleInterval: 36e5,
    },
  );

  const rawUpdateInfo = updateResult ?? null;
  const updateInfo = ensureUpdateInfo(rawUpdateInfo) ? rawUpdateInfo : null;

  const { data: localUpdate } = useSWR(
    FILE_SOURCE_ENABLED && getIsTauriEnv() ? "localUpdateFile" : null,
    loadLocalUpdateInfo,
    {
      refreshInterval: LOCAL_FILE_REFRESH_INTERVAL_MS,
      focusThrottleInterval: 5000,
      revalidateOnFocus: true,
    },
  );

  const [mockReminder, setMockReminder] = useState<ReminderData | null>(null);

  const reminderData: ReminderData | null = useMemo(() => {
    if (mockReminder) return mockReminder;
    if (FILE_SOURCE_ENABLED && localUpdate) {
      return {
        version: localUpdate.version,
        body: localUpdate.body,
        titleText: localUpdate.title,
        isMock: true,
        intervalOverrideMs: localUpdate.stalenessMs,
        source: "file",
        revision: localUpdate.lastModified,
      };
    }
    if (updateInfo) {
      return {
        version: updateInfo.version,
        body: updateInfo.body,
        source: "plugin",
      };
    }
    return null;
  }, [mockReminder, localUpdate, updateInfo]);

  const [detectedAtByKey, setDetectedAtByKey] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!reminderData) {
      setDetectedAtByKey({});
      return;
    }
    const key = getDetectionKey(reminderData);
    setDetectedAtByKey((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: Date.now() };
    });
  }, [reminderData]);

  const [isWindowActive, setIsWindowActive] = useState(getIsWindowActive);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibility = () => setIsWindowActive(getIsWindowActive());
    const handleFocus = () => setIsWindowActive(getIsWindowActive());
    const handleBlur = () => setIsWindowActive(getIsWindowActive());

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const [notificationPermissionGranted, setNotificationPermissionGranted] =
    useState<boolean | null>(null);
  useEffect(() => {
    if (!getIsTauriEnv()) return;
    if (notificationPermissionGranted !== null) return;

    let cancelled = false;
    (async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          granted = (await requestPermission()) === "granted";
        }
        if (!cancelled) {
          setNotificationPermissionGranted(granted);
        }
      } catch (error) {
        console.warn("[update-reminder] Failed to obtain notification permission", error);
        if (!cancelled) {
          setNotificationPermissionGranted(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notificationPermissionGranted]);

  const [isFullscreenBusy, setIsFullscreenBusy] = useState(false);
  useEffect(() => {
    if (!getIsTauriEnv() || !state.pauseWhileFullscreen) {
      setIsFullscreenBusy(false);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const value = await invoke<boolean>("detect_foreground_fullscreen");
        if (!cancelled) {
          setIsFullscreenBusy(Boolean(value));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[update-reminder] detect_foreground_fullscreen failed", error);
          setIsFullscreenBusy(false);
        }
      }
    };

    poll();
    const handle = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [state.pauseWhileFullscreen]);

  useEffect(() => {
    if (state.manualPauseUntil <= 0) return;
    const now = Date.now();
    if (state.manualPauseUntil <= now) {
      setManualPauseUntil(0);
      return;
    }
    const handle = window.setTimeout(() => {
      setManualPauseUntil(0);
    }, state.manualPauseUntil - now);
    return () => window.clearTimeout(handle);
  }, [setManualPauseUntil, state.manualPauseUntil]);

  const [isVisible, setIsVisible] = useState(false);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const reminderTimeoutRef = useRef<number | null>(null);
  const evaluateReminderRef = useRef<() => void>(() => {});

  const clearReminderTimeout = () => {
    if (reminderTimeoutRef.current !== null) {
      window.clearTimeout(reminderTimeoutRef.current);
      reminderTimeoutRef.current = null;
    }
  };

  const scheduleReminderCheck = useCallback((delayMs: number) => {
    clearReminderTimeout();
    const safeDelay = Math.max(delayMs, MIN_RESCHEDULE_DELAY);
    reminderTimeoutRef.current = window.setTimeout(() => {
      reminderTimeoutRef.current = null;
      evaluateReminderRef.current();
    }, safeDelay);
  }, []);

  const [toastDismissKey, setToastDismissKey] = useState(0);

  const evaluateReminder = useCallback(() => {
    clearReminderTimeout();

    if (!reminderData) {
      setIsVisible(false);
      setActiveVersion(null);
      return;
    }

    const { version } = reminderData;
    const detectionKey = getDetectionKey(reminderData);
    const intervalMs = reminderData.intervalOverrideMs ?? REMINDER_INTERVAL_MS;
    const now = Date.now();
    const snoozedUntil = getSnoozedUntil(version, state);
    const lastShownAt = getLastShownAt(version, state);
    const lastNotificationAt = getLastNotificationAt(version, state);
    const detectedAt = detectedAtByKey[detectionKey];
    const manualPauseActive = state.manualPauseUntil > now;

    if (isVersionDismissed(version, state)) {
      setIsVisible(false);
      setActiveVersion(null);
      return;
    }

    if (manualPauseActive) {
      const remaining = Math.max(state.manualPauseUntil - now, MIN_RESCHEDULE_DELAY);
      scheduleReminderCheck(remaining);
      setIsVisible(false);
      return;
    }

    if (state.pauseWhileFullscreen && isFullscreenBusy) {
      scheduleReminderCheck(Math.max(intervalMs / 6, MIN_RESCHEDULE_DELAY * 6));
      setIsVisible(false);
      return;
    }

    if (updateInProgress) {
      scheduleReminderCheck(intervalMs);
      setIsVisible(false);
      return;
    }

    if (snoozedUntil && now < snoozedUntil) {
      scheduleReminderCheck(snoozedUntil - now);
      setIsVisible(false);
      return;
    }

    if (!detectedAt) {
      scheduleReminderCheck(FIRST_REMINDER_DELAY_MS);
      setIsVisible(false);
      return;
    }

    const timeSinceDetected = now - detectedAt;
    const timeSinceShown = typeof lastShownAt === "number" ? now - lastShownAt : null;

    const meetsCadence =
      (lastShownAt === undefined || lastShownAt === null) &&
      timeSinceDetected >= FIRST_REMINDER_DELAY_MS;

    const meetsInterval = typeof timeSinceShown === "number" && timeSinceShown >= intervalMs;

    if (!isWindowActive) {
      if (getIsTauriEnv() && (!lastNotificationAt || now - lastNotificationAt >= intervalMs)) {
        try {
          if (BACKGROUND_BEHAVIOR === "os" && notificationPermissionGranted) {
            sendNotification({
              title: t("updateReminder.notification.title", { version }),
              body: t("updateReminder.notification.body"),
            });
            markNotified(version);
          } else if (BACKGROUND_BEHAVIOR === "attention") {
            void getCurrentWebviewWindow().requestUserAttention(
              UserAttentionType.Informational,
            );
            markNotified(version);
          }
        } catch (error) {
          console.warn("[update-reminder] Background behavior failed:", error);
        }
      }
      scheduleReminderCheck(MIN_RESCHEDULE_DELAY * 6);
      setIsVisible(false);
      return;
    }

    if (!meetsCadence && !meetsInterval) {
      const nextDelay = (() => {
        if (!lastShownAt) {
          return Math.max(FIRST_REMINDER_DELAY_MS - timeSinceDetected, MIN_RESCHEDULE_DELAY);
        }
        if (timeSinceShown !== null) {
          return Math.max(intervalMs - timeSinceShown, MIN_RESCHEDULE_DELAY);
        }
        return intervalMs;
      })();
      scheduleReminderCheck(nextDelay);
      setIsVisible(false);
      return;
    }

    setActiveVersion(version);
    setIsVisible(true);
    setToastDismissKey((key) => key + 1);
  }, [
    reminderData,
    state,
    updateInProgress,
    detectedAtByKey,
    isWindowActive,
    scheduleReminderCheck,
    markNotified,
    notificationPermissionGranted,
    t,
  ]);

  useEffect(() => {
    evaluateReminderRef.current = evaluateReminder;
  }, [evaluateReminder]);

  useEffect(() => evaluateReminder(), [evaluateReminder]);

  useEffect(
    () => () => {
      clearReminderTimeout();
    },
    [],
  );

  const handleDetails = useCallback(() => {
    if (reminderData?.isMock) {
      console.info(
        `[update-reminder] ${reminderData.source} update details requested`,
      );
      setIsVisible(false);
      scheduleReminderCheck(reminderData?.intervalOverrideMs ?? REMINDER_INTERVAL_MS);
      return;
    }
    if (!reminderData) return;
    window.dispatchEvent(new CustomEvent("outclash:open-update-viewer"));
    setIsVisible(false);
    scheduleReminderCheck(reminderData?.intervalOverrideMs ?? REMINDER_INTERVAL_MS);
  }, [mockReminder?.isMock, reminderData, scheduleReminderCheck]);

  const handleSnooze = useCallback(
    (durationMs: number) => {
      if (!reminderData?.version) return;
      snoozeVersion(reminderData.version, durationMs);
      setIsVisible(false);
      scheduleReminderCheck(durationMs);
    },
    [reminderData?.version, snoozeVersion, scheduleReminderCheck],
  );

  const handleSkip = useCallback(() => {
    if (!reminderData || !reminderData.version) return;
    dismissVersion(reminderData.version);
    setIsVisible(false);
    scheduleReminderCheck(reminderData.intervalOverrideMs ?? REMINDER_INTERVAL_MS);
  }, [dismissVersion, reminderData, scheduleReminderCheck]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    scheduleReminderCheck(reminderData?.intervalOverrideMs ?? REMINDER_INTERVAL_MS);
  }, [reminderData?.intervalOverrideMs, scheduleReminderCheck]);

  useEffect(() => {
    if (!isVisible || !activeVersion) return;
    markShown(activeVersion);
  }, [isVisible, activeVersion, markShown]);

  useEffect(() => {
    if (!isDebugEnabled) return;
    const api = {
      trigger: (payload: { version: string; body?: string; titleText?: string }) =>
        setMockReminder({ ...payload, isMock: true, source: "debug" }),
      clear: () => setMockReminder(null),
      setStyle: (style: UpdateReminderStyle) => setPreferredStyle(style),
      reset: () => resetState(),
      showNow: () => evaluateReminder(),
      getState: () => state,
      setFullscreenGuard: (value: boolean) => setPauseWhileFullscreen(value),
      pauseFor: (durationMs: number) =>
        setManualPauseUntil(Date.now() + Math.max(durationMs, 0)),
      resume: () => setManualPauseUntil(0),
    };

    const globalObject = window as Window & typeof globalThis & {
      __OUTCLASH_UPDATE_REMINDER__?: typeof api;
    };

    globalObject.__OUTCLASH_UPDATE_REMINDER__ = api;
    return () => {
      if (globalObject.__OUTCLASH_UPDATE_REMINDER__ === api) {
        delete globalObject.__OUTCLASH_UPDATE_REMINDER__;
      }
    };
  }, [
    evaluateReminder,
    resetState,
    setPreferredStyle,
    setPauseWhileFullscreen,
    setManualPauseUntil,
    state,
  ]);

  const debugPanel = isDebugEnabled ? (
    <UpdateReminderDebugPanel
      fileSourceEnabled={FILE_SOURCE_ENABLED}
      localFeedVersion={localUpdate?.version}
      onMockUpdate={() =>
        setMockReminder({
          version: `v${new Date().toISOString().slice(11, 19)}`,
          body: "• Feature: Example change\n• Fix: Example fix",
          titleText: "Dev Mock Update",
          isMock: true,
          source: "debug",
        })
      }
      onClearMock={() => setMockReminder(null)}
      onToggleStyle={() =>
        setPreferredStyle(state.preferredStyle === "card" ? "toast" : "card")
      }
      preferredStyle={state.preferredStyle}
      onToggleFullscreenGuard={() => setPauseWhileFullscreen(!state.pauseWhileFullscreen)}
      pauseWhileFullscreen={state.pauseWhileFullscreen}
      onPauseHour={() => setManualPauseUntil(Date.now() + 60 * 60 * 1000)}
      onResume={() => setManualPauseUntil(0)}
      onReset={() => {
        resetState();
        setMockReminder(null);
      }}
      onReevaluate={evaluateReminder}
    />
  ) : null;

  const changelogSnippet = useMemo(
    () => computeSnippet(reminderData?.body),
    [reminderData?.body, reminderData?.version],
  );

  const banner = isVisible && reminderData ? (
    state.preferredStyle === "toast" ? (
      <UpdateReminderToast
        key={`update-reminder-toast-${toastDismissKey}`}
        version={reminderData.version}
        changelog={changelogSnippet}
        titleText={reminderData.titleText}
        onDetails={handleDetails}
        onSnooze={handleSnooze}
        onSkip={handleSkip}
        onClose={handleClose}
        onAutoDismiss={() => {
          setIsVisible(false);
          scheduleReminderCheck(reminderData.intervalOverrideMs ?? REMINDER_INTERVAL_MS);
        }}
        snoozeOptions={SNOOZE_OPTIONS}
      />
    ) : (
      <UpdateReminderCard
        version={reminderData.version}
        changelog={changelogSnippet}
        titleText={reminderData.titleText}
        onDetails={handleDetails}
        onSnooze={handleSnooze}
        onSkip={handleSkip}
        onClose={handleClose}
        snoozeOptions={SNOOZE_OPTIONS}
      />
    )
  ) : null;

  return (
    <>
      {children}
      {banner}
      {debugPanel}
    </>
  );
};
