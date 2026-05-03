use crate::steam_scan::GameDto;
use std::collections::HashSet;
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

pub fn scan_riot_games() -> Result<Vec<GameDto>, String> {
    let mut games: Vec<GameDto> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

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

            let publisher: String = sk.get_value("Publisher").unwrap_or_default();
            if !publisher.to_lowercase().contains("riot games") {
                continue;
            }

            let display_name: String = sk.get_value("DisplayName").unwrap_or_default();
            if display_name.is_empty() {
                continue;
            }

            // Ignorer le client et les composants système
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

            // Vérifier que le dossier existe si on en a un
            if !install_location.is_empty()
                && !std::path::Path::new(&install_location).is_dir()
            {
                continue;
            }

            let launch_url = find_riot_exe(&dn_lc, &install_location);

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

/// Cherche l'exécutable principal d'un jeu Riot dans son dossier d'installation.
fn find_riot_exe(name_lc: &str, install_dir: &str) -> Option<String> {
    // VALORANT a un sous-dossier "live"
    if name_lc.contains("valorant") {
        let candidates = [
            PathBuf::from(install_dir).join("live").join("VALORANT.exe"),
            PathBuf::from(r"C:\Riot Games\VALORANT\live\VALORANT.exe"),
        ];
        for c in &candidates {
            if c.is_file() {
                return Some(c.to_string_lossy().to_string());
            }
        }
    }

    // League of Legends
    if name_lc.contains("league") {
        let candidates = [
            PathBuf::from(install_dir).join("League of Legends.exe"),
            PathBuf::from(r"C:\Riot Games\League of Legends\League of Legends.exe"),
        ];
        for c in &candidates {
            if c.is_file() {
                return Some(c.to_string_lossy().to_string());
            }
        }
    }

    // Générique : premier .exe non-uninstaller dans le dossier
    find_main_exe_in_dir(install_dir)
}

/// Cherche le premier .exe valide dans un dossier (exclusion des uninstallers/setup).
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
        if p.extension().and_then(|e| e.to_str()) != Some("exe") {
            continue;
        }
        let fname = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if fname.contains("uninstall") || fname.contains("setup") || fname.contains("redist") {
            continue;
        }
        return Some(p.to_string_lossy().to_string());
    }

    None
}
