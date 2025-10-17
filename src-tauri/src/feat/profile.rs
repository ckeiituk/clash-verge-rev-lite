use crate::{
    cmd,
    config::{Config, PrfItem, PrfOption},
    core::{handle, CoreManager, *},
    logging,
    process::AsyncHandler,
    utils::logging::Type,
};
use anyhow::{bail, Result};

/// Toggle proxy profile
pub fn toggle_proxy_profile(profile_index: String) {
    AsyncHandler::spawn(|| async move {
        let app_handle = handle::Handle::global().app_handle().unwrap();
        match cmd::patch_profiles_config_by_profile_index(app_handle, profile_index).await {
            Ok(_) => {
                let _ = tray::Tray::global().update_menu();
            }
            Err(err) => {
                log::error!(target: "app", "{err}");
            }
        }
    });
}

/// Update a profile
/// If updating current profile, activate it
/// auto_refresh: 是否自动更新配置和刷新前端
pub async fn update_profile(
    uid: String,
    option: Option<PrfOption>,
    auto_refresh: Option<bool>,
) -> Result<()> {
    logging!(
        info,
        Type::Config,
        true,
        "[Subscription Update] Start updating subscription {}",
        uid
    );
    let auto_refresh = auto_refresh.unwrap_or(true); // 默认为true，保持兼容性

    let url_opt = {
        let profiles = Config::profiles();
        let profiles = profiles.latest();
        let item = profiles.get_item(&uid)?;
        let is_remote = item.itype.as_ref().is_some_and(|s| s == "remote");

        if !is_remote {
            log::info!(target: "app", "[Subscription Update] {uid} is not a remote subscription, skipping update");
            None // 非远程订阅直接更新
        } else if item.url.is_none() {
            log::warn!(target: "app", "[Subscription Update] {uid} is missing URL, cannot update");
            bail!("failed to get the profile item url");
        } else {
            log::info!(target: "app",
                "[Subscription Update] {} is a remote subscription, URL: {}",
                uid,
                item.url.clone().unwrap()
            );
            Some((item.url.clone().unwrap(), item.option.clone()))
        }
    };

    let should_update = match url_opt {
        Some((url, opt)) => {
            log::info!(target: "app", "[Subscription Update] Start downloading new subscription content");
            let merged_opt = PrfOption::merge(opt.clone(), option.clone());

            // 尝试使用正常设置更新
            match PrfItem::from_url(&url, None, None, merged_opt.clone()).await {
                Ok(item) => {
                    log::info!(target: "app", "[Subscription Update] Subscription config updated successfully");
                    let profiles = Config::profiles();
                    let mut profiles = profiles.latest();
                    profiles.update_item(uid.clone(), item)?;

                    let is_current = Some(uid.clone()) == profiles.get_current();
                    log::info!(target: "app", "[Subscription Update] Is current active subscription: {is_current}");
                    is_current && auto_refresh
                }
                Err(err) => {
                    // 首次更新失败，尝试使用Clash代理
                    log::warn!(target: "app", "[Subscription Update] Normal update failed: {err}, trying to update via Clash proxy");

                    // 发送通知
                    handle::Handle::notice_message("update_retry_with_clash", uid.clone());

                    // 保存原始代理设置
                    let original_with_proxy = merged_opt.as_ref().and_then(|o| o.with_proxy);
                    let original_self_proxy = merged_opt.as_ref().and_then(|o| o.self_proxy);

                    // 创建使用Clash代理的选项
                    let fallback_opt = merged_opt
                        .map(|mut option_override| {
                            option_override.with_proxy = Some(false);
                            option_override.self_proxy = Some(true);
                            option_override
                        })
                        .unwrap_or_else(|| PrfOption {
                            with_proxy: Some(false),
                            self_proxy: Some(true),
                            ..PrfOption::default()
                        });

                    // 使用Clash代理重试
                    match PrfItem::from_url(&url, None, None, Some(fallback_opt)).await {
                        Ok(mut item) => {
                            log::info!(target: "app", "[Subscription Update] Update via Clash proxy succeeded");

                            // 恢复原始代理设置到item
                            if let Some(option) = item.option.as_mut() {
                                option.with_proxy = original_with_proxy;
                                option.self_proxy = original_self_proxy;
                            }

                            // 更新到配置
                            let profiles = Config::profiles();
                            let mut profiles = profiles.latest();
                            profiles.update_item(uid.clone(), item.clone())?;

                            // 获取配置名称用于通知
                            let profile_name = item.name.clone().unwrap_or_else(|| uid.clone());

                            // 发送通知告知用户自动更新使用了回退机制
                            handle::Handle::notice_message("update_with_clash_proxy", profile_name);

                            let is_current = Some(uid.clone()) == profiles.get_current();
                            log::info!(target: "app", "[Subscription Update] Is current active subscription: {is_current}");
                            is_current && auto_refresh
                        }
                        Err(retry_err) => {
                            log::error!(target: "app", "[Subscription Update] Update via Clash proxy still failed: {retry_err}");
                            handle::Handle::notice_message(
                                "update_failed_even_with_clash",
                                format!("{retry_err}"),
                            );
                            return Err(retry_err);
                        }
                    }
                }
            }
        }
        None => auto_refresh,
    };

    if should_update {
        logging!(
            info,
            Type::Config,
            true,
            "[Subscription Update] Update core configuration"
        );
        match CoreManager::global().update_config().await {
            Ok(_) => {
                logging!(
                    info,
                    Type::Config,
                    true,
                    "[Subscription Update] Update succeeded"
                );
                handle::Handle::refresh_clash();
            }
            Err(err) => {
                logging!(
                    error,
                    Type::Config,
                    true,
                    "[Subscription Update] Update failed: {}",
                    err
                );
                handle::Handle::notice_message("update_failed", format!("{err}"));
                log::error!(target: "app", "{err}");
            }
        }
    }

    Ok(())
}

/// 增强配置
pub async fn enhance_profiles() -> Result<()> {
    crate::core::CoreManager::global()
        .update_config()
        .await
        .map(|_| ())
}
