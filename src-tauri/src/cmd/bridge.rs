use super::CmdResult;
use crate::config::Config;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use reqwest::Client;
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const ELECTRON_REPO: &str = "ckeiituk/outclash";

/// Server-controlled rollout gate. The bridge dialog is shown only when the
/// active subscription endpoint returns this header in its response. The
/// upstream (Remnawave) decides per-user via Subscription Response Rules.
const BRIDGE_ROLLOUT_HEADER: &str = "X-Bridge-Enabled";

/// Distinct UA so the upstream can target bridge probes via SRR conditions
/// without colliding with regular subscription fetches.
const BRIDGE_PROBE_USER_AGENT: &str = concat!("OutClashBridge/", env!("CARGO_PKG_VERSION"));

#[derive(Serialize, Clone)]
pub struct BridgeRelease {
    pub version: String,
    pub download_url: String,
    pub body: String,
}

#[derive(Serialize, Clone)]
pub struct BridgeProgress {
    pub downloaded: u64,
    pub total: u64,
    pub phase: String,
}

/// Cached outcome of the most recent bridge check, shared by the periodic
/// background loop, the focus hook, the tray menu and the `bridge_status`
/// command. Discovery must not depend on a live frontend: the webview may
/// not exist when a check completes (silent start, lightweight mode).
#[derive(Default)]
struct BridgeState {
    release: Option<BridgeRelease>,
    last_check: Option<Instant>,
    /// Release version already announced via toast/tray/event — prevents
    /// re-notifying on every periodic tick.
    last_notified: Option<String>,
    /// One-shot flag set by the tray menu item: the next `bridge_status`
    /// read must surface the dialog even if this version was dismissed.
    force_show: bool,
}

static BRIDGE_STATE: Lazy<RwLock<BridgeState>> = Lazy::new(Default::default);
static BRIDGE_CHECK_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

const BRIDGE_FIRST_DELAY: Duration = Duration::from_secs(3 * 60);
const BRIDGE_PERIODIC_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const BRIDGE_FOCUS_THROTTLE: Duration = Duration::from_secs(15 * 60);

#[derive(Serialize, Clone)]
pub struct BridgeStatus {
    pub release: Option<BridgeRelease>,
    pub forced: bool,
}

#[cfg(debug_assertions)]
fn duration_from_env(var: &str, default: Duration) -> Duration {
    env::var(var)
        .ok()
        .and_then(|v| v.parse().ok())
        .map(Duration::from_secs)
        .unwrap_or(default)
}

fn bridge_first_delay() -> Duration {
    #[cfg(debug_assertions)]
    return duration_from_env("BRIDGE_FIRST_DELAY_SECS", BRIDGE_FIRST_DELAY);
    #[cfg(not(debug_assertions))]
    BRIDGE_FIRST_DELAY
}

fn bridge_periodic_interval() -> Duration {
    #[cfg(debug_assertions)]
    return duration_from_env("BRIDGE_PERIODIC_SECS", BRIDGE_PERIODIC_INTERVAL);
    #[cfg(not(debug_assertions))]
    BRIDGE_PERIODIC_INTERVAL
}

/// Resolve the URL of the currently active remote profile (Remnawave sub URL).
/// Returns `None` for local-only profiles or when the lookup fails — those
/// users are gated out of the rollout by default.
fn current_subscription_url() -> Option<String> {
    let profiles_config = Config::profiles();
    let profiles = profiles_config.latest_ref();
    let uid = profiles.current.as_ref()?;
    let item = profiles.get_item(uid).ok()?;
    let url = item.url.as_ref()?.trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

/// Server-side rollout gate. The upstream attaches `X-Bridge-Enabled` to the
/// subscription response (via Remnawave SRR) only for cohorts it wants to
/// migrate; absence of the header means "do not advertise the Electron build
/// to this user yet".
async fn bridge_rollout_enabled() -> bool {
    let Some(sub_url) = current_subscription_url() else {
        return false;
    };

    let client = match Client::builder()
        .user_agent(BRIDGE_PROBE_USER_AGENT)
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    let response = match client.head(&sub_url).send().await {
        Ok(r) if r.status().is_success() => r,
        // Fall back to a ranged GET — some upstreams (or CDNs in front of
        // them) drop custom headers on HEAD or reject the method outright.
        _ => match client
            .get(&sub_url)
            .header("Range", "bytes=0-0")
            .send()
            .await
        {
            Ok(r) if r.status().is_success() || r.status().as_u16() == 206 => r,
            _ => return false,
        },
    };

    response
        .headers()
        .get(BRIDGE_ROLLOUT_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

/// Fetch the latest Electron release, honoring the rollout gate. Network
/// only, no side effects; failures are logged and collapse to `None` so
/// callers can treat any failure as "nothing to advertise".
async fn fetch_bridge_release() -> Option<BridgeRelease> {
    if !bridge_rollout_enabled().await {
        return None;
    }

    let client = Client::builder()
        .user_agent("outclash-bridge")
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .ok()?;

    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        ELECTRON_REPO
    );
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            log::warn!(target: "app", "bridge: release request failed: {e}");
            return None;
        }
    };

    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(e) => {
            log::warn!(target: "app", "bridge: release response parse failed: {e}");
            return None;
        }
    };

    let version = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if version.is_empty() {
        return None;
    }

    let body = json["body"].as_str().unwrap_or("").to_string();

    // Find the installer asset for current platform/arch
    let asset_name = get_installer_asset_name();
    let download_url = json["assets"].as_array().and_then(|assets| {
        assets.iter().find_map(|a| {
            let name = a["name"].as_str().unwrap_or("");
            if name == asset_name {
                a["browser_download_url"].as_str().map(|s| s.to_string())
            } else {
                None
            }
        })
    });

    download_url.map(|url| BridgeRelease {
        version,
        download_url: url,
        body,
    })
}

/// Run a full bridge check and fold the outcome into the shared state.
/// Concurrent callers collapse to the cached value.
pub async fn run_bridge_check() -> Option<BridgeRelease> {
    if BRIDGE_CHECK_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return BRIDGE_STATE.read().release.clone();
    }
    let _reset = scopeguard::guard((), |_| {
        BRIDGE_CHECK_IN_FLIGHT.store(false, Ordering::SeqCst);
    });

    let result = fetch_bridge_release().await;

    let newly_found = {
        let mut state = BRIDGE_STATE.write();
        state.last_check = Some(Instant::now());
        // Overwrite unconditionally: a disabled gate (or a transient failure)
        // clears the cached release so the tray item disappears on the next
        // menu rebuild.
        state.release = result.clone();
        match &result {
            Some(release) if state.last_notified.as_deref() != Some(release.version.as_str()) => {
                state.last_notified = Some(release.version.clone());
                Some(release.clone())
            }
            _ => None,
        }
    };

    if let Some(release) = newly_found {
        on_new_release(&release);
    }

    result
}

/// Out-of-window signals for a freshly discovered release: system toast,
/// tray menu item and (when the webview is alive) a frontend event.
fn on_new_release(release: &BridgeRelease) {
    use crate::core::{handle::Handle, tray::Tray};
    use crate::utils::notification::{notify_event, NotificationEvent};

    if Handle::global().is_exiting() {
        return;
    }
    if let Some(app) = Handle::global().app_handle() {
        notify_event(
            &app,
            NotificationEvent::BridgeUpdateAvailable {
                version: &release.version,
            },
        );
    }
    if let Err(e) = Tray::global().update_all_states() {
        log::warn!(target: "app", "bridge: tray refresh failed: {e}");
    }
    Handle::notify_bridge_available(
        release.version.clone(),
        release.download_url.clone(),
        release.body.clone(),
        false,
    );
}

pub fn bridge_cached_release() -> Option<BridgeRelease> {
    BRIDGE_STATE.read().release.clone()
}

pub fn bridge_cached_version() -> Option<String> {
    BRIDGE_STATE
        .read()
        .release
        .as_ref()
        .map(|r| r.version.clone())
}

pub fn set_bridge_force_show() {
    BRIDGE_STATE.write().force_show = true;
}

/// Focus-triggered re-check, throttled so rapid focus/blur cycles do not
/// hammer the subscription endpoint.
pub fn spawn_bridge_check_if_stale() {
    if crate::core::handle::Handle::global().is_exiting() {
        return;
    }
    let stale = BRIDGE_STATE
        .read()
        .last_check
        .map_or(true, |t| t.elapsed() >= BRIDGE_FOCUS_THROTTLE);
    if !stale {
        return;
    }
    crate::process::AsyncHandler::spawn(|| async {
        let _ = run_bridge_check().await;
    });
}

/// Periodic background discovery. Runs for the whole app lifetime so the
/// rollout gate is noticed even when the webview never exists (silent
/// start) or was destroyed (lightweight mode).
pub fn start_bridge_periodic_check() {
    crate::process::AsyncHandler::spawn(|| async {
        tokio::time::sleep(bridge_first_delay()).await;
        loop {
            if crate::core::handle::Handle::global().is_exiting() {
                break;
            }
            let _ = run_bridge_check().await;
            tokio::time::sleep(bridge_periodic_interval()).await;
        }
    });
}

/// Check if an Electron release is available
#[tauri::command]
pub async fn bridge_check() -> CmdResult<Option<BridgeRelease>> {
    Ok(run_bridge_check().await)
}

/// Cached bridge state for instant reads on webview creation; consumes the
/// one-shot `force_show` flag set by the tray menu item.
#[tauri::command]
pub async fn bridge_status() -> CmdResult<BridgeStatus> {
    let mut state = BRIDGE_STATE.write();
    Ok(BridgeStatus {
        release: state.release.clone(),
        forced: std::mem::take(&mut state.force_show),
    })
}

/// Download the Electron installer and launch it
#[tauri::command]
pub async fn bridge_download(app: AppHandle, url: String) -> CmdResult<()> {
    let client = Client::builder()
        .user_agent("outclash-bridge")
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let temp_dir = env::temp_dir();
    let file_name = url.split('/').last().unwrap_or("OutClash-setup.exe");
    let file_path = temp_dir.join(file_name);

    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;

    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed().as_millis() >= 100 || downloaded == total {
            let _ = app.emit(
                "bridge-progress",
                BridgeProgress {
                    downloaded,
                    total,
                    phase: "downloading".to_string(),
                },
            );
            last_emit = Instant::now();
        }
    }

    // Notify UI that we're in the install phase (flush + Defender scan can take seconds)
    let _ = app.emit(
        "bridge-progress",
        BridgeProgress {
            downloaded: total,
            total,
            phase: "installing".to_string(),
        },
    );

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // Launch the installer and let it handle closing this app
    // via CHECK_APP_RUNNING when the user clicks Install.
    launch_installer(&file_path)?;

    Ok(())
}

/// Cancel-safe: allows frontend to abort by simply not awaiting
#[tauri::command]
pub async fn bridge_cancel() -> CmdResult<()> {
    // Frontend can call this to signal intent — the actual cancellation
    // happens by the frontend ignoring the bridge_download result.
    // This is a no-op placeholder for future cancellation token support.
    Ok(())
}

fn get_installer_asset_name() -> String {
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };

    if cfg!(target_os = "windows") {
        format!("OutClash_{}-setup.exe", arch)
    } else if cfg!(target_os = "macos") {
        format!("OutClash_{}.pkg", arch)
    } else {
        format!("OutClash_{}.deb", arch)
    }
}

fn launch_installer(path: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use "open" verb via cmd /c start — triggers ShellExecute which
        // shows SmartScreen prompt for unsigned exe instead of silently failing.
        // CREATE_NO_WINDOW hides the intermediate cmd.exe console.
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("cmd")
            .args(["/c", "start", "", &path.to_string_lossy()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open installer: {}", e))?;
    }

    Ok(())
}
