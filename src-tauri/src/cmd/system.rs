use super::CmdResult;
use crate::{
    core::{handle, CoreManager},
    module::sysinfo::PlatformSpecification,
};
use once_cell::sync::Lazy;
use std::{
    sync::atomic::{AtomicI64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri_plugin_clipboard_manager::ClipboardExt;

// 存储应用启动时间的全局变量
static APP_START_TIME: Lazy<AtomicI64> = Lazy::new(|| {
    // 获取当前系统时间，转换为毫秒级时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    AtomicI64::new(now)
});

#[tauri::command]
pub async fn export_diagnostic_info() -> CmdResult<()> {
    let sysinfo = PlatformSpecification::new_async().await;
    let info = format!("{sysinfo:?}");

    let app_handle = handle::Handle::global().app_handle().unwrap();
    let cliboard = app_handle.clipboard();
    if cliboard.write_text(info).is_err() {
        log::error!(target: "app", "Failed to write to clipboard");
    }
    Ok(())
}

#[tauri::command]
pub async fn get_system_info() -> CmdResult<String> {
    let sysinfo = PlatformSpecification::new_async().await;
    let info = format!("{sysinfo:?}");
    Ok(info)
}

/// 获取当前内核运行模式
#[tauri::command]
pub async fn get_running_mode() -> Result<String, String> {
    Ok(CoreManager::global().get_running_mode().await.to_string())
}

/// 获取应用的运行时间（毫秒）
#[tauri::command]
pub fn get_app_uptime() -> CmdResult<i64> {
    let start_time = APP_START_TIME.load(Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    Ok(now - start_time)
}

/// 检查应用是否以管理员身份运行
#[tauri::command]
#[cfg(target_os = "windows")]
pub fn is_admin() -> CmdResult<bool> {
    use deelevate::{PrivilegeLevel, Token};

    let result = Token::with_current_process()
        .and_then(|token| token.privilege_level())
        .map(|level| level != PrivilegeLevel::NotPrivileged)
        .unwrap_or(false);

    Ok(result)
}

/// 非Windows平台检测是否以管理员身份运行
#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub fn is_admin() -> CmdResult<bool> {
    #[cfg(target_os = "macos")]
    {
        Ok(unsafe { libc::geteuid() } == 0)
    }

    #[cfg(target_os = "linux")]
    {
        Ok(unsafe { libc::geteuid() } == 0)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub async fn detect_foreground_fullscreen() -> CmdResult<bool> {
    Ok(detect_foreground_fullscreen_impl())
}

fn detect_foreground_fullscreen_impl() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::mem::MaybeUninit;
        use winapi::shared::windef::RECT;
        use winapi::um::winuser::{
            GetForegroundWindow, GetMonitorInfoW, GetWindowRect, MonitorFromWindow, MONITORINFO,
            MONITOR_DEFAULTTONEAREST,
        };

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return false;
            }

            let mut window_rect = MaybeUninit::<RECT>::uninit();
            if GetWindowRect(hwnd, window_rect.as_mut_ptr()) == 0 {
                return false;
            }
            let window_rect = window_rect.assume_init();

            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if monitor.is_null() {
                return false;
            }

            let mut monitor_info = MaybeUninit::<MONITORINFO>::uninit();
            let monitor_info_ptr = monitor_info.as_mut_ptr();
            (*monitor_info_ptr).cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(monitor, monitor_info_ptr) == 0 {
                return false;
            }
            let monitor_info = monitor_info.assume_init();

            let window_width = window_rect.right - window_rect.left;
            let window_height = window_rect.bottom - window_rect.top;
            let monitor_width = monitor_info.rcMonitor.right - monitor_info.rcMonitor.left;
            let monitor_height = monitor_info.rcMonitor.bottom - monitor_info.rcMonitor.top;

            if window_width <= 0 || window_height <= 0 {
                return false;
            }

            let tolerance = 4;
            (window_width - monitor_width).abs() <= tolerance
                && (window_height - monitor_height).abs() <= tolerance
        }
    }

    #[cfg(target_os = "macos")]
    {
        false
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        false
    }
}
