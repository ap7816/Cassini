use crate::steam_scan::GameDto;
use std::collections::HashSet;
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

// Scanne les jeux Riot Games installés via les clés Uninstall du registre Windows
pub fn scan_riot_games() -> Result<Vec<GameDto>, String> {
    let mut games: Vec<GameDto> = Vec::new();
    // Évite les doublons si le même jeu apparaît dans plusieurs branches du registre
    let mut seen: HashSet<String> = HashSet::new();

    // Cherche dans les trois emplacements standards du registre (HKLM 64 bits, HKLM 32 bits, HKCU)
    let roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hive, path) in roots {
        let root = RegKey::predef(hive);
        let Ok(uninstall) = root.open_subkey(path) else { continue };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&key_name) else { continue };

            // Filtre par éditeur : ne retient que les entrées Riot Games
            let publisher: String = sk.get_value("Publisher").unwrap_or_default();
            if !publisher.to_lowercase().contains("riot games") {
                continue;
            }

            let display_name: String = sk.get_value("DisplayName").unwrap_or_default();
            if display_name.is_empty() {
                continue;
            }

            // Ignore le Riot Client et les composants système (Vanguard anti-cheat)
            let dn_lc = display_name.to_lowercase();
            if dn_lc.contains("riot client")
                || dn_lc.contains("riot vanguard")
                || dn_lc.contains("vanguard")
            {
                continue;
            }

            let id_key = format!("riot-{}", dn_lc.replace([' ', ':', '.', '\''], "-"));
            if !seen.insert(id_key.clone()) {
                continue;
            }

            let install_location: String = sk.get_value("InstallLocation").unwrap_or_default();

            // Vérifie que le dossier existe si une installation est référencée
            if !install_location.is_empty()
                && !std::path::Path::new(&install_location).is_dir()
            {
                continue;
            }

            // Construit l'URL de lancement : riotclient:// si product_id connu, sinon chemin exe
            let launch_url = match riot_product_id(&dn_lc) {
                Some(product) => Some(format!("riotclient://{}", product)),
                None => find_main_exe_in_dir(&install_location),
            };

            games.push(GameDto {
                id: id_key,
                title: display_name,
                platform: "Riot".to_string(),
                installed: true,
                last_played_at: None,
                launch_url,
                steam_app_id: None,
            });
        }
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
}

// Retourne le product_id Riot pour les jeux connus (utilisé par launch_riot_game)
fn riot_product_id(name_lc: &str) -> Option<&'static str> {
    if name_lc.contains("valorant") {
        Some("valorant")
    } else if name_lc.contains("league of legends") || name_lc.contains("teamfight tactics") {
        Some("league_of_legends")
    } else if name_lc.contains("legends of runeterra") {
        Some("bacon")
    } else {
        None
    }
}

// Localise RiotClientServices.exe sur le système via le chemin standard ou le registre
pub fn find_riot_client_exe() -> Option<PathBuf> {
    // 1) Chemin d'installation standard de Riot Client
    let standard = PathBuf::from(r"C:\Riot Games\Riot Client\RiotClientServices.exe");
    if standard.is_file() {
        return Some(standard);
    }

    // 2) Cherche dans les clés Uninstall du registre l'entrée "Riot Client"
    let roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hive, path) in roots {
        let root = RegKey::predef(hive);
        let Ok(uninstall) = root.open_subkey(path) else { continue };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&key_name) else { continue };
            let dn: String = sk.get_value("DisplayName").unwrap_or_default();
            if !dn.to_lowercase().contains("riot client") {
                continue;
            }
            if let Ok(loc) = sk.get_value::<String, _>("InstallLocation") {
                let p = PathBuf::from(&loc).join("RiotClientServices.exe");
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }

    None
}

// Cherche le premier exécutable principal dans un dossier en excluant les installeurs et outils
pub fn find_main_exe_in_dir(dir: &str) -> Option<String> {
    if dir.is_empty() {
        return None;
    }
    let base = std::path::Path::new(dir);
    if !base.is_dir() {
        return None;
    }

    let Ok(entries) = std::fs::read_dir(base) else { return None };

    for entry in entries.flatten() {
        let p = entry.path();
        // Ne retient que les fichiers .exe
        if p.extension().and_then(|e| e.to_str()) != Some("exe") {
            continue;
        }
        let fname = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        // Exclut les désinstalleurs, setup et redistributables
        if fname.contains("uninstall") || fname.contains("setup") || fname.contains("redist") {
            continue;
        }
        return Some(p.to_string_lossy().to_string());
    }

    None
}
