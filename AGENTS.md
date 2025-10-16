# Repository Guidelines

## Project Structure & Module Organization
- React UI lives in `src/`; routes under `src/pages/`, UI blocks in `src/components/`, hooks/providers alongside their features, assets in `src/assets/`, and i18n strings in `src/locales/`.
- Tauri/Rust shell is in `src-tauri/`; Rust commands in `src-tauri/src/`.
- Packaging resources (icons, manifests, sidecars) live in `src-tauri/resources/` and `src-tauri/packages/`.
- Automation and tooling scripts reside in `scripts/`.

## Build, Test, and Development Commands
- `pnpm install` — install dependencies.
- `pnpm dev` — run full desktop stack (Vite + Tauri).
- `pnpm web:dev` — run Vite UI only for fast iteration.
- `pnpm build` — produce release binaries.
- `pnpm build:fast` — faster Rust release checks.
- `pnpm fmt` — format Rust via `rustfmt`.
- `pnpm format` / `pnpm format:check` — Prettier format and CI check.
- `pnpm clippy` — Rust lint.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`.

## Coding Style & Naming Conventions
- TypeScript/JSX: Prettier (2 spaces, semicolons, double quotes). Prefer functional components; colocate feature state with its UI; share cross-cutting logic via `providers/` or `services/`.
- Rust: `rustfmt` defaults; keep command identifiers `snake_case`; surface camelCase bindings to TypeScript.
- Naming: use the `OutClash` prefix for branded widgets/components.

## Testing Guidelines
- Automated tests are limited. Exercise impacted flows via `pnpm web:dev`, then validate the Tauri bundle with `pnpm build`.
- For Rust, add unit tests with `#[cfg(test)]` in `src-tauri/src/` and run `cargo test --manifest-path src-tauri/Cargo.toml`.
- Capture manual QA steps and edge cases in your PR description.

## Commit & Pull Request Guidelines
- Commits follow Conventional Commits (`type: scope summary`). Include a body when the change spans Rust and TypeScript.
- PRs must include: concise goal statement, linked issues, and before/after visuals for UI. Note any OS-specific validation.

## Security & Configuration Tips
- Do not hardcode secrets; load via Tauri config.
- When adding capabilities or sidecars, update `src-tauri/capabilities/` and the platform-specific `tauri.*.conf.json`.
- After touching WebView2 artifacts, test Windows packaging with `pnpm updater-fixed-webview2`.

## Architecture Overview
- Desktop app: React frontend (Vite) packaged with Tauri/Rust. Rust commands expose platform features to the UI; keep interfaces narrow and typed. Prefer IPC commands in `src-tauri/src/` with clear TypeScript bindings.

## Versioning & Release Tags
- Use SemVer with a leading `v` for release tags: `vMAJOR.MINOR.PATCH` (e.g., `v0.1.0`).
- The tag must correspond to `package.json` version without the `v` (tag `vX.Y.Z` ↔ package.json `X.Y.Z`).
- GitHub Actions release workflows are triggered by tags matching `v*.*.*` only; pushing to `main` does not publish a release.
- To release:
  - Update `package.json` if needed, commit to `main` (or a PR), then create and push a tag:
    - `git tag vX.Y.Z && git push origin vX.Y.Z`
  - CI will build artifacts and publish a GitHub Release for that tag.

## TypeScript Strictness
- Enforce strict typing for all UI code.
  - tsconfig has `"strict": true`; do not relax this (no implicit any).
  - Prefer explicit parameter types for callbacks, event listeners, and Promise handlers.
  - Avoid `any`. If unavoidable at boundaries, prefer `unknown` with type guards or create typed interfaces.
  - Do not use `// @ts-ignore` or type assertions to silence errors unless accompanied by a short justification and a follow‑up task.
- Build must pass `tsc --noEmit` (run as part of `pnpm web:build`).
- When stubbing Tauri APIs for web-only mode, provide typed stubs rather than leaving values untyped.
