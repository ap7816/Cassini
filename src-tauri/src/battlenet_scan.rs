use crate::steam_scan::GameDto;
use winreg::enums::*;
use winreg::RegKey;

pub fn scan_battlenet_games() -> Result<Vec<GameDto>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let blizzard = hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\Blizzard Entertainment")
        .map_err(|e| format!("Battle.net registry key not found: {e}"))?;

    let mut games: Vec<GameDto> = Vec::new();

    for key_name in blizzard.enum_keys().flatten() {
        // Ignorer le launcher lui-même
        if key_name.eq_ignore_ascii_case("Battle.net") {
            continue;
        }

        let Ok(subkey) = blizzard.open_subkey(&key_name) else {
            continue;
        };

        let Ok(install_path) = subkey.get_value::<String, _>("InstallPath") else {
            continue;
        };

        // Vérifier que le dossier d'installation existe
        if !std::path::Path::new(&install_path).is_dir() {
            continue;
        }

        let launch_url = game_uid(&key_name).map(|uid| format!("battlenet://{}", uid));
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
        });
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
}

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
