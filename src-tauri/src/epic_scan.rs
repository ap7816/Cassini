use crate::steam_scan::GameDto;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

pub fn scan_epic_games() -> Result<Vec<GameDto>, String> {
    let manifests_path = find_manifests_path()
        .ok_or_else(|| "Epic Games Launcher not found on this PC.".to_string())?;

    let mut games: Vec<GameDto> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    let entries = fs::read_dir(&manifests_path)
        .map_err(|e| format!("Cannot read Epic manifests folder: {e}"))?;

    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        if let Some(game) = parse_item_file(&content) {
            if seen_ids.insert(game.id.clone()) {
                games.push(game);
            }
        }
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
}

fn parse_item_file(content: &str) -> Option<GameDto> {
    let v: Value = serde_json::from_str(content).ok()?;

    // Seulement les vraies applis (jeux), pas les outils/plugins
    if v.get("bIsApplication").and_then(|b| b.as_bool()) != Some(true) {
        return None;
    }

    // Ignorer les installations incomplètes
    if v.get("bIsIncompleteInstall").and_then(|b| b.as_bool()) == Some(true) {
        return None;
    }

    let app_name = v.get("AppName")?.as_str()?.to_string();
    let title = v
        .get("DisplayName")
        .and_then(|t| t.as_str())
        .unwrap_or(&app_name)
        .to_string();

    // Vérifier que le dossier d'installation existe vraiment sur le disque
    // (les .item restent après désinstallation)
    let install_location = v.get("InstallLocation")?.as_str()?;
    if !std::path::Path::new(install_location).is_dir() {
        return None;
    }

    Some(GameDto {
        id: format!("epic-{}", app_name),
        title,
        platform: "Epic".to_string(),
        installed: true,
        last_played_at: None,
        launch_url: Some(format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            app_name
        )),
        steam_app_id: None,
    })
}

fn find_manifests_path() -> Option<PathBuf> {
    let programdata =
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".to_string());

    let path = PathBuf::from(programdata)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");

    if path.is_dir() {
        Some(path)
    } else {
        None
    }
}
