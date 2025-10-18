# Update Reminder Debug Tools

Development builds expose helper controls for exercising the update reminder banner. You can also force them in release builds via a flag.

- Enablement: active automatically when `import.meta.env.DEV` and `VITE_UPDATE_REMINDER_DEBUG` is not set to `false`; can be forced in production with `VITE_UPDATE_REMINDER_DEBUG_FORCE=true`.
- Floating panel (desktop only): buttons to mock an update payload, clear the mock, toggle between card/toast styles, reset stored state, and force a re-evaluation.
- Global helper: `window.__OUTCLASH_UPDATE_REMINDER__` exposes `trigger({ version, body })`, `clear()`, `setStyle("card" | "toast")`, `reset()`, `showNow()`, and `getState()`.
- Reminders remain hidden in production builds because the panel and helpers are wrapped in the same dev-only guard.

For automated checks, call `trigger` followed by `showNow` to present the banner without waiting for timers.

Background behavior (release and dev)
- Choose how reminders behave when the app is in background/minimized:
  - `os` (default): native OS notification once per 24h per version
  - `attention`: taskbar/dock attention ping (no OS toast)
  - `none`: do nothing in background

Set build-time env vars:
- Dev: `VITE_UPDATE_REMINDER_BACKGROUND=os|attention|none pnpm dev`
- Build: `VITE_UPDATE_REMINDER_BACKGROUND=attention pnpm build`
- Force debug panel in release: `VITE_UPDATE_REMINDER_DEBUG_FORCE=true pnpm build`

Local update feed (testing only)
- Enable with `VITE_UPDATE_REMINDER_FILE_SOURCE=true`.
- Place `UPDATE.txt` in the Tauri config directory (e.g. `%APPDATA%/io.github.outclash/UPDATE.txt` on Windows, `~/Library/Application Support/io.github.outclash/UPDATE.txt` on macOS, `~/.config/io.github.outclash/UPDATE.txt` on Linux).
- Example:

```
version=0.9.99-test
title=Internal Test Build
staleness=hours:1
body=• Feature: Try the new banner
body=• Fix: Background attention mode
```

- When present, the file overrides the network updater, shows the banner immediately after the usual first-delay window, and re-prompts using `staleness` (defaults to 24h if omitted).
- Dev helpers expose `setFullscreenGuard`, `pauseFor(ms)`, and `resume()` for quick manual testing.
