use super::CmdResult;
use crate::config::Config;
use reqwest::Client;
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::time::Duration;
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

/// Check if an Electron release is available
#[tauri::command]
pub async fn bridge_check() -> CmdResult<Option<BridgeRelease>> {
    if !bridge_rollout_enabled().await {
        return Ok(None);
    }

    let client = Client::builder()
        .user_agent("outclash-bridge")
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        ELECTRON_REPO
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let version = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if version.is_empty() {
        return Ok(None);
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

    match download_url {
        Some(url) => Ok(Some(BridgeRelease {
            version,
            download_url: url,
            body,
        })),
        None => Ok(None),
    }
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
    use std::time::Instant;

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
