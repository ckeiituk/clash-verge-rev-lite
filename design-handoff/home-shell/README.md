# Home Shell Design Handoff

Use [`index.html`](./index.html) as the upload target for `claude.ai/design`.

What is included:

- the left app shell and navigation
- the current Home screen layout
- a browser-only light and dark theme toggle
- mock profile, subscription, traffic, and proxy data
- a clickable connection control for basic state changes

What is intentionally removed:

- Electron preload and IPC
- router wiring
- real Mihomo or profile data
- app services, stores, and side effects

The goal is to give design tools a small, clean surface instead of the full Electron project.
