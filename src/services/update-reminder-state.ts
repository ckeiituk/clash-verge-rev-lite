import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

export type UpdateReminderStyle = "card" | "toast";

export interface SnoozeOption {
  durationMs: number;
  labelKey: string;
}

const STORAGE_KEY = "outclash:updateReminder";

const updateReminderSchema = z.object({
  dismissedVersions: z.array(z.string()).default([]),
  snoozedUntil: z.record(z.number()).default({}),
  lastShownAtByVersion: z.record(z.number()).default({}),
  lastNotificationAtByVersion: z.record(z.number()).default({}),
  preferredStyle: z.enum(["card", "toast"]).default("card"),
});

export type UpdateReminderState = z.infer<typeof updateReminderSchema>;

const defaultState: UpdateReminderState = {
  dismissedVersions: [],
  snoozedUntil: {},
  lastShownAtByVersion: {},
  lastNotificationAtByVersion: {},
  preferredStyle: "card",
};

const safeParseState = (raw: string | null): UpdateReminderState => {
  if (!raw) return defaultState;

  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = updateReminderSchema.safeParse(parsed);
    return result.success ? result.data : defaultState;
  } catch (error) {
    console.warn("[update-reminder] Failed to parse stored state", error);
    return defaultState;
  }
};

const readStoredState = (): UpdateReminderState => {
  if (typeof window === "undefined") {
    return defaultState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return safeParseState(raw);
  } catch (error) {
    console.warn("[update-reminder] Failed to read localStorage", error);
    return defaultState;
  }
};

const writeStoredState = (state: UpdateReminderState) => {
  if (typeof window === "undefined") return;

  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn("[update-reminder] Failed to persist state", error);
  }
};

export const useUpdateReminderState = () => {
  const [state, setState] = useState<UpdateReminderState>(() => readStoredState());

  useEffect(() => {
    writeStoredState(state);
  }, [state]);

  const dismissVersion = useCallback((version: string) => {
    setState((prev) => {
      if (prev.dismissedVersions.includes(version)) {
        return prev;
      }

      const next: UpdateReminderState = {
        ...prev,
        dismissedVersions: [...prev.dismissedVersions, version],
      };

      const { [version]: _omit, ...rest } = prev.snoozedUntil;
      next.snoozedUntil = rest;

      return next;
    });
  }, []);

  const snoozeVersion = useCallback((version: string, durationMs: number) => {
    setState((prev) => {
      const next: UpdateReminderState = {
        ...prev,
        snoozedUntil: {
          ...prev.snoozedUntil,
          [version]: Date.now() + durationMs,
        },
        dismissedVersions: prev.dismissedVersions.filter((v) => v !== version),
      };
      return next;
    });
  }, []);

  const markShown = useCallback((version: string) => {
    setState((prev) => {
      const next: UpdateReminderState = {
        ...prev,
        lastShownAtByVersion: {
          ...prev.lastShownAtByVersion,
          [version]: Date.now(),
        },
      };
      return next;
    });
  }, []);

  const markNotified = useCallback((version: string) => {
    setState((prev) => {
      const next: UpdateReminderState = {
        ...prev,
        lastNotificationAtByVersion: {
          ...prev.lastNotificationAtByVersion,
          [version]: Date.now(),
        },
      };
      return next;
    });
  }, []);

  const setPreferredStyle = useCallback((style: UpdateReminderStyle) => {
    setState((prev) => ({
      ...prev,
      preferredStyle: style,
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(defaultState);
  }, []);

  return useMemo(
    () => ({
      state,
      setState,
      dismissVersion,
      snoozeVersion,
      markShown,
      markNotified,
      setPreferredStyle,
      resetState,
    }),
    [
      state,
      dismissVersion,
      snoozeVersion,
      markShown,
      markNotified,
      setPreferredStyle,
      resetState,
    ],
  );
};

export const FIRST_REMINDER_DELAY_MS = 10 * 60 * 1000;
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { durationMs: 60 * 60 * 1000, labelKey: "updateReminder.actions.snoozeOptions.1h" },
  { durationMs: 24 * 60 * 60 * 1000, labelKey: "updateReminder.actions.snoozeOptions.1d" },
  { durationMs: 7 * 24 * 60 * 60 * 1000, labelKey: "updateReminder.actions.snoozeOptions.1w" },
];

export const getSnoozedUntil = (
  version: string,
  state: UpdateReminderState,
): number | null => state.snoozedUntil[version] ?? null;

export const getLastShownAt = (
  version: string,
  state: UpdateReminderState,
): number | null => state.lastShownAtByVersion[version] ?? null;

export const getLastNotificationAt = (
  version: string,
  state: UpdateReminderState,
): number | null => state.lastNotificationAtByVersion[version] ?? null;

export const isVersionDismissed = (
  version: string,
  state: UpdateReminderState,
): boolean => state.dismissedVersions.includes(version);
