use chrono::{TimeZone, Utc};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

// Structure commune à toutes les plateformes pour représenter un jeu détecté
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

// Scanne toutes les bibliothèques Steam et retourne la liste des jeux installés
pub fn scan_steam_games() -> Result<Vec<GameDto>, String> {
    let steam_path = find_steam_path().ok_or("Steam not found on this PC.")?;
    let library_paths = collect_library_paths(&steam_path);

    let mut games: Vec<GameDto> = Vec::new();
    // Évite les doublons si un même jeu apparaît dans plusieurs bibliothèques
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

            // Traite uniquement les fichiers appmanifest_*.acf
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

// Vérifie si le chemin est un fichier manifeste Steam (appmanifest_*.acf)
fn is_appmanifest(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        return name.starts_with("appmanifest_") && name.ends_with(".acf");
    }
    false
}

// Parse un fichier ACF Steam et retourne un GameDto avec appid, nom et date de dernière partie
fn parse_appmanifest(content: &str) -> Option<GameDto> {
    // Format ACF : lignes de type "appid" "570" / "name" "Dota 2"
    let mut appid: Option<String> = None;
    let mut name: Option<String> = None;
    let mut last_played: Option<i64> = None;

    for line in content.lines() {
        let line = line.trim();
        if !line.starts_with('"') {
            continue;
        }

        // Format attendu : "clé" "valeur"
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let key = parts[1];
        let val = parts[3];

        match key {
            "appid" => appid = Some(val.to_string()),
            "name" => name = Some(val.to_string()),
            // Timestamp Unix de la dernière session de jeu
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
        // Convertit le timestamp Unix en date ISO 8601
        last_played_at: last_played
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
            .map(|dt| dt.to_rfc3339()),
        launch_url: Some(format!("steam://rungameid/{}", appid)),
        steam_app_id: Some(appid.clone()),
    })
}

// Collecte tous les chemins de bibliothèques Steam depuis libraryfolders.vdf
fn collect_library_paths(steam_path: &Path) -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = Vec::new();
    // Bibliothèque principale (dossier d'installation de Steam)
    libs.push(steam_path.to_path_buf());

    let vdf = steam_path.join("steamapps").join("libraryfolders.vdf");
    let Ok(txt) = fs::read_to_string(vdf) else {
        return libs;
    };

    for line in txt.lines() {
        let l = line.trim();

        // Ligne type : "path" "D:\\SteamLibrary"
        if !(l.starts_with("\"path\"") || l.contains("\"path\"")) {
            continue;
        }

        let parts: Vec<&str> = l.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let raw = parts[3];
        // Déséchapper les doubles backslashes du format VDF
        let unescaped = raw.replace("\\\\", "\\");
        let p = PathBuf::from(unescaped);

        if !libs.iter().any(|x| x == &p) {
            libs.push(p);
        }
    }

    libs
}

// Localise le dossier d'installation de Steam via le registre Windows ou les chemins courants
fn find_steam_path() -> Option<PathBuf> {
    // 1) HKCU\Software\Valve\Steam → SteamPath (chemin préféré, mis à jour par Steam)
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

    // 2) HKLM\SOFTWARE\WOW6432Node\Valve\Steam → InstallPath (installation 32 bits sur 64 bits)
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

    // 3) Chemins d'installation par défaut en dernier recours
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
