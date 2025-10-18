import { useTranslation } from "react-i18next";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SnoozeOption } from "@/services/update-reminder-state";
import { cn } from "@root/lib/utils";

export interface UpdateReminderCardProps {
  version: string;
  changelog?: string;
  titleText?: string;
  onDetails: () => void;
  onSnooze: (durationMs: number) => void;
  onSkip: () => void;
  onClose?: () => void;
  snoozeOptions: SnoozeOption[];
}

export const UpdateReminderCard = (props: UpdateReminderCardProps) => {
  const { t } = useTranslation();
  const { version, changelog, titleText, onDetails, onSnooze, onSkip, onClose, snoozeOptions } = props;

  const handleSnooze = (durationMs: number) => {
    onSnooze(durationMs);
  };

  return (
    <section
      aria-live="polite"
      role="status"
      className={cn(
        "fixed inset-x-0 bottom-4 z-50 mx-4 flex justify-center",
        "md:right-4 md:mx-0 md:justify-end",
      )}
      data-testid="update-reminder-card"
    >
      <div className="max-w-sm rounded-lg border bg-card p-4 shadow-xl ring-1 ring-black/5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-2 text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {titleText ?? t("updateReminder.title", { version })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("updateReminder.subtitle")}
                </p>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  aria-label={t("updateReminder.actions.dismiss")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            {changelog && (
              <p className="text-sm text-muted-foreground" data-testid="update-reminder-changelog">
                {changelog}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onDetails} data-testid="update-reminder-install">
            {t("updateReminder.actions.install")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="update-reminder-snooze">
                {t("updateReminder.actions.snooze")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {snoozeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.durationMs}
                  onSelect={(event) => {
                    event.preventDefault();
                    handleSnooze(option.durationMs);
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
            data-testid="update-reminder-skip"
          >
            {t("updateReminder.actions.skip")}
          </Button>
        </div>
      </div>
    </section>
  );
};
