<h1 align="center">
  <img src="./src-tauri/icons/icon.png" alt="Clash" width="128" />
  <br>
  Fork of <a href="https://github.com/clash-verge-rev/clash-verge-rev">Clash Verge Rev</a>
  <br>
</h1>

<h3 align="center">
A Clash Meta GUI based on <a href="https://github.com/tauri-apps/tauri">Tauri</a>.
</h3>

## Preview

| Dark                                | Light                                |
| ----------------------------------- | ------------------------------------ |
| ![Preview](./docs/preview_dark.png) | ![Preview](./docs/preview_light.png) |

## Install

Go to the [Release page](https://github.com/ckeiituk/clash-verge-rev-lite/releases) to download the corresponding installation package<br>
Supports Windows (x64/x86), Linux (x64/arm64) and macOS 10.15+ (intel/apple).

### Telegram channel: ---

## Features

- Based on the powerful Rust and Tauri 2 frameworks.
- Built-in [Clash.Meta(mihomo)](https://github.com/MetaCubeX/mihomo) kernel with support for switching between `Alpha` versions of the kernel.
- Simple and beautiful user interface with support for custom theme colors, agent group/tray icons, and `CSS Injection`.
- Configuration file management, configuration file syntax hints.
- System Agent and Guard, `TUN (Virtual NIC)` mode.
- Visual node and rule editing
- WebDav configuration backup and synchronization

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

To run the development server, execute the following commands after all prerequisites for **Tauri** are installed:

```shell
pnpm i
pnpm run check
pnpm dev
```

## Contributions

Issue and PR welcome!

## Acknowledgement

Clash Verge rev was based on or inspired by these projects and so on:

- [zzzgydi/clash-verge](https://github.com/zzzgydi/clash-verge): A Clash GUI based on tauri. Supports Windows, macOS and Linux.
- [tauri-apps/tauri](https://github.com/tauri-apps/tauri): Build smaller, faster, and more secure desktop applications with a web frontend.
- [Dreamacro/clash](https://github.com/Dreamacro/clash): A rule-based tunnel in Go.
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo): A rule-based tunnel in Go.
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg): A Windows/macOS GUI based on Clash.
- [vitejs/vite](https://github.com/vitejs/vite): Next generation frontend tooling. It's fast!

## License

GPL-3.0 License. See [License here](./LICENSE) for details.
