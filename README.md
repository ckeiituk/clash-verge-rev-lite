<h1 align="center">
  <img src="./build/icon.png" alt="OutClash" width="128" />
  <br>
  OutClash
</h1>

<p align="center">
A lightweight, cross-platform GUI client for managing <a href="https://github.com/MetaCubeX/mihomo">Clash/Mihomo</a> proxy configurations. Built with Electron, React, and TypeScript.
</p>

## Features

- **Proxy Management** — visual node selection, proxy groups, latency testing
- **TUN Mode** — virtual NIC for transparent proxying at the network level
- **System Proxy** — automatic system proxy configuration and guard
- **Profile Management** — import, edit, and switch between subscription profiles
- **Rule Editor** — visual editing of routing rules
- **Connection Monitor** — real-time view of active connections and traffic statistics
- **WebDAV Backup** — sync and restore configurations across devices
- **Deep Links** — supports `clash://`, `mihomo://`, and `outclash://` URI schemes
- **Theming** — custom theme colors and CSS injection

## Installation

Download the latest release for your platform from the [Releases](https://github.com/ckeiituk/outclash/releases) page.

| Platform | Formats                     |
| -------- | --------------------------- |
| Windows  | NSIS installer, 7z portable |
| macOS    | pkg                         |
| Linux    | deb, rpm, pacman            |

## Development

Prerequisites: [Node.js](https://nodejs.org/) (LTS) and [pnpm](https://pnpm.io/) 10+.

```sh
pnpm install
pnpm dev
```

### Build

```sh
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

## Credits

OutClash is based on [koala-clash](https://github.com/coolcoala/koala-clash) by coolcoala and xishang0128. It also draws from the following projects:

- [clash-verge-rev](https://github.com/clash-verge-rev/clash-verge-rev) — the original Clash Verge Rev GUI
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) — the Clash Meta proxy kernel
- [Electron](https://www.electronjs.org/) — cross-platform desktop application framework

## License

[GPL-3.0](./LICENSE)
