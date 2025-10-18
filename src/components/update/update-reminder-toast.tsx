import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlarmClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SnoozeOption } from "@/services/update-reminder-state";
import { cn } from "@root/lib/utils";

interface UpdateReminderToastProps {
  version: string;
  changelog?: string;
  onDetails: () => void;
  onSnooze: (durationMs: number) => void;
  onSkip: () => void;
  onClose?: () => void;
  onAutoDismiss: () => void;
  snoozeOptions: SnoozeOption[];
  autoHideMs?: number;
}

export const UpdateReminderToast = (props: UpdateReminderToastProps) => {
  const {
    version,
    changelog,
    onDetails,
    onSnooze,
    onSkip,
    onClose,
    onAutoDismiss,
    snoozeOptions,
    autoHideMs = 8000,
  } = props;
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (autoHideMs <= 0 || isHovered) return;
    const handle = window.setTimeout(onAutoDismiss, autoHideMs);
    return () => window.clearTimeout(handle);
  }, [autoHideMs, isHovered, onAutoDismiss]);

  return (
    <section
      aria-live="assertive"
      role="status"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2",
        "md:left-auto md:right-4 md:translate-x-0",
      )}
      data-testid="update-reminder-toast"
    >
      <div className="flex items-start gap-3 rounded-md border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mt-0.5 text-primary">
          <AlarmClock className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {t("updateReminder.title", { version })}
              </p>
              {changelog && (
                <p className="text-xs text-muted-foreground" data-testid="update-reminder-toast-changelog">
                  {changelog}
                </p>
              )}
            </div>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label={t("updateReminder.actions.dismiss")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onDetails} data-testid="update-reminder-toast-install">
              {t("updateReminder.actions.install")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="update-reminder-toast-snooze">
                  {t("updateReminder.actions.snooze")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {snoozeOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.durationMs}
                    onSelect={(event) => {
                      event.preventDefault();
                      onSnooze(option.durationMs);
                    }}
                  >
                    {t(option.labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onSkip}
              data-testid="update-reminder-toast-skip"
            >
              {t("updateReminder.actions.skip")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
