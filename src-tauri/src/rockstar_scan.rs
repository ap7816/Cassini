use crate::riot_scan::find_main_exe_in_dir;
use crate::steam_scan::GameDto;
use winreg::enums::*;
use winreg::RegKey;

pub fn scan_rockstar_games() -> Result<Vec<GameDto>, String> {
    let mut games: Vec<GameDto> = Vec::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    for uninstall_path in [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ] {
        let Ok(uninstall) = hklm.open_subkey(uninstall_path) else { continue };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&key_name) else { continue };

            let publisher: String = sk.get_value("Publisher").unwrap_or_default();
            if !publisher.to_lowercase().contains("rockstar games") {
                continue;
            }

            let display_name: String = sk.get_value("DisplayName").unwrap_or_default();
            if display_name.is_empty() {
                continue;
            }

            // Ignorer le launcher lui-même
            let dn_lc = display_name.to_lowercase();
            if dn_lc.contains("launcher") || dn_lc.contains("social club") {
                continue;
            }

            let install_location: String = sk.get_value("InstallLocation").unwrap_or_default();

            // Vérifier que le dossier existe si on en a un
            if !install_location.is_empty()
                && !std::path::Path::new(&install_location).is_dir()
            {
                continue;
            }

            // Chercher l'exe du jeu : d'abord les noms connus, sinon heuristique
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
    games.dedup_by_key(|g| g.id.clone());
    Ok(games)
}

/// Cherche l'exécutable de jeu Rockstar.
/// Certains jeux ont des noms d'exe connus, sinon on parcourt le dossier.
fn find_rockstar_exe(name_lc: &str, install_dir: &str) -> Option<String> {
    use std::path::PathBuf;

    // Exécutables connus par jeu
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

    if let Some(exe_name) = known_exe {
        let p = PathBuf::from(install_dir).join(exe_name);
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
    }

    // Heuristique générique
    find_main_exe_in_dir(install_dir)
}
