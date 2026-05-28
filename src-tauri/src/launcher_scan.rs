use serde::Serialize;
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

// Informations d'un launcher détecté renvoyées au frontend
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDto {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub launch_target: String, // URI (steam://...) ou chemin vers l'exe
    pub icon_path: Option<String>,
}

// Détecte tous les launchers installés et retourne la liste triée par nom
// Note : pas de #[tauri::command] ici — la commande est dans lib.rs
pub fn scan_launchers() -> Result<Vec<LauncherDto>, String> {
    let mut out: Vec<LauncherDto> = Vec::new();

    if let Some(x) = detect_steam() { out.push(x); }
    if let Some(x) = detect_epic() { out.push(x); }
    if let Some(x) = detect_battlenet() { out.push(x); }
    if let Some(x) = detect_riot() { out.push(x); }
    if let Some(x) = detect_rockstar_launcher() { out.push(x); }
    if let Some(x) = detect_ubisoft_connect() { out.push(x); }
    if let Some(x) = detect_hytale() { out.push(x); }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

// Vérifie si haystack_lc contient au moins un des mots-clés needles (insensible à la casse)
fn contains_any(haystack_lc: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|n| haystack_lc.contains(&n.to_lowercase()))
}

// Extrait le chemin d'exe depuis la valeur DisplayIcon du registre (format "C:\...\App.exe,0")
fn parse_display_icon_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim().trim_matches('"');
    // Supprime le suffixe ",0" ou ",1" qui suit parfois le chemin
    let before_comma = trimmed.split(',').next().unwrap_or(trimmed).trim();
    if before_comma.is_empty() {
        return None;
    }
    Some(PathBuf::from(before_comma))
}

// Extrait le chemin d'exe depuis la valeur UninstallString du registre
// Gère les formats : chemin entre guillemets, chemin nu, chemin avec arguments
fn parse_uninstall_string_exe(raw: &str) -> Option<PathBuf> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }

    // Extrait le chemin selon le format : avec guillemets ou sans
    let path_str = if s.starts_with('"') {
        let rest = &s[1..];
        let end = rest.find('"')?;
        &rest[..end]
    } else {
        // Chemin sans guillemets : prend le premier token
        s.split_whitespace().next().unwrap_or("")
    };

    if path_str.is_empty() {
        return None;
    }

    let path_str = path_str.trim().trim_matches('"');
    let path_str = path_str.split(',').next().unwrap_or(path_str).trim();

    // Ignore msiexec (installeur Windows, pas un exe de launcher)
    if path_str.to_lowercase().contains("msiexec") {
        return None;
    }

    if !path_str.to_lowercase().ends_with(".exe") {
        return None;
    }

    let p = PathBuf::from(path_str);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

// Recherche un exe de launcher dans les clés Uninstall du registre en combinant plusieurs stratégies :
// 1) DisplayIcon → 2) InstallLocation + noms connus → 3) UninstallString
fn find_exe_from_uninstall(needles: &[&str], exe_names: &[&str]) -> Option<PathBuf> {
    let roots = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];

    for (root, path) in roots {
        let root = RegKey::predef(root);
        let Ok(uninstall) = root.open_subkey(path) else {
            continue;
        };

        for subkey_name in uninstall.enum_keys().flatten() {
            let Ok(sk) = uninstall.open_subkey(&subkey_name) else {
                continue;
            };

            let dn: Option<String> = sk.get_value("DisplayName").ok();
            let Some(dn) = dn else { continue };
            let dn_lc = dn.to_lowercase();

            if !contains_any(&dn_lc, needles) {
                continue;
            }

            // Stratégie 1 : DisplayIcon contient souvent le chemin de l'exe principal
            if let Ok(icon) = sk.get_value::<String, _>("DisplayIcon") {
                if let Some(p) = parse_display_icon_path(&icon) {
                    if p.is_file() && p.to_string_lossy().to_lowercase().ends_with(".exe") {
                        return Some(p);
                    }
                }
            }

            // Stratégie 2 : InstallLocation + liste de noms d'exe connus pour ce launcher
            if let Ok(loc) = sk.get_value::<String, _>("InstallLocation") {
                let base = PathBuf::from(loc);
                for exe in exe_names {
                    let guess = base.join(exe);
                    if guess.is_file() {
                        return Some(guess);
                    }
                }
            }

            // Stratégie 3 : UninstallString peut contenir le chemin du launcher
            if let Ok(us) = sk.get_value::<String, _>("UninstallString") {
                if let Some(p) = parse_uninstall_string_exe(&us) {
                    return Some(p);
                }
            }
        }
    }

    None
}

// Retourne le premier chemin de la liste qui correspond à un fichier existant sur le disque
fn first_existing_path(candidates: &[&str]) -> Option<PathBuf> {
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

// Crée un LauncherDto à partir d'un exe trouvé (launch_target = icon_path = chemin de l'exe)
fn make_exe_launcher(id: &str, name: &str, exe: PathBuf) -> LauncherDto {
    let p = exe.to_string_lossy().to_string();
    LauncherDto {
        id: id.to_string(),
        name: name.to_string(),
        installed: true,
        launch_target: p.clone(),
        icon_path: Some(p),
    }
}

// Détecte Steam via le chemin standard — utilise l'URI steam:// pour le lancement
fn detect_steam() -> Option<LauncherDto> {
    let base = PathBuf::from(r"C:\Program Files (x86)\Steam");
    let exe = base.join("steam.exe");
    if !exe.is_file() {
        return None;
    }

    Some(LauncherDto {
        id: "steam".to_string(),
        name: "Steam".to_string(),
        installed: true,
        // URI protocol plus fiable que l'exe direct pour ouvrir Steam
        launch_target: "steam://open/main".to_string(),
        // L'icône doit venir d'un vrai fichier .exe (pas d'une URI)
        icon_path: Some(exe.to_string_lossy().to_string()),
    })
}

// Détecte Epic Games Launcher via le registre ou les chemins connus
fn detect_epic() -> Option<LauncherDto> {
    if let Some(exe) = find_exe_from_uninstall(
        &["Epic Games Launcher", "Epic Games"],
        &[
            r"Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe",
            r"Portal\Binaries\Win64\EpicGamesLauncher.exe",
            r"EpicGamesLauncher.exe",
        ],
    ) {
        return Some(make_exe_launcher("epic", "Epic Games", exe));
    }

    let known = [
        r"C:\Program Files (x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe",
        r"C:\Program Files\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe",
    ];

    first_existing_path(&known).map(|p| make_exe_launcher("epic", "Epic Games", p))
}

// Détecte Battle.net via le registre ou les chemins connus
fn detect_battlenet() -> Option<LauncherDto> {
    if let Some(exe) = find_exe_from_uninstall(
        &["Battle.net", "Blizzard Battle.net"],
        &["Battle.net.exe", "Battle.net Launcher.exe"],
    ) {
        return Some(make_exe_launcher("battlenet", "Battle.net", exe));
    }

    let known = [
        r"C:\Program Files (x86)\Battle.net\Battle.net.exe",
        r"C:\Program Files\Battle.net\Battle.net.exe",
    ];

    first_existing_path(&known).map(|p| make_exe_launcher("battlenet", "Battle.net", p))
}

// Détecte Riot Client via les exes connus dans le dossier d'installation standard
fn detect_riot() -> Option<LauncherDto> {
    let base = PathBuf::from(r"C:\Riot Games\Riot Client");

    let exe1 = base.join("RiotClientServices.exe");
    let exe2 = base.join("RiotClientUx.exe");

    // Préfère RiotClientServices.exe, utilise RiotClientUx.exe en fallback
    let exe = if exe1.is_file() {
        exe1
    } else if exe2.is_file() {
        exe2
    } else {
        return None;
    };

    Some(LauncherDto {
        id: "riot".to_string(),
        name: "Riot Client".to_string(),
        installed: true,
        launch_target: exe.to_string_lossy().to_string(),
        icon_path: Some(exe.to_string_lossy().to_string()),
    })
}

// Détecte Rockstar Games Launcher via le registre ou les chemins connus
fn detect_rockstar_launcher() -> Option<LauncherDto> {
    if let Some(exe) = find_exe_from_uninstall(
        &["Rockstar Games Launcher", "Rockstar Games"],
        &[
            r"Launcher\Launcher.exe",
            r"Launcher.exe",
            r"Rockstar Games Launcher.exe",
        ],
    ) {
        return Some(make_exe_launcher("rockstar", "Rockstar Games", exe));
    }

    let known = [
        r"C:\Program Files\Rockstar Games\Launcher\Launcher.exe",
        r"C:\Program Files (x86)\Rockstar Games\Launcher\Launcher.exe",
    ];

    first_existing_path(&known).map(|p| make_exe_launcher("rockstar", "Rockstar Games", p))
}

// Détecte Ubisoft Connect (anciennement Uplay) via le registre ou les chemins connus
fn detect_ubisoft_connect() -> Option<LauncherDto> {
    if let Some(exe) = find_exe_from_uninstall(
        &["Ubisoft Connect", "Uplay", "Ubisoft Game Launcher"],
        &["UbisoftConnect.exe", "Uplay.exe"],
    ) {
        return Some(make_exe_launcher("ubisoft", "Ubisoft Connect", exe));
    }

    let known = [
        r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\UbisoftConnect.exe",
        r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\Uplay.exe",
        r"C:\Program Files\Ubisoft\Ubisoft Game Launcher\UbisoftConnect.exe",
    ];

    first_existing_path(&known).map(|p| make_exe_launcher("ubisoft", "Ubisoft Connect", p))
}

// Détecte Hytale Launcher via le chemin connu ou le registre
fn detect_hytale() -> Option<LauncherDto> {
    let known = [r"C:\Program Files\Hypixel Studios\Hytale Launcher\hytale-launcher.exe"];

    if let Some(p) = first_existing_path(&known) {
        return Some(make_exe_launcher("hytale", "Hytale", p));
    }

    if let Some(exe) = find_exe_from_uninstall(
        &["Hytale"],
        &[
            "hytale-launcher.exe",
            "Hytale Launcher.exe",
            "HytaleLauncher.exe",
            "Launcher.exe",
        ],
    ) {
        return Some(make_exe_launcher("hytale", "Hytale", exe));
    }

    None
}
