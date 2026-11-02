use chrono::{TimeZone, Utc};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

// Structure commune à toutes les plateformes pour représenter un jeu détecté
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameDto {
    pub id: String,
    pub title: String,
    pub platform: String,
    pub installed: bool,
    pub last_played_at: Option<String>,
    pub launch_url: Option<String>,
    pub steam_app_id: Option<String>,
    pub size_on_disk: Option<u64>,
    pub install_path: Option<String>,
}

// Calcule récursivement la taille totale d'un dossier (somme de tous les fichiers)
pub fn dir_size(path: &std::path::Path) -> u64 {
    if !path.is_dir() {
        return 0;
    }
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

// Scanne toutes les bibliothèques Steam et retourne la liste des jeux installés
pub fn scan_steam_games() -> Result<Vec<GameDto>, String> {
    let steam_path = find_steam_path().ok_or("Steam not found on this PC.")?;
    let library_paths = collect_library_paths(&steam_path);

    let mut games: Vec<GameDto> = Vec::new();
    // Évite les doublons si un même jeu apparaît dans plusieurs bibliothèques
    let mut seen_ids: HashSet<String> = HashSet::new();

    for lib in library_paths {
        let steamapps = lib.join("steamapps");
        if !steamapps.is_dir() {
            continue;
        }

        let entries = fs::read_dir(&steamapps).map_err(|e| format!("read_dir failed: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("read_dir entry failed: {e}"))?;
            let path = entry.path();

            // Traite uniquement les fichiers appmanifest_*.acf
            if !is_appmanifest(&path) {
                continue;
            }

            let content =
                fs::read_to_string(&path).map_err(|e| format!("read_to_string failed: {e}"))?;
            if let Some(game) = parse_appmanifest(&content, &steamapps) {
                if seen_ids.insert(game.id.clone()) {
                    games.push(game);
                }
            }
        }
    }

    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
}

// Vérifie si le chemin est un fichier manifeste Steam (appmanifest_*.acf)
fn is_appmanifest(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        return name.starts_with("appmanifest_") && name.ends_with(".acf");
    }
    false
}

// Parse un fichier ACF Steam et retourne un GameDto avec appid, nom, date de dernière partie et chemin
fn parse_appmanifest(content: &str, steamapps: &Path) -> Option<GameDto> {
    // Format ACF : lignes de type "appid" "570" / "name" "Dota 2"
    let mut appid: Option<String> = None;
    let mut name: Option<String> = None;
    let mut last_played: Option<i64> = None;
    let mut size_on_disk: Option<u64> = None;
    let mut install_dir: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if !line.starts_with('"') {
            continue;
        }

        // Format attendu : "clé" "valeur"
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let key = parts[1];
        let val = parts[3];

        match key {
            "appid" => appid = Some(val.to_string()),
            "name" => name = Some(val.to_string()),
            "installdir" => install_dir = Some(val.to_string()),
            // Timestamp Unix de la dernière session de jeu
            "LastPlayed" => {
                if let Ok(ts) = val.parse::<i64>() {
                    if ts > 0 {
                        last_played = Some(ts);
                    }
                }
            }
            "SizeOnDisk" => {
                if let Ok(sz) = val.parse::<u64>() {
                    size_on_disk = Some(sz);
                }
            }
            _ => {}
        }
    }

    let appid = appid?;
    let title = name.unwrap_or_else(|| format!("Steam App {}", appid));

    let install_path = install_dir.map(|d| {
        steamapps
            .join("common")
            .join(d)
            .to_string_lossy()
            .to_string()
    });

    Some(GameDto {
        id: format!("steam-{}", appid),
        title,
        platform: "Steam".to_string(),
        installed: true,
        // Convertit le timestamp Unix en date ISO 8601
        last_played_at: last_played
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
            .map(|dt| dt.to_rfc3339()),
        launch_url: Some(format!("steam://rungameid/{}", appid)),
        steam_app_id: Some(appid.clone()),
        size_on_disk,
        install_path,
    })
}

/// Les dossiers `steamapps` de toutes les bibliothèques Steam, pour la veille.
pub fn dossiers_steamapps() -> Vec<PathBuf> {
    let Some(steam) = find_steam_path() else {
        return Vec::new();
    };
    collect_library_paths(&steam)
        .into_iter()
        .map(|l| l.join("steamapps"))
        .filter(|d| d.is_dir())
        .collect()
}

// Collecte tous les chemins de bibliothèques Steam depuis libraryfolders.vdf
fn collect_library_paths(steam_path: &Path) -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = Vec::new();
    // Bibliothèque principale (dossier d'installation de Steam)
    libs.push(steam_path.to_path_buf());

    let vdf = steam_path.join("steamapps").join("libraryfolders.vdf");
    let Ok(txt) = fs::read_to_string(vdf) else {
        return libs;
    };

    for line in txt.lines() {
        let l = line.trim();

        // Ligne type : "path" "D:\\SteamLibrary"
        if !(l.starts_with("\"path\"") || l.contains("\"path\"")) {
            continue;
        }

        let parts: Vec<&str> = l.split('"').collect();
        if parts.len() < 4 {
            continue;
        }

        let raw = parts[3];
        // Déséchapper les doubles backslashes du format VDF
        let unescaped = raw.replace("\\\\", "\\");
        let p = PathBuf::from(unescaped);

        if !libs.iter().any(|x| x == &p) {
            libs.push(p);
        }
    }

    libs
}

// Localise le dossier d'installation de Steam via le registre Windows ou les chemins courants
fn find_steam_path() -> Option<PathBuf> {
    // 1) HKCU\Software\Valve\Steam → SteamPath (chemin préféré, mis à jour par Steam)
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
            if let Ok(val) = key.get_value::<String, _>("SteamPath") {
                let p = PathBuf::from(val);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }

    // 2) HKLM\SOFTWARE\WOW6432Node\Valve\Steam → InstallPath (installation 32 bits sur 64 bits)
    {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
            if let Ok(val) = key.get_value::<String, _>("InstallPath") {
                let p = PathBuf::from(val);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }

    // 3) Chemins d'installation par défaut en dernier recours
    let candidates = [
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];

    candidates.into_iter().find(|c| c.is_dir())
}

/// Temps de jeu Steam, en minutes, par identifiant d'application.
///
/// Steam le garde en local, compte par compte, dans
/// `userdata/<compte>/config/localconfig.vdf` : aucune clé d'API n'est
/// nécessaire. Plusieurs comptes sur un même PC sont plusieurs joueurs ; pour
/// chaque jeu on retient le temps le plus long plutôt que la somme, qui
/// mélangerait leurs habitudes.
pub fn temps_de_jeu() -> std::collections::HashMap<String, u64> {
    let mut total = std::collections::HashMap::new();
    let Some(steam) = find_steam_path() else {
        return total;
    };
    let Ok(comptes) = fs::read_dir(steam.join("userdata")) else {
        return total;
    };
    for compte in comptes.flatten() {
        let fichier = compte.path().join("config").join("localconfig.vdf");
        let Ok(texte) = fs::read_to_string(&fichier) else {
            continue;
        };
        for (id, minutes) in lire_temps_de_jeu(&texte) {
            let e = total.entry(id).or_insert(0);
            *e = (*e).max(minutes);
        }
    }
    total
}

/// Relève les `"Playtime"` rangés sous `apps/<appid>` dans un fichier VDF.
///
/// Un lecteur à pile plutôt qu'une recherche ligne à ligne : « Playtime »
/// n'a de sens que sous un identifiant d'application, lui-même sous `apps`,
/// et c'est l'imbrication seule qui le dit.
pub fn lire_temps_de_jeu(vdf: &str) -> std::collections::HashMap<String, u64> {
    let mut sortie = std::collections::HashMap::new();
    let mut pile: Vec<String> = Vec::new();
    let mut cle: Option<String> = None;
    let mut car = vdf.chars().peekable();

    while let Some(c) = car.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(d) = car.next() {
                    match d {
                        '\\' => {
                            if let Some(e) = car.next() {
                                s.push(e);
                            }
                        }
                        '"' => break,
                        _ => s.push(d),
                    }
                }
                match cle.take() {
                    None => cle = Some(s),
                    Some(k) => {
                        let n = pile.len();
                        if k.eq_ignore_ascii_case("Playtime")
                            && n >= 2
                            && pile[n - 2].eq_ignore_ascii_case("apps")
                            && pile[n - 1].parse::<u64>().is_ok()
                        {
                            if let Ok(m) = s.parse::<u64>() {
                                sortie.insert(pile[n - 1].clone(), m);
                            }
                        }
                    }
                }
            }
            '{' => pile.push(cle.take().unwrap_or_default()),
            '}' => {
                pile.pop();
                cle = None;
            }
            '/' if car.peek() == Some(&'/') => {
                for d in car.by_ref() {
                    if d == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    sortie
}

#[cfg(test)]
mod tests_temps_de_jeu {
    use super::lire_temps_de_jeu;

    const VDF: &str = r#"
"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"620"
					{
						"LastPlayed"		"1700000000"
						"Playtime"		"1234"
						"cloud"
						{
							"last_sync_state"		"synchronized"
						}
					}
					"570"
					{
						"Playtime2wks"		"12"
						"Playtime"		"98765"
					}
					"440"
					{
						"LastPlayed"		"1600000000"
					}
				}
			}
		}
	}
	"friends"
	{
		"Playtime"		"999"
		"12345"
		{
			"Playtime"		"5"
		}
	}
	"InstallPath"		"C:\\Program Files (x86)\\Steam"
}
"#;

    #[test]
    fn releve_le_temps_de_chaque_jeu() {
        let t = lire_temps_de_jeu(VDF);
        assert_eq!(t.get("620"), Some(&1234));
        assert_eq!(t.get("570"), Some(&98765));
    }

    #[test]
    fn ignore_un_jeu_sans_temps_et_ce_qui_n_est_pas_sous_apps() {
        let t = lire_temps_de_jeu(VDF);
        assert!(!t.contains_key("440"));
        assert!(!t.contains_key("12345"));
        assert_eq!(t.len(), 2);
    }

    #[test]
    fn resiste_a_un_fichier_tronque() {
        let t = lire_temps_de_jeu("\"apps\" { \"620\" { \"Playtime\" \"12");
        assert!(t.is_empty() || t.get("620") == Some(&12));
    }
}
