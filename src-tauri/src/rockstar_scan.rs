use crate::riot_scan::find_main_exe_in_dir;
use crate::steam_scan::GameDto;
use winreg::enums::*;
use winreg::RegKey;

// Scanne les jeux Rockstar Games installés via les clés Uninstall du registre Windows
pub fn scan_rockstar_games() -> Result<Vec<GameDto>, String> {
    let mut games: Vec<GameDto> = Vec::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Vérifie les deux branches (32 bits et 64 bits) du registre
    for uninstall_path in [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ] {
        let Ok(uninstall) = hklm.open_subkey(uninstall_path) else { continue };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&key_name) else { continue };

            // Filtre par éditeur : ne retient que les entrées Rockstar Games
            let publisher: String = sk.get_value("Publisher").unwrap_or_default();
            if !publisher.to_lowercase().contains("rockstar games") {
                continue;
            }

            let display_name: String = sk.get_value("DisplayName").unwrap_or_default();
            if display_name.is_empty() {
                continue;
            }

            // Ignore le Rockstar Games Launcher et Social Club (pas des jeux)
            let dn_lc = display_name.to_lowercase();
            if dn_lc.contains("launcher") || dn_lc.contains("social club") {
                continue;
            }

            let install_location: String = sk.get_value("InstallLocation").unwrap_or_default();

            // Vérifie que le dossier d'installation existe sur le disque
            if !install_location.is_empty()
                && !std::path::Path::new(&install_location).is_dir()
            {
                continue;
            }

            // Cherche l'exécutable du jeu : noms connus en priorité, puis heuristique générique
            let launch_url = find_rockstar_exe(&dn_lc, &install_location);

            let id = format!(
                "rockstar-{}",
                dn_lc.replace([' ', ':', '.', '\''], "-")
            );

            games.push(GameDto {
                id,
                title: display_name,
                platform: "Rockstar".to_string(),
                installed: true,
                last_played_at: None,
                launch_url,
                steam_app_id: None,
            });
        }
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    // Déduplique au cas où un jeu apparaît dans les deux branches du registre
    games.dedup_by_key(|g| g.id.clone());
    Ok(games)
}

// Cherche l'exécutable principal d'un jeu Rockstar : noms connus d'abord, heuristique ensuite
fn find_rockstar_exe(name_lc: &str, install_dir: &str) -> Option<String> {
    use std::path::PathBuf;

    // Table de correspondance jeu → nom d'exécutable connu
    let known_exe: Option<&str> = if name_lc.contains("grand theft auto v") || name_lc.contains("gta v") {
        Some("PlayGTAV.exe")
    } else if name_lc.contains("red dead redemption 2") || name_lc.contains("rdr2") {
        Some("RDR2.exe")
    } else if name_lc.contains("max payne 3") {
        Some("MaxPayne3.exe")
    } else if name_lc.contains("l.a. noire") || name_lc.contains("la noire") {
        Some("LANoire.exe")
    } else {
        None
    };

    // Vérifie que l'exe connu existe bien dans le dossier d'installation
    if let Some(exe_name) = known_exe {
        let p = PathBuf::from(install_dir).join(exe_name);
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
    }

    // Fallback : heuristique générique (premier .exe non-installeur du dossier)
    find_main_exe_in_dir(install_dir)
}
