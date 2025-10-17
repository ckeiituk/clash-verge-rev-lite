## v0.2.1

New

- Version sync and verification: added `sync-version` and `verify-version` scripts. Versions in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` are auto-synced from `package.json` before builds (locally and in CI) and verified for consistency.

Fixes

- Linux (Ubuntu) linking in CI: install `build-essential`, `pkg-config`, and `libc6-dev` to fix missing CRT objects (`Scrt1.o`, `crti.o`, etc.).

CI/Release

- Unified release uploads to always use the `package.json` version (single source of truth) across all jobs.
- Added sync + verify steps to dev/release/alpha workflows for early detection of version drift.
- Consistent Windows artifact renaming based on the unified version.

Known limitations

- macOS builds remain disabled.

## v0.2.0

New

- Home: added Rule/Global mode switch.
- Home: added a quick “Switch to …” button to toggle between System Proxy and TUN.
- Network requests include an OutClash identifier in the User-Agent header.

Fixes

- RU locale: removed duplicate keys and refined wording.

CI/Release

- Update manifests (including Fixed WebView2) are generated for matching tags.

Known limitations

- macOS builds remain disabled.

## v0.1.0

**🎉 First release of OutClash as independent project**

- project fully renamed from Clash Verge Rev to OutClash
- service binaries renamed: to `outclash-service`
- updated all configurations and build scripts for new project name
- macOS builds temporarily disabled (no certificate available)
- updated project identifier
- all dependencies and configurations updated
