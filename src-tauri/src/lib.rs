// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod battlenet_scan;
mod epic_scan;
mod icon_extract;
mod launcher_scan;
mod steam_scan;
use tauri_plugin_log;

#[derive(serde::Serialize)]
pub struct TrackDto {
    pub path: String,
    pub title: String,
    pub folder: String,
}

#[tauri::command]
fn scan_music_folder(path: String) -> Result<Vec<TrackDto>, String> {
    let audio_exts = ["mp3", "flac", "wav", "ogg", "m4a"];
    let mut tracks: Vec<TrackDto> = Vec::new();

    fn walk_dir(root: &std::path::Path, dir: &std::path::Path, audio_exts: &[&str], tracks: &mut Vec<TrackDto>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        let folder = dir.strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(root, &path, audio_exts, tracks);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if audio_exts.contains(&ext.to_lowercase().as_str()) {
                    let title = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    let abs_path = path
                        .canonicalize()
                        .unwrap_or(path.clone())
                        .to_string_lossy()
                        .to_string();
                    tracks.push(TrackDto { path: abs_path, title, folder: folder.clone() });
                }
            }
        }
    }

    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    walk_dir(root, root, &audio_exts, &mut tracks);
    tracks.sort_by(|a, b| {
        match (a.folder.is_empty(), b.folder.is_empty()) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => a.folder.to_lowercase().cmp(&b.folder.to_lowercase())
                .then(a.title.to_lowercase().cmp(&b.title.to_lowercase())),
        }
    });
    Ok(tracks)
}

#[tauri::command]
fn get_file_icon_data_url(path: String) -> Result<String, String> {
    icon_extract::file_icon_png_data_url(&path, 64)
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn scan_steam_games() -> Result<Vec<steam_scan::GameDto>, String> {
    steam_scan::scan_steam_games()
}

#[tauri::command]
fn scan_epic_games() -> Result<Vec<steam_scan::GameDto>, String> {
    epic_scan::scan_epic_games()
}

#[tauri::command]
fn scan_battlenet_games() -> Result<Vec<steam_scan::GameDto>, String> {
    battlenet_scan::scan_battlenet_games()
}

#[tauri::command]
fn scan_launchers() -> Result<Vec<launcher_scan::LauncherDto>, String> {
    launcher_scan::scan_launchers()
}

#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
            Ok(key) => key.get_value::<String, _>("ArcHive").is_ok(),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| e.to_string())?;
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            run.set_value("ArcHive", &exe_path).map_err(|e| e.to_string())?;
        } else {
            let _ = run.delete_value("ArcHive");
        }
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = enabled; }
    Ok(())
}

#[tauri::command]
fn launch_battlenet_game(uid: String) -> Result<(), String> {
    let candidates = [
        r"C:\Program Files (x86)\Battle.net\Battle.net.exe",
        r"C:\Program Files\Battle.net\Battle.net.exe",
    ];

    let exe = candidates
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .ok_or_else(|| "Battle.net.exe introuvable".to_string())?;

    std::process::Command::new(exe)
        .arg(format!("--exec=launch {uid}"))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::Manager;
                let show_i = MenuItem::with_id(app, "show", "Ouvrir ArcHive", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
                TrayIconBuilder::new()
                    .menu(&menu)
                    .icon(app.default_window_icon().unwrap().clone())
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_launchers, get_file_icon_data_url, open_folder, launch_battlenet_game, scan_music_folder, get_autostart, set_autostart])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
