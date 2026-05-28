use crate::steam_scan::GameDto;
use winreg::enums::*;
use winreg::RegKey;

// Scanne les jeux Blizzard via les clés Uninstall du registre Windows
pub fn scan_battlenet_games() -> Result<Vec<GameDto>, String> {
    let mut games: Vec<GameDto> = Vec::new();

    scan_uninstall_keys(&mut games);

    // Fallback : ancienne méthode via la clé Blizzard Entertainment pour les jeux plus anciens
    if games.is_empty() {
        scan_blizzard_legacy_keys(&mut games);
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    games.dedup_by_key(|g| g.id.clone());
    Ok(games)
}

// Cherche dans les clés Uninstall les entrées dont le Publisher contient "Blizzard"
fn scan_uninstall_keys(games: &mut Vec<GameDto>) {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Vérifie les deux branches (32 bits et 64 bits) du registre
    for uninstall_path in [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ] {
        let Ok(uninstall) = hklm.open_subkey(uninstall_path) else {
            continue;
        };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(subkey) = uninstall.open_subkey(&key_name) else {
                continue;
            };

            // Filtre par éditeur : ne retient que les entrées Blizzard Entertainment
            let publisher: String = subkey
                .get_value("Publisher")
                .unwrap_or_default();

            if !publisher.to_lowercase().contains("blizzard") {
                continue;
            }

            let display_name: String = subkey
                .get_value("DisplayName")
                .unwrap_or_default();

            if display_name.is_empty() {
                continue;
            }

            // Ignore le launcher Battle.net lui-même, on ne veut que les jeux
            if display_name.to_lowercase().contains("battle.net") {
                continue;
            }

            let install_location: String = subkey
                .get_value("InstallLocation")
                .unwrap_or_default();

            // Vérifie que le dossier d'installation existe vraiment sur le disque
            if !install_location.is_empty()
                && !std::path::Path::new(&install_location).is_dir()
            {
                continue;
            }

            // Dérive l'URL de lancement battlenet:// depuis le nom du jeu
            let launch_url = game_uid(&display_name).map(|uid| format!("battlenet://{uid}"));
            let id = format!(
                "battlenet-{}",
                display_name.to_lowercase().replace([' ', ':', '.'], "-")
            );

            games.push(GameDto {
                id,
                title: display_name,
                platform: "BattleNet".to_string(),
                installed: true,
                last_played_at: None,
                launch_url,
                steam_app_id: None,
            });
        }
    }
}

// Méthode legacy : cherche directement sous HKLM\SOFTWARE\WOW6432Node\Blizzard Entertainment
fn scan_blizzard_legacy_keys(games: &mut Vec<GameDto>) {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let Ok(blizzard) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Blizzard Entertainment") else {
        return;
    };

    for key_name in blizzard.enum_keys().flatten() {
        // Ignore la sous-clé Battle.net (le launcher lui-même)
        if key_name.eq_ignore_ascii_case("Battle.net") {
            continue;
        }

        let Ok(subkey) = blizzard.open_subkey(&key_name) else {
            continue;
        };

        let Ok(install_path) = subkey.get_value::<String, _>("InstallPath") else {
            continue;
        };

        // Ignore les entrées dont le dossier n'existe plus (jeux désinstallés)
        if !std::path::Path::new(&install_path).is_dir() {
            continue;
        }

        let launch_url = game_uid(&key_name).map(|uid| format!("battlenet://{uid}"));
        let id = format!(
            "battlenet-{}",
            key_name.to_lowercase().replace([' ', ':'], "-")
        );

        games.push(GameDto {
            id,
            title: key_name,
            platform: "BattleNet".to_string(),
            installed: true,
            last_played_at: None,
            launch_url,
            steam_app_id: None,
        });
    }
}

// Retourne l'identifiant Battle.net (UID) d'un jeu Blizzard connu à partir de son nom
fn game_uid(name: &str) -> Option<&'static str> {
    match name.to_lowercase().trim() {
        "world of warcraft" => Some("Wow"),
        "wow classic" | "world of warcraft classic" | "wow classic era" => Some("WowClassic"),
        "overwatch" | "overwatch 2" => Some("Pro"),
        "hearthstone" => Some("WTCG"),
        "heroes of the storm" => Some("Hero"),
        "starcraft ii" | "starcraft 2" => Some("S2"),
        "starcraft" | "starcraft remastered" => Some("S1"),
        "diablo iii" | "diablo 3" => Some("D3"),
        "diablo iv" | "diablo 4" => Some("OSI"),
        "diablo ii resurrected" | "diablo 2 resurrected" => Some("D2"),
        "warcraft iii reforged" | "warcraft 3 reforged" | "warcraft iii" => Some("W3"),
        "call of duty: modern warfare" => Some("ZEUS"),
        "call of duty: warzone" => Some("LAZR"),
        "call of duty: modern warfare ii" | "call of duty: warzone 2.0" => Some("FORE"),
        "call of duty: modern warfare iii" | "call of duty: warzone mobile" => Some("CLDY"),
        "crash bandicoot 4: it's about time" => Some("WLBY"),
        "tony hawk's pro skater 1 + 2" => Some("KATI"),
        _ => None,
    }
}
