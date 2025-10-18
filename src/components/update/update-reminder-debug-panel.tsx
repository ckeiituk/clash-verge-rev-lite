import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@root/lib/utils";
import type { UpdateReminderStyle } from "@/services/update-reminder-state";

interface UpdateReminderDebugPanelProps {
  fileSourceEnabled: boolean;
  localFeedVersion?: string;
  onMockUpdate: () => void;
  onClearMock: () => void;
  onToggleStyle: () => void;
  preferredStyle: UpdateReminderStyle;
  onToggleFullscreenGuard: () => void;
  pauseWhileFullscreen: boolean;
  onPauseHour: () => void;
  onResume: () => void;
  onReset: () => void;
  onReevaluate: () => void;
}

interface DragState {
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

const PANEL_MARGIN = 16;
const DRAG_HANDLE_SELECTOR = '[data-drag-handle="true"]';

const buttonClassName =
  "inline-flex items-center justify-center rounded-md border border-border bg-background/80 px-2 py-1 text-xs font-medium text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background hover:bg-accent hover:text-foreground active:translate-y-px active:bg-accent data-[state=on]:border-primary data-[state=on]:bg-primary/20 data-[state=on]:text-primary";

export const UpdateReminderDebugPanel = ({
  fileSourceEnabled,
  localFeedVersion,
  onMockUpdate,
  onClearMock,
  onToggleStyle,
  preferredStyle,
  onToggleFullscreenGuard,
  pauseWhileFullscreen,
  onPauseHour,
  onResume,
  onReset,
  onReevaluate,
}: UpdateReminderDebugPanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
  });
  const [isDragging, setIsDragging] = useState(false);

  const clampPosition = useCallback((nextX: number, nextY: number) => {
    if (typeof window === "undefined") {
      return { x: nextX, y: nextY };
    }

    const node = panelRef.current;
    if (!node) {
      return {
        x: Math.max(nextX, PANEL_MARGIN),
        y: Math.max(nextY, PANEL_MARGIN),
      };
    }

    const { width, height } = node.getBoundingClientRect();
    const maxX = Math.max(window.innerWidth - width - PANEL_MARGIN, PANEL_MARGIN);
    const maxY = Math.max(window.innerHeight - height - PANEL_MARGIN, PANEL_MARGIN);

    return {
      x: Math.min(Math.max(nextX, PANEL_MARGIN), maxX),
      y: Math.min(Math.max(nextY, PANEL_MARGIN), maxY),
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = panelRef.current;
    if (!node) return;

    const alignBottom = () => {
      const { height } = node.getBoundingClientRect();
      const candidateY = window.innerHeight - height - PANEL_MARGIN;
      setPosition((prev) => {
        if (prev.y !== PANEL_MARGIN) return prev;
        return clampPosition(prev.x, candidateY);
      });
    };

    const frame = window.requestAnimationFrame(alignBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [clampPosition]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

  const endDrag = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    const node = panelRef.current;
    if (node && node.hasPointerCapture(state.pointerId)) {
      node.releasePointerCapture(state.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const handle = target?.closest(DRAG_HANDLE_SELECTOR) as HTMLElement | null;
      if (!handle || !panelRef.current?.contains(handle)) return;

      const pointerId = event.pointerId;
      dragStateRef.current = {
        pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startX: position.x,
        startY: position.y,
      };

      panelRef.current.setPointerCapture(pointerId);
      setIsDragging(true);
      event.preventDefault();
    },
    [position.x, position.y],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      const deltaX = event.clientX - state.originX;
      const deltaY = event.clientY - state.originY;

      setPosition(clampPosition(state.startX + deltaX, state.startY + deltaY));
    },
    [clampPosition],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;
      endDrag();
    },
    [endDrag],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;
      endDrag();
    },
    [endDrag],
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto fixed z-40 hidden max-w-xs select-none rounded-md border bg-background/90 p-3 text-xs shadow-lg backdrop-blur md:flex md:w-80 md:flex-col md:gap-2",
        isDragging ? "cursor-grabbing" : "cursor-default",
      )}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 text-foreground",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        data-drag-handle="true"
      >
        <span className="font-semibold">Update Reminder Debug</span>
        <span className="text-[11px] text-muted-foreground">Drag me</span>
      </div>

      {fileSourceEnabled && (
        <span className="text-muted-foreground">
          Local feed: {localFeedVersion ?? "not available"}
        </span>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClassName} onClick={onMockUpdate}>
          Mock Update
        </button>
        <button type="button" className={buttonClassName} onClick={onClearMock}>
          Clear Mock
        </button>
        <button type="button" className={buttonClassName} onClick={onToggleStyle}>
          Style: {preferredStyle}
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={onToggleFullscreenGuard}
          data-state={pauseWhileFullscreen ? "on" : "off"}
          aria-pressed={pauseWhileFullscreen}
        >
          Fullscreen: {pauseWhileFullscreen ? "on" : "off"}
        </button>
        <button type="button" className={buttonClassName} onClick={onPauseHour}>
          Pause 1h
        </button>
        <button type="button" className={buttonClassName} onClick={onResume}>
          Resume
        </button>
        <button type="button" className={buttonClassName} onClick={onReset}>
          Reset State
        </button>
        <button type="button" className={buttonClassName} onClick={onReevaluate}>
          Re-evaluate
        </button>
      </div>
    </div>
  );
};
