use crate::{
    config::Config,
    core::{CoreManager, handle, tray},
    ipc::IpcManager,
    logging_error,
    process::AsyncHandler,
    utils::{logging::Type, resolve},
};
use serde_yaml_ng::{Mapping, Value};
use std::env;
use std::process::{Command, exit};

/// Restart the Clash core
pub async fn restart_clash_core() {
    match CoreManager::global().restart_core().await {
        Ok(_) => {
            handle::Handle::refresh_clash();
            handle::Handle::notice_message("set_config::ok", "ok");
        }
        Err(err) => {
            handle::Handle::notice_message("set_config::error", format!("{err}"));
            log::error!(target:"app", "{err}");
        }
    }
}

/// Restart the application
pub async fn restart_app() {
    // Step 1: Perform cleanup and check for errors
    if let Err(err) = resolve::resolve_reset_async().await {
        handle::Handle::notice_message(
            "restart_app::error",
            format!("Failed to cleanup resources: {err}"),
        );
        log::error!(target:"app", "Restart failed during cleanup: {err}");
        return;
    }

    // Step 2: Attempt to get app handle and restart
    match handle::Handle::global().app_handle() {
        Some(app_handle) => {
            handle::Handle::notice_message("restart_app::info", "Restarting application...");
            app_handle.restart();
        }
        None => {
            handle::Handle::notice_message(
                "restart_app::error",
                "Failed to get app handle for restart",
            );
            logging_error!(
                Type::System,
                false,
                "{}",
                "Failed to get app handle for restart"
            );

            // Fallback: launch a new instance of the application and exit the current one
            let current_exe = env::current_exe().unwrap_or_else(|_| {
                exit(1); // Exit if can't find the executable path
            });

            let mut cmd = Command::new(current_exe);
            cmd.args(env::args().skip(1));

            match cmd.spawn() {
                Ok(child) => {
                    log::info!(target: "app", "New application instance started with PID: {}", child.id());
                    // Successfully started new process, now exit current process
                    exit(0);
                }
                Err(e) => {
                    log::error!(target: "app", "Failed to start new application instance: {}", e);
                    // Unable to start new process, exit with error
                    exit(1);
                }
            }
        }
    }
}

fn after_change_clash_mode() {
    AsyncHandler::spawn(move || async {
        match IpcManager::global().get_connections().await {
            Ok(connections) => {
                if let Some(connections_array) = connections["connections"].as_array() {
                    for connection in connections_array {
                        if let Some(id) = connection["id"].as_str() {
                            let _ = IpcManager::global().delete_connection(id).await;
                        }
                    }
                }
            }
            Err(err) => {
                log::error!(target: "app", "Failed to get connections: {err}");
            }
        }
    });
}

/// Change Clash mode (rule/global/direct/script)
pub async fn change_clash_mode(mode: String) {
    let mut mapping = Mapping::new();
    mapping.insert(Value::from("mode"), mode.clone().into());
    // Convert YAML mapping to JSON Value
    let json_value = serde_json::json!({
        "mode": mode
    });
    log::debug!(target: "app", "change clash mode to {mode}");
    match IpcManager::global().patch_configs(json_value).await {
        Ok(_) => {
            // 更新订阅
            Config::clash().await.data_mut().patch_config(mapping);

            // 分离数据获取和异步调用
            let clash_data = Config::clash().await.data_mut().clone();
            if clash_data.save_config().await.is_ok() {
                handle::Handle::refresh_clash();
                logging_error!(Type::Tray, true, tray::Tray::global().update_menu().await);
                logging_error!(
                    Type::Tray,
                    true,
                    tray::Tray::global().update_icon(None).await
                );
            }

            let is_auto_close_connection = Config::verge()
                .await
                .data_mut()
                .auto_close_connection
                .unwrap_or(false);
            if is_auto_close_connection {
                after_change_clash_mode();
            }
        }
        Err(err) => log::error!(target: "app", "{err}"),
    }
}

/// Test connection delay to a URL
pub async fn test_delay(url: String) -> anyhow::Result<u32> {
    use crate::utils::network::{NetworkManager, ProxyType};
    use tokio::time::Instant;

    let tun_mode = Config::verge()
        .await
        .latest_ref()
        .enable_tun_mode
        .unwrap_or(false);

    // 如果是TUN模式，不使用代理，否则使用自身代理
    let proxy_type = if !tun_mode {
        ProxyType::Localhost
    } else {
        ProxyType::None
    };

    let user_agent = Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0".to_string());

    let start = Instant::now();

    let response = NetworkManager::new()
        .get_with_interrupt(&url, proxy_type, Some(10), user_agent, false)
        .await;

    match response {
        Ok(response) => {
            log::trace!(target: "app", "test_delay response: {response:#?}");
            if response.status().is_success() {
                Ok(start.elapsed().as_millis() as u32)
            } else {
                Ok(10000u32)
            }
        }
        Err(err) => {
            log::trace!(target: "app", "test_delay error: {err:#?}");
            Err(err)
        }
    }
}
