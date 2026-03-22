use chrono::{TimeZone, Utc};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameDto {
    pub id: String,
    pub title: String,
    pub platform: String,
    pub installed: bool,
    pub last_played_at: Option<String>,
    pub launch_url: Option<String>,
    pub steam_app_id: Option<String>,
}

pub fn scan_steam_games() -> Result<Vec<GameDto>, String> {
    let steam_path = find_steam_path().ok_or("Steam not found on this PC.")?;
    let library_paths = collect_library_paths(&steam_path);

    let mut games: Vec<GameDto> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    for lib in library_paths {
        let steamapps = lib.join("steamapps");
        if !steamapps.is_dir() {
            continue;
        }

        let entries = fs::read_dir(&steamapps).map_err(|e| format!("read_dir failed: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("read_dir entry failed: {e}"))?;
            let path = entry.path();

            if !is_appmanifest(&path) {
                continue;
            }

            let content =
                fs::read_to_string(&path).map_err(|e| format!("read_to_string failed: {e}"))?;
            if let Some(game) = parse_appmanifest(&content) {
                if seen_ids.insert(game.id.clone()) {
                    games.push(game);
                }
            }
        }
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
}

fn is_appmanifest(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        return name.starts_with("appmanifest_") && name.ends_with(".acf");
    }
    false
}

fn parse_appmanifest(content: &str) -> Option<GameDto> {
    // ACF resembles: "appid" "570" / "name" "Dota 2"
    let mut appid: Option<String> = None;
    let mut name: Option<String> = None;
    let mut last_played: Option<i64> = None;

    for line in content.lines() {
        let line = line.trim();
        if !line.starts_with('"') {
            continue;
        }

        // expected format: "key" "value"
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let key = parts[1];
        let val = parts[3];

        match key {
            "appid" => appid = Some(val.to_string()),
            "name" => name = Some(val.to_string()),
            "LastPlayed" => {
                if let Ok(ts) = val.parse::<i64>() {
                    if ts > 0 {
                        last_played = Some(ts);
                    }
                }
            }
            _ => {}
        }
    }

    let appid = appid?;
    let title = name.unwrap_or_else(|| format!("Steam App {}", appid));

    Some(GameDto {
        id: format!("steam-{}", appid),
        title,
        platform: "Steam".to_string(),
        installed: true,
        last_played_at: last_played
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
            .map(|dt| dt.to_rfc3339()),
        launch_url: Some(format!("steam://rungameid/{}", appid)),
        steam_app_id: Some(appid.clone()),
    })
}

fn collect_library_paths(steam_path: &Path) -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = Vec::new();
    libs.push(steam_path.to_path_buf());

    let vdf = steam_path.join("steamapps").join("libraryfolders.vdf");
    let Ok(txt) = fs::read_to_string(vdf) else {
        return libs;
    };

    for line in txt.lines() {
        let l = line.trim();

        // typical line: "path" "D:\\SteamLibrary"
        if !(l.starts_with("\"path\"") || l.contains("\"path\"")) {
            continue;
        }

        let parts: Vec<&str> = l.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let raw = parts[3];
        let unescaped = raw.replace("\\\\", "\\"); // "D:\\SteamLibrary" -> "D:\SteamLibrary"
        let p = PathBuf::from(unescaped);

        if !libs.iter().any(|x| x == &p) {
            libs.push(p);
        }
    }

    libs
}

fn find_steam_path() -> Option<PathBuf> {
    // 1) HKCU\Software\Valve\Steam -> SteamPath
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
            if let Ok(val) = key.get_value::<String, _>("SteamPath") {
                let p = PathBuf::from(val);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }

    // 2) HKLM\SOFTWARE\WOW6432Node\Valve\Steam -> InstallPath
    {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
            if let Ok(val) = key.get_value::<String, _>("InstallPath") {
                let p = PathBuf::from(val);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }

    // 3) fallback common paths
    let candidates = [
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];

    for c in candidates {
        if c.is_dir() {
            return Some(c);
        }
    }

    None
}
