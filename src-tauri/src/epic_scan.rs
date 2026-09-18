use crate::steam_scan::GameDto;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

// Scanne les jeux Epic Games installés en lisant les fichiers .item du dossier Manifests
pub fn scan_epic_games() -> Result<Vec<GameDto>, String> {
    let manifests_path = find_manifests_path()
        .ok_or_else(|| "Epic Games Launcher not found on this PC.".to_string())?;

    let mut games: Vec<GameDto> = Vec::new();
    // Évite les doublons si un même jeu apparaît dans plusieurs fichiers .item
    let mut seen_ids: HashSet<String> = HashSet::new();

    let entries = fs::read_dir(&manifests_path)
        .map_err(|e| format!("Cannot read Epic manifests folder: {e}"))?;

    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();

        // Traite uniquement les fichiers .item (manifestes de jeux Epic)
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

// Parse un fichier .item Epic et retourne un GameDto si c'est un jeu valide et installé
fn parse_item_file(content: &str) -> Option<GameDto> {
    let v: Value = serde_json::from_str(content).ok()?;

    // Filtre : seulement les vraies applications (jeux), exclut les outils et plugins DLC
    if v.get("bIsApplication").and_then(|b| b.as_bool()) != Some(true) {
        return None;
    }

    // Ignore les installations incomplètes ou corrompues
    if v.get("bIsIncompleteInstall").and_then(|b| b.as_bool()) == Some(true) {
        return None;
    }

    let app_name = v.get("AppName")?.as_str()?.to_string();
    let title = v
        .get("DisplayName")
        .and_then(|t| t.as_str())
        .unwrap_or(&app_name)
        .to_string();

    // Vérifie que le dossier d'installation existe vraiment sur le disque
    // (les fichiers .item persistent après désinstallation)
    let install_location = v.get("InstallLocation")?.as_str()?;
    if !std::path::Path::new(install_location).is_dir() {
        return None;
    }

    let size_on_disk = v.get("InstallSize").and_then(|s| s.as_u64());

    Some(GameDto {
        id: format!("epic-{}", app_name),
        title,
        platform: "Epic".to_string(),
        installed: true,
        last_played_at: None,
        // URL de lancement via le protocole com.epicgames.launcher://
        launch_url: Some(format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            app_name
        )),
        steam_app_id: None,
        size_on_disk,
        install_path: Some(install_location.to_string()),
    })
}

// Localise le dossier Manifests d'Epic Games Launcher dans ProgramData
pub fn find_manifests_path() -> Option<PathBuf> {
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
