# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OutClash is a Clash Meta GUI desktop application based on Tauri 2 framework. It's a fork of Clash Verge Rev that manages VPN/proxy connections through the Mihomo (Clash.Meta) core. The application uses:

- **Backend**: Rust (Tauri 2.6.2) for system integration and core management
- **Frontend**: React 19 + TypeScript + Vite for the UI
- **Architecture**: Hybrid Tauri app with IPC communication between Rust backend and React frontend

## Development Commands

### Initial Setup

```bash
# Install dependencies (requires pnpm globally: npm install pnpm -g)
pnpm install

# Download Mihomo core binary (required before first run)
pnpm run prebuild
# Force update to latest version:
pnpm run prebuild --force
```

### Development

```bash
# Run dev server with hot reload
pnpm dev

# Run alternate instance (if one already running)
pnpm dev:diff

# Frontend only (web development)
pnpm web:dev
pnpm web:build
pnpm web:serve
```

### Building

```bash
# Production build (optimized, takes longer)
pnpm build

# Fast build for testing (disables optimization & LTO)
pnpm build:fast
```

### Code Quality

```bash
# Rust backend
pnpm clippy          # Linting
pnpm fmt             # Format Rust code
# Or manually: cargo fmt --manifest-path ./src-tauri/Cargo.toml

# Frontend TypeScript/React
pnpm format          # Format all code
pnpm format:check    # Check formatting without modifying
```

### Release Scripts

```bash
pnpm updater         # Generate updater manifest
pnpm portable        # Package portable version (Windows only)
pnpm release-version # Bump version
pnpm publish-version # Publish release
```

## Architecture

### Backend (Rust - src-tauri/src/)

The Rust backend is organized into several key modules:

#### Core Modules (src-tauri/src/)

- **`cmd/`**: Tauri command handlers - all functions exposed to frontend via IPC
- **`config/`**: Configuration management (clash.rs, profiles.rs, verge.rs)
  - `clash.rs`: Clash core configuration
  - `profiles.rs`: Profile management (subscriptions, local configs)
  - `verge.rs`: Application-specific settings
  - `encrypt.rs`: Encryption utilities for sensitive data
- **`core/`**: Core application logic
  - `core.rs`: Mihomo core process management
  - `handle.rs`: Global app handle singleton
  - `service.rs`: System service management (Windows/Linux/macOS)
  - `sysopt.rs`: System proxy and TUN mode configuration
  - `hotkey.rs`: Global hotkey handling
  - `timer.rs`: Scheduled tasks (profile updates)
  - `tray/`: System tray icon and menu
  - `backup.rs`: WebDAV backup/restore
- **`enhance/`**: Profile enhancement scripts (JavaScript execution via boa_engine)
- **`feat/`**: Feature implementations
- **`state/`**: Application state management
- **`utils/`**: Utilities (logging, network, directories)
- **`process/`**: Async task handlers

#### Key Architectural Patterns

**Global Singletons**: The app uses lazy_static globals for cross-module state:

- `AppHandleManager::global()` - Tauri app handle
- `Config::verge()` / `Config::clash()` / `Config::profiles()` - Configuration
- `Handle::global()` - Core handle for managing Mihomo process

**IPC Communication**: Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`. All commands are registered in `lib.rs` via `tauri::generate_handler![]` and implemented in `cmd/` module.

**Configuration Persistence**: Config files stored in app data directory:

- `config.yaml` - Verge settings
- `profiles.yaml` - Profile list
- Runtime Clash config generated from profiles + enhancements

**Deep Link Handling**: Supports `clash://`, `koala-clash://`, and `outclash://` URL schemes for profile imports. Special handling on macOS for cold-start events.

### Frontend (React - src/)

#### Structure

- **`src/main.tsx`**: App entry point with global error handlers
- **`src/pages/`**: Main application views
  - `home.tsx`: Dashboard with traffic stats, mode switching
  - `proxies.tsx`: Proxy selection and group management
  - `profiles.tsx`: Profile management (import, edit, update)
  - `rules.tsx`: Rule viewer
  - `connections.tsx`: Active connections monitor
  - `logs.tsx`: Application logs
  - `settings.tsx`: Application settings
- **`src/components/`**: Organized by feature (home/, profile/, proxy/, etc.)
- **`src/services/`**: Core services
  - `cmds.ts`: Wrapper functions for all Tauri commands
  - `api.ts`: Clash API client (axios) for runtime communication with Mihomo
  - `states.ts`: React context providers (theme, loading, update state)
  - `i18n.ts`: Internationalization setup
- **`src/providers/`**: React context providers
- **`src/hooks/`**: Custom React hooks
- **`src/utils/`**: Frontend utilities

#### Key Frontend Patterns

**State Management**:

- React Context API for global state (theme, loading cache)
- SWR for data fetching and caching
- Zustand may be used for some state (check imports)

**UI Components**:

- Material-UI (@mui/material) for primary components
- Radix UI primitives for dialogs, dropdowns, etc.
- TailwindCSS for styling
- Monaco Editor for YAML/script editing

**Tauri API Communication**:

```typescript
// Always use wrapper functions from src/services/cmds.ts
import { getProfiles, updateProfile } from "@/services/cmds";
// NOT: import { invoke } from "@tauri-apps/api/core"
```

**Clash API Communication** (runtime):

```typescript
// Use api.ts for communicating with running Mihomo core
import { getProxies, updateProxy } from "@/services/api";
```

## Important Development Notes

### NULL Safety in API Responses

When working with API responses, always check for `null`/`undefined` before using array methods like `.map()`:

```typescript
// INCORRECT - will crash if response is null/undefined
const list = await invoke<Item[]>("get_items");
list.map(item => ...);  // ❌ Error if list is null

// CORRECT - add null checks
const list = await invoke<Item[]>("get_items");
if (!list || !Array.isArray(list)) {
  return [];
}
list.map(item => ...);  // ✅ Safe

// OR use optional chaining with fallback
const items = (await invoke<Item[]>("get_items")) || [];
items.map(item => ...);  // ✅ Safe
```

This is particularly important for:

- Tauri `invoke()` calls
- Clash API responses from `getProxies()`, `getProxyProviders()`, etc.
- Any external data source

### Portable vs Installed Mode

The app supports both installed and portable modes (Windows). Portable mode stores all data in app directory. Check with `getPortableFlag()`.

### Mihomo Core Management

- Core binary downloaded via `pnpm run prebuild` to `src-tauri/sidecar/`
- Managed as external process by `core/core.rs`
- Configuration generated at runtime from profiles + enhancements
- API endpoint typically `http://127.0.0.1:9090` (configurable)

### Profile Enhancement Scripts

Profiles can have JavaScript enhancement scripts that run via `boa_engine` to modify Clash config before core starts. Scripts have access to special APIs defined in `enhance/` module.

### System Integration

- **System Proxy**: Managed via `sysproxy` crate (cross-platform)
- **Service Mode**: Elevated service for system-level operations
- **TUN Mode**: Virtual network interface for global proxying
- **Autostart**: Managed via tauri-plugin-autostart

### Platform-Specific Notes

**Windows**:

- MSVC toolchain required (`rustup target add x86_64-pc-windows-msvc`)
- Service mode for elevated operations
- Portable mode support

**macOS**:

- Activation policy management (Regular/Accessory)
- Deep link handling requires special early capture
- LaunchAgent for autostart

**Linux**:

- WebKit2GTK dependency
- Requires `libxslt1.1 libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf`

## Common Patterns

### Adding a New Tauri Command

1. Add Rust function to `src-tauri/src/cmd/*.rs`:

```rust
#[tauri::command]
pub async fn my_command(param: String) -> Result<String, String> {
    Ok(format!("Result: {}", param))
}
```

2. Register in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    cmd::my_command,
])
```

3. Add TypeScript wrapper to `src/services/cmds.ts`:

```typescript
export async function myCommand(param: string) {
  return invoke<string>("my_command", { param });
}
```

### Accessing Configuration

```rust
// Rust
use crate::config::Config;
let verge = Config::verge();
let data = verge.latest();  // Read
verge.draft().some_field = value;  // Write (draft)
verge.apply();  // Persist changes
```

```typescript
// Frontend
import { getVergeConfig, patchVergeConfig } from "@/services/cmds";
const config = await getVergeConfig();
await patchVergeConfig({ ...config, someField: value });
```

## Debugging

- Rust logs: Check `logs/` directory in app data folder
- Frontend console: Enable via `pnpm dev` or use `openDevTools()` command
- Core logs: Separate Mihomo logs in app data
- Set `RUST_BACKTRACE=1` for detailed Rust stack traces (already in dev script)
