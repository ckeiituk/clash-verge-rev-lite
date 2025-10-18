# Update Reminder Debug Tools

Development builds expose helper controls for exercising the update reminder banner.

- Enablement: active automatically when `import.meta.env.DEV` and `VITE_UPDATE_REMINDER_DEBUG` is not set to `false`.
- Floating panel (desktop only): buttons to mock an update payload, clear the mock, toggle between card/toast styles, reset stored state, and force a re-evaluation.
- Global helper: `window.__OUTCLASH_UPDATE_REMINDER__` exposes `trigger({ version, body })`, `clear()`, `setStyle("card" | "toast")`, `reset()`, `showNow()`, and `getState()`.
- Reminders remain hidden in production builds because the panel and helpers are wrapped in the same dev-only guard.

For automated checks, call `trigger` followed by `showNow` to present the banner without waiting for timers.

Background behavior (release and dev)
- Choose how reminders behave when the app is in background/minimized:
  - `os` (default): native OS notification once per 24h per version
  - `attention`: taskbar/dock attention ping (no OS toast)
  - `none`: do nothing in background

Set the build-time env var:
- Dev: `VITE_UPDATE_REMINDER_BACKGROUND=os|attention|none pnpm dev`
- Build: `VITE_UPDATE_REMINDER_BACKGROUND=attention pnpm build`
