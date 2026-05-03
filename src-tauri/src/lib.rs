// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod battlenet_scan;
mod epic_scan;
mod icon_extract;
mod launcher_scan;
mod riot_scan;
mod rockstar_scan;
mod steam_scan;
mod ubisoft_scan;
use tauri_plugin_log;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_data_url: Option<String>,
    pub duration_secs: Option<f64>,
}

/// Shared implementation. `with_cover = false` skips base64-encoding the
/// artwork (used by the batch command so it stays fast).
fn read_track_metadata(path: &str, with_cover: bool) -> TrackMetadata {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use base64::Engine;

    let empty = TrackMetadata {
        path: path.to_string(),
        title: None, artist: None, album: None,
        cover_data_url: None, duration_secs: None,
    };

    let tagged = {
        let p = match Probe::open(path) {
            Ok(p) => p,
            Err(_) => return empty,
        };
        let p = match p.guess_file_type() {
            Ok(p) => p,
            Err(_) => return empty,
        };
        match p.read() {
            Ok(t) => t,
            Err(_) => return empty,
        }
    };

    // Duration lives in audio properties — always fast, no tag needed.
    let duration_secs = {
        let d = tagged.properties().duration().as_secs_f64();
        if d > 0.0 { Some(d) } else { None }
    };

    let tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => return TrackMetadata { duration_secs, ..empty },
    };

    let title = tag.title().map(|s| s.to_string());
    let artist = tag.artist().map(|s| s.to_string());
    let album = tag.album().map(|s| s.to_string());

    let cover_data_url = if with_cover {
        tag.pictures()
            .iter()
            .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
            .or_else(|| tag.pictures().first())
            .and_then(|p| {
                let data = p.data();
                if data.len() > 1_500_000 { return None; }
                let mime = p.mime_type()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| "image/jpeg".to_string());
                let encoded = base64::engine::general_purpose::STANDARD.encode(data);
                Some(format!("data:{};base64,{}", mime, encoded))
            })
    } else {
        None
    };

    TrackMetadata { path: path.to_string(), title, artist, album, cover_data_url, duration_secs }
}

/// Single track — full metadata including cover art (used by the mini-player).
#[tauri::command]
fn get_track_metadata(path: String) -> TrackMetadata {
    read_track_metadata(&path, true)
}

/// All tracks at once — title / artist / album / duration, NO cover art.
/// Processed in parallel with rayon so I/O doesn't block the UI thread.
#[tauri::command]
fn get_tracks_basic_batch(paths: Vec<String>) -> Vec<TrackMetadata> {
    use rayon::prelude::*;
    paths.par_iter()
        .map(|p| read_track_metadata(p, false))
        .collect()
}

#[derive(serde::Serialize)]
pub struct TrackDto {
    pub path: String,
    pub title: String,
    pub folder: String,
}

#[tauri::command]
fn scan_music_folder(path: String) -> Result<Vec<TrackDto>, String> {
    let audio_exts = ["mp3", "flac", "wav", "ogg", "m4a", "opus"];
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
fn scan_riot_games() -> Result<Vec<steam_scan::GameDto>, String> {
    riot_scan::scan_riot_games()
}

#[tauri::command]
fn scan_rockstar_games() -> Result<Vec<steam_scan::GameDto>, String> {
    rockstar_scan::scan_rockstar_games()
}

#[tauri::command]
fn scan_ubisoft_games() -> Result<Vec<steam_scan::GameDto>, String> {
    ubisoft_scan::scan_ubisoft_games()
}

#[tauri::command]
fn scan_launchers() -> Result<Vec<launcher_scan::LauncherDto>, String> {
    launcher_scan::scan_launchers()
}

#[tauri::command]
fn list_music_dirs(root: String) -> Result<Vec<String>, String> {
    let root_path = std::path::Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    let mut dirs: Vec<String> = Vec::new();

    fn walk(root: &std::path::Path, dir: &std::path::Path, dirs: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(rel) = path.strip_prefix(root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if !rel_str.is_empty() {
                        dirs.push(rel_str);
                    }
                }
                walk(root, &path, dirs);
            }
        }
    }

    walk(root_path, root_path, &mut dirs);
    dirs.sort();
    Ok(dirs)
}

#[tauri::command]
fn create_music_folder(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_music_folder(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_music_folder(path: String, new_name: String) -> Result<(), String> {
    use std::path::Path;
    let src = Path::new(&path);
    let parent = src.parent().ok_or_else(|| "Dossier sans parent".to_string())?;
    let dst = parent.join(&new_name);
    if dst.exists() {
        return Err(format!("Un dossier « {} » existe déjà", new_name));
    }
    std::fs::rename(&path, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_music_file(src: String, dst_folder: String) -> Result<(), String> {
    use std::path::Path;
    let src_path = Path::new(&src);
    let filename = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Fichier source invalide".to_string())?;

    let dst_dir = Path::new(&dst_folder);
    std::fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;

    let mut dst_path = dst_dir.join(filename);

    // Gérer les conflits de noms
    if dst_path.exists() {
        let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mut i = 1u32;
        loop {
            let name = if ext.is_empty() {
                format!("{} ({})", stem, i)
            } else {
                format!("{} ({}).{}", stem, i, ext)
            };
            let candidate = dst_dir.join(&name);
            if !candidate.exists() {
                dst_path = candidate;
                break;
            }
            i += 1;
        }
    }

    std::fs::rename(&src, &dst_path).map_err(|e| e.to_string())
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

#[tauri::command]
fn launch_riot_game(product: String) -> Result<(), String> {
    let exe = riot_scan::find_riot_client_exe()
        .ok_or_else(|| "RiotClientServices.exe introuvable".to_string())?;

    std::process::Command::new(&exe)
        .arg(format!("--launch-product={}", product))
        .arg("--launch-patchline=live")
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn launch_ubisoft_game(game_id: String) -> Result<(), String> {
    // uplay://launch/<id>/0 — on passe par cmd /c start pour que Windows
    // déclenche le handler de protocole d'Ubisoft Connect correctement.
    let url = format!("uplay://launch/{}/0", game_id);
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
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
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_riot_games, scan_rockstar_games, scan_ubisoft_games, scan_launchers, get_file_icon_data_url, open_folder, launch_battlenet_game, launch_riot_game, launch_ubisoft_game, scan_music_folder, get_autostart, set_autostart, list_music_dirs, create_music_folder, delete_music_folder, rename_music_folder, move_music_file, get_track_metadata, get_tracks_basic_batch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
