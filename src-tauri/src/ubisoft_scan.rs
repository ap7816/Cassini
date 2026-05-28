use crate::steam_scan::GameDto;
use std::collections::HashMap;
use winreg::enums::*;
use winreg::RegKey;

// Scanne les jeux Ubisoft Connect installés en croisant les clés Launcher et Uninstall du registre
pub fn scan_ubisoft_games() -> Result<Vec<GameDto>, String> {
    // Étape 1 : récupère id_jeu → dossier_installation depuis les clés Ubisoft Launcher
    let id_to_dir = collect_ubisoft_installs();

    if id_to_dir.is_empty() {
        return Ok(vec![]);
    }

    // Étape 2 : construit dossier_normalisé → nom_du_jeu depuis les clés Uninstall Windows
    let dir_to_name = collect_ubisoft_names_from_uninstall();

    let mut games: Vec<GameDto> = Vec::new();

    for (game_id, install_dir) in &id_to_dir {
        // Vérifie que le dossier est réellement présent sur le disque
        if !std::path::Path::new(install_dir).is_dir() {
            continue;
        }

        // Cherche le nom du jeu correspondant au dossier d'installation
        let dir_norm = normalize_path(install_dir);
        let title = match dir_to_name.get(&dir_norm) {
            Some(n) => n.clone(),
            None => {
                // Fallback : correspondance partielle si les chemins ne sont pas identiques
                let found = dir_to_name
                    .iter()
                    .find(|(k, _)| k.starts_with(&dir_norm) || dir_norm.starts_with(k.as_str()))
                    .map(|(_, v)| v.clone());

                match found {
                    Some(n) => n,
                    None => continue, // Pas de nom trouvé → ignore cette entrée
                }
            }
        };

        // Ignore Ubisoft Connect / Uplay lui-même (pas un jeu)
        let title_lc = title.to_lowercase();
        if title_lc.contains("ubisoft connect")
            || title_lc.contains("uplay")
            || title_lc.contains("ubisoft game launcher")
        {
            continue;
        }

        // URL de lancement via le protocole uplay://
        let launch_url = Some(format!("uplay://launch/{}/0", game_id));

        let id = format!(
            "ubisoft-{}",
            game_id
        );

        games.push(GameDto {
            id,
            title,
            platform: "Ubisoft".to_string(),
            installed: true,
            last_played_at: None,
            launch_url,
            steam_app_id: None,
        });
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    games.dedup_by_key(|g| g.id.clone());
    Ok(games)
}

// Lit les clés Ubisoft Launcher dans le registre et retourne une map game_id → dossier_installation
fn collect_ubisoft_installs() -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();

    // Cherche dans les trois emplacements possibles selon la version installée
    let candidates = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Ubisoft\Launcher\Installs"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Ubisoft\Launcher\Installs"),
    ];

    for (hive, path) in candidates {
        let root = RegKey::predef(hive);
        let Ok(installs) = root.open_subkey(path) else { continue };

        for key_name in installs.enum_keys().flatten() {
            let Ok(sk) = installs.open_subkey(&key_name) else { continue };
            let Ok(install_dir) = sk.get_value::<String, _>("InstallDir") else { continue };
            // Ne remplace pas si déjà présent (priorité au premier trouvé)
            map.entry(key_name).or_insert(install_dir);
        }
    }

    map
}

// Lit les clés Uninstall Windows et retourne une map dossier_normalisé → nom_du_jeu pour les entrées Ubisoft
fn collect_ubisoft_names_from_uninstall() -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    for uninstall_path in [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ] {
        let Ok(uninstall) = hklm.open_subkey(uninstall_path) else { continue };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&key_name) else { continue };

            // Filtre par éditeur Ubisoft
            let publisher: String = sk.get_value("Publisher").unwrap_or_default();
            if !publisher.to_lowercase().contains("ubisoft") {
                continue;
            }

            let display_name: String = sk.get_value("DisplayName").unwrap_or_default();
            if display_name.is_empty() {
                continue;
            }

            let install_location: String = sk.get_value("InstallLocation").unwrap_or_default();
            if install_location.is_empty() {
                continue;
            }

            // Indexe par chemin normalisé pour la comparaison avec collect_ubisoft_installs
            map.entry(normalize_path(&install_location))
                .or_insert(display_name);
        }
    }

    map
}

// Normalise un chemin Windows pour comparaison : minuscules, sans séparateur final, slashes unifiés
fn normalize_path(p: &str) -> String {
    p.trim_end_matches(['\\', '/'])
        .to_lowercase()
        .replace('/', "\\")
}
