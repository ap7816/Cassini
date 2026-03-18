use serde::Serialize;
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDto {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub launch_target: String, // URI (steam://...) ou chemin exe
    pub icon_path: Option<String>,
}

// IMPORTANT: PAS de #[tauri::command] ici.
// Le command Tauri est défini dans lib.rs et appelle cette fonction.
pub fn scan_launchers() -> Result<Vec<LauncherDto>, String> {
    let mut out: Vec<LauncherDto> = Vec::new();

    if let Some(x) = detect_steam() {
        out.push(x);
    }
    if let Some(x) = detect_epic() {
        out.push(x);
    }
    if let Some(x) = detect_battlenet() {
        out.push(x);
    }
    if let Some(x) = detect_riot() {
        out.push(x);
    }
    if let Some(x) = detect_rockstar_launcher() {
        out.push(x);
    }
    if let Some(x) = detect_ubisoft_connect() {
        out.push(x);
    }
    if let Some(x) = detect_hytale() {
        out.push(x);
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/* ---------------- Generic helpers ---------------- */

fn contains_any(haystack_lc: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|n| haystack_lc.contains(&n.to_lowercase()))
}

fn parse_display_icon_path(raw: &str) -> Option<PathBuf> {
    // "C:\...\App.exe,0" -> "C:\...\App.exe"
    let trimmed = raw.trim().trim_matches('"');
    let before_comma = trimmed.split(',').next().unwrap_or(trimmed).trim();
    if before_comma.is_empty() {
        return None;
    }
    Some(PathBuf::from(before_comma))
}

fn parse_uninstall_string_exe(raw: &str) -> Option<PathBuf> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }

    // 1) Si c'est "...\something.exe" ...
    let path_str = if s.starts_with('"') {
        // prend le contenu entre les 2 premiers "
        let rest = &s[1..];
        let end = rest.find('"')?;
        &rest[..end]
    } else {
        // sinon prend le 1er token
        s.split_whitespace().next().unwrap_or("")
    };

    if path_str.is_empty() {
        return None;
    }

    let path_str = path_str.trim().trim_matches('"');
    let path_str = path_str.split(',').next().unwrap_or(path_str).trim();

    // ignore msiexec
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

            // 1) DisplayIcon -> souvent un exe (parfois un .ico)
            if let Ok(icon) = sk.get_value::<String, _>("DisplayIcon") {
                if let Some(p) = parse_display_icon_path(&icon) {
                    if p.is_file() && p.to_string_lossy().to_lowercase().ends_with(".exe") {
                        return Some(p);
                    }
                }
            }

            // 2) InstallLocation + exe_names
            if let Ok(loc) = sk.get_value::<String, _>("InstallLocation") {
                let base = PathBuf::from(loc);
                for exe in exe_names {
                    let guess = base.join(exe);
                    if guess.is_file() {
                        return Some(guess);
                    }
                }
            }

            // 3) UninstallString peut contenir le launcher exe
            if let Ok(us) = sk.get_value::<String, _>("UninstallString") {
                if let Some(p) = parse_uninstall_string_exe(&us) {
                    return Some(p);
                }
            }
        }
    }

    None
}

fn first_existing_path(candidates: &[&str]) -> Option<PathBuf> {
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

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

/* ---------------- Steam ---------------- */

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
        // On garde l’URI (souvent le plus fiable) pour ouvrir Steam
        launch_target: "steam://open/main".to_string(),
        // Mais l’icône doit venir d’un vrai .exe
        icon_path: Some(exe.to_string_lossy().to_string()),
    })
}

/* ---------------- Epic Games Launcher ---------------- */

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

/* ---------------- Battle.net ---------------- */

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

/* ---------------- Riot Client ---------------- */

fn detect_riot() -> Option<LauncherDto> {
    let base = PathBuf::from(r"C:\Riot Games\Riot Client");

    // L’exe le plus courant
    let exe1 = base.join("RiotClientServices.exe");
    // au cas où (selon install)
    let exe2 = base.join("RiotClientUx.exe");

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
        // Ouvrir le launcher via l’exe directement
        launch_target: exe.to_string_lossy().to_string(),
        // Icône depuis le même exe
        icon_path: Some(exe.to_string_lossy().to_string()),
    })
}

/* ---------------- Rockstar Games Launcher ---------------- */

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

/* ---------------- Ubisoft Connect (Uplay) ---------------- */

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

/* ---------------- Hytale (best-effort) ---------------- */

fn detect_hytale() -> Option<LauncherDto> {
    // Chemin connu chez toi
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
