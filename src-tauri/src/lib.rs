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
}

#[tauri::command]
fn scan_music_folder(path: String) -> Result<Vec<TrackDto>, String> {
    let audio_exts = ["mp3", "flac", "wav", "ogg", "m4a"];
    let mut tracks: Vec<TrackDto> = Vec::new();

    fn walk_dir(dir: &std::path::Path, audio_exts: &[&str], tracks: &mut Vec<TrackDto>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, audio_exts, tracks);
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
                    tracks.push(TrackDto { path: abs_path, title });
                }
            }
        }
    }

    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    walk_dir(root, &audio_exts, &mut tracks);
    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
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
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_launchers, get_file_icon_data_url, open_folder, launch_battlenet_game, scan_music_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
