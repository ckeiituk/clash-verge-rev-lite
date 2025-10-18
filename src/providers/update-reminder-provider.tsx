import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { UpdateReminderCard } from "@/components/update/update-reminder-card";
import { UpdateReminderToast } from "@/components/update/update-reminder-toast";
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
  safeCheckForUpdate,
} from "@/services/update-check";

interface ReminderData {
  version: string;
  body?: string | null;
  isMock?: boolean;
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

const isDebugEnabled =
  import.meta.env.DEV &&
  (import.meta.env.VITE_UPDATE_REMINDER_DEBUG ?? "true").toLowerCase() !== "false";

const MIN_RESCHEDULE_DELAY = 5 * 1000;

const getIsWindowActive = (): boolean => {
  if (typeof document === "undefined") return true;
  const isVisible = document.visibilityState === "visible";
  const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return isVisible && hasFocus;
};

export const UpdateReminderProvider = ({ children }: PropsWithChildren) => {
  const { state, dismissVersion, snoozeVersion, markShown, markNotified, setPreferredStyle, resetState } =
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

  const [mockReminder, setMockReminder] = useState<ReminderData | null>(null);

  const reminderData: ReminderData | null = useMemo(() => {
    if (mockReminder) return mockReminder;
    if (!updateInfo) return null;
    return {
      version: updateInfo.version,
      body: updateInfo.body,
    };
  }, [mockReminder, updateInfo]);

  const [detectedAtByVersion, setDetectedAtByVersion] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!reminderData?.version) {
      setDetectedAtByVersion({});
      return;
    }
    setDetectedAtByVersion((prev) => {
      if (prev[reminderData.version]) return prev;
      return { ...prev, [reminderData.version]: Date.now() };
    });
  }, [reminderData?.version]);

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
    const now = Date.now();
    const snoozedUntil = getSnoozedUntil(version, state);
    const lastShownAt = getLastShownAt(version, state);
    const lastNotificationAt = getLastNotificationAt(version, state);
    const detectedAt = detectedAtByVersion[version];

    if (isVersionDismissed(version, state)) {
      setIsVisible(false);
      setActiveVersion(null);
      return;
    }

    if (updateInProgress) {
      scheduleReminderCheck(REMINDER_INTERVAL_MS);
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
    const timeSinceShown = lastShownAt ? now - lastShownAt : null;

    const meetsCadence =
      (lastShownAt === undefined || lastShownAt === null) &&
      timeSinceDetected >= FIRST_REMINDER_DELAY_MS;

    const meetsInterval =
      typeof timeSinceShown === "number" && timeSinceShown >= REMINDER_INTERVAL_MS;

    if (!isWindowActive) {
      if (
        notificationPermissionGranted &&
        getIsTauriEnv() &&
        (!lastNotificationAt || now - lastNotificationAt >= REMINDER_INTERVAL_MS)
      ) {
        try {
          sendNotification({
            title: t("updateReminder.notification.title", { version }),
            body: t("updateReminder.notification.body"),
          });
          markNotified(version);
        } catch (error) {
          console.warn("[update-reminder] Failed to send notification", error);
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
          return Math.max(REMINDER_INTERVAL_MS - timeSinceShown, MIN_RESCHEDULE_DELAY);
        }
        return REMINDER_INTERVAL_MS;
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
    detectedAtByVersion,
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
    if (mockReminder?.isMock) {
      console.info("[update-reminder] Mock update details requested");
      setIsVisible(false);
      scheduleReminderCheck(REMINDER_INTERVAL_MS);
      return;
    }
    window.dispatchEvent(new CustomEvent("outclash:open-update-viewer"));
    setIsVisible(false);
    scheduleReminderCheck(REMINDER_INTERVAL_MS);
  }, [mockReminder?.isMock, scheduleReminderCheck]);

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
    if (!reminderData?.version) return;
    dismissVersion(reminderData.version);
    setIsVisible(false);
  }, [dismissVersion, reminderData?.version]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    scheduleReminderCheck(REMINDER_INTERVAL_MS);
  }, [scheduleReminderCheck]);

  useEffect(() => {
    if (!isVisible || !activeVersion) return;
    markShown(activeVersion);
  }, [isVisible, activeVersion, markShown]);

  useEffect(() => {
    if (!isDebugEnabled) return;
    const api = {
      trigger: (payload: { version: string; body?: string }) =>
        setMockReminder({ ...payload, isMock: true }),
      clear: () => setMockReminder(null),
      setStyle: (style: UpdateReminderStyle) => setPreferredStyle(style),
      reset: () => resetState(),
      showNow: () => evaluateReminder(),
      getState: () => state,
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
  }, [evaluateReminder, resetState, setPreferredStyle, state]);

  const debugPanel = isDebugEnabled ? (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-40 hidden flex-col gap-2 rounded-md border bg-background/90 p-3 text-xs shadow-lg backdrop-blur md:flex">
      <span className="font-semibold">Update Reminder Debug</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() =>
            setMockReminder({
              version: `v${new Date().toISOString().slice(11, 19)}`,
              body: "• Feature: Example change\n• Fix: Example fix",
              isMock: true,
            })
          }
        >
          Mock Update
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => setMockReminder(null)}
        >
          Clear Mock
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() =>
            setPreferredStyle(state.preferredStyle === "card" ? "toast" : "card")
          }
        >
          Style: {state.preferredStyle}
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => {
            resetState();
            setMockReminder(null);
          }}
        >
          Reset State
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => evaluateReminder()}
        >
          Re-evaluate
        </button>
      </div>
    </div>
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
        onDetails={handleDetails}
        onSnooze={handleSnooze}
        onSkip={handleSkip}
        onClose={handleClose}
        onAutoDismiss={() => {
          setIsVisible(false);
          scheduleReminderCheck(REMINDER_INTERVAL_MS);
        }}
        snoozeOptions={SNOOZE_OPTIONS}
      />
    ) : (
      <UpdateReminderCard
        version={reminderData.version}
        changelog={changelogSnippet}
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
