use crate::steam_scan::GameDto;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

/// Ce que Cassini trouve du côté d'Epic, avant même de lire un jeu.
///
/// Les trois cas demandent trois réponses différentes, et les confondre est
/// exactement ce qui a fait croire à une panne de Cassini : le launcher installé
/// dont la base a été perdue rendait « Epic Games Launcher not found », ce qui
/// est faux, et personne ne pouvait deviner qu'il fallait réparer Epic.
#[derive(Debug, PartialEq)]
pub enum EtatEpic {
    /// Aucune trace du launcher. Rien à signaler : tout le monde n'a pas Epic.
    Absent,
    /// Le launcher est là, son dossier de manifestes aussi.
    Pret(PathBuf),
    /// Le launcher est là, mais son dossier de manifestes a disparu. Epic ne
    /// connaît alors plus aucun de ses jeux, et ne les affiche pas davantage
    /// que nous. Vu sur une machine après que le désinstalleur du launcher a
    /// emporté sa base : les jeux restaient sur le disque, avec leur
    /// `.egstore`, sans que rien ne les relie à Epic.
    SansManifestes(PathBuf),
}

// Scanne les jeux Epic Games installés en lisant les fichiers .item du dossier Manifests
pub fn scan_epic_games() -> Result<Vec<GameDto>, String> {
    let manifests_path = match etat_epic() {
        EtatEpic::Pret(p) => p,
        EtatEpic::Absent => return Err("Epic Games Launcher introuvable.".to_string()),
        EtatEpic::SansManifestes(donnees) => {
            return Err(format!(
                "Epic Games Launcher est installé, mais son dossier de manifestes est absent ({}). \
                 Epic a perdu la liste de ses jeux : il ne les affiche pas non plus. Pour la \
                 reconstruire, relancer l'installation de chaque jeu depuis Epic en visant le \
                 dossier où il se trouve déjà : Epic reconnaît les fichiers, vérifie au lieu de \
                 télécharger, et réécrit son manifeste.",
                donnees.join("Manifests").display()
            ))
        }
    };

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

    games.sort_by_key(|g| g.title.to_lowercase());
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

/// Où Epic range ses données, d'après le registre puis à défaut.
///
/// `AppDataPath` fait foi : c'est Epic qui l'écrit, et un emplacement
/// personnalisé n'y change rien pour nous. Le chemin par défaut ne sert que si
/// la clé manque. Les deux vues du registre sont lues, le launcher ayant été
/// 32 bits avant d'être 64.
fn dossier_donnees() -> Option<PathBuf> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for cle in [
        r"SOFTWARE\Epic Games\EpicGamesLauncher",
        r"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher",
    ] {
        if let Ok(k) = hklm.open_subkey(cle) {
            if let Ok(p) = k.get_value::<String, _>("AppDataPath") {
                let p = PathBuf::from(p.trim());
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }

    let programdata =
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    let p = PathBuf::from(programdata)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data");
    if p.is_dir() {
        Some(p)
    } else {
        None
    }
}

/// Le dossier des manifestes dans un dossier de données Epic.
pub fn manifests_dans(donnees: &Path) -> PathBuf {
    donnees.join("Manifests")
}

/// Distingue les trois cas, pour qu'on puisse en dire quelque chose d'exact.
pub fn etat_epic() -> EtatEpic {
    let Some(donnees) = dossier_donnees() else {
        return EtatEpic::Absent;
    };
    let manifests = manifests_dans(&donnees);
    if manifests.is_dir() {
        EtatEpic::Pret(manifests)
    } else {
        EtatEpic::SansManifestes(donnees)
    }
}

/// Conservé pour la veille, qui surveille ce dossier quand il existe.
pub fn find_manifests_path() -> Option<PathBuf> {
    match etat_epic() {
        EtatEpic::Pret(p) => Some(p),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_dossier_des_manifestes_pend_au_dossier_de_donnees() {
        // `AppDataPath` désigne `…\EpicGamesLauncher\Data`, les manifestes sont
        // dedans. Le registre écrit parfois une barre finale, que `join` absorbe.
        let d = PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data");
        assert_eq!(
            manifests_dans(&d),
            PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests")
        );
    }

    #[test]
    fn un_jeu_desinstalle_ne_compte_pas() {
        // Les `.item` survivent à la désinstallation : c'est le dossier qui
        // tranche, et il n'existe pas ici.
        let item = r#"{
            "bIsApplication": true,
            "AppName": "Fortnite",
            "DisplayName": "Fortnite",
            "InstallLocation": "C:\\dossier\\qui\\n\\existe\\pas"
        }"#;
        assert!(parse_item_file(item).is_none());
    }

    #[test]
    fn un_plugin_nest_pas_un_jeu() {
        let item = r#"{
            "bIsApplication": false,
            "AppName": "UE_5.3",
            "InstallLocation": "C:\\"
        }"#;
        assert!(parse_item_file(item).is_none());
    }

    #[test]
    fn une_installation_incomplete_ne_compte_pas() {
        let item = r#"{
            "bIsApplication": true,
            "bIsIncompleteInstall": true,
            "AppName": "Fortnite",
            "InstallLocation": "C:\\"
        }"#;
        assert!(parse_item_file(item).is_none());
    }
}
