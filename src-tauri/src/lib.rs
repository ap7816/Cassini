// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod steam_scan;
mod epic_scan;
mod battlenet_scan;
mod launcher_scan;
mod icon_extract;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_launchers, get_file_icon_data_url, open_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
