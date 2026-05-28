// Modules de scan par plateforme et utilitaires d'extraction d'icônes
mod battlenet_scan;
mod epic_scan;
mod icon_extract;
mod launcher_scan;
mod riot_scan;
mod rockstar_scan;
mod steam_scan;
mod ubisoft_scan;
use tauri_plugin_log;

// Métadonnées audio renvoyées au frontend pour chaque piste
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    // Pochette encodée en base64 data-URL (None si with_cover=false)
    pub cover_data_url: Option<String>,
    pub duration_secs: Option<f64>,
}

// Implémentation partagée : with_cover=false saute l'encodage base64 de la pochette (mode batch rapide)
fn read_track_metadata(path: &str, with_cover: bool) -> TrackMetadata {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use base64::Engine;

    let empty = TrackMetadata {
        path: path.to_string(),
        title: None, artist: None, album: None,
        cover_data_url: None, duration_secs: None,
    };

    let tagged = {
        let p = match Probe::open(path) {
            Ok(p) => p,
            Err(_) => return empty,
        };
        let p = match p.guess_file_type() {
            Ok(p) => p,
            Err(_) => return empty,
        };
        match p.read() {
            Ok(t) => t,
            Err(_) => return empty,
        }
    };

    // Durée en secondes depuis les propriétés audio — lecture rapide sans décodage des tags
    let duration_secs = {
        let d = tagged.properties().duration().as_secs_f64();
        if d > 0.0 { Some(d) } else { None }
    };

    let tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => return TrackMetadata { duration_secs, ..empty },
    };

    let title = tag.title().map(|s| s.to_string());
    let artist = tag.artist().map(|s| s.to_string());
    let album = tag.album().map(|s| s.to_string());

    let cover_data_url = if with_cover {
        tag.pictures()
            .iter()
            .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
            .or_else(|| tag.pictures().first())
            .and_then(|p| {
                let data = p.data();
                if data.len() > 1_500_000 { return None; }
                let mime = p.mime_type()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| "image/jpeg".to_string());
                let encoded = base64::engine::general_purpose::STANDARD.encode(data);
                Some(format!("data:{};base64,{}", mime, encoded))
            })
    } else {
        None
    };

    TrackMetadata { path: path.to_string(), title, artist, album, cover_data_url, duration_secs }
}

// Commande Tauri : retourne les métadonnées complètes d'une piste (avec pochette) pour le mini-lecteur
#[tauri::command]
fn get_track_metadata(path: String) -> TrackMetadata {
    read_track_metadata(&path, true)
}

// Commande Tauri : retourne titre/artiste/album/durée pour toutes les pistes sans pochette
// Traitement en parallèle via rayon pour ne pas bloquer le thread UI
#[tauri::command]
fn get_tracks_basic_batch(paths: Vec<String>) -> Vec<TrackMetadata> {
    use rayon::prelude::*;
    paths.par_iter()
        .map(|p| read_track_metadata(p, false))
        .collect()
}

#[derive(serde::Serialize)]
pub struct TrackDto {
    pub path: String,
    pub title: String,
    pub folder: String,
}

// Commande Tauri : parcourt récursivement un dossier et retourne toutes les pistes audio trouvées
#[tauri::command]
fn scan_music_folder(path: String) -> Result<Vec<TrackDto>, String> {
    let audio_exts = ["mp3", "flac", "wav", "ogg", "m4a", "opus"];
    let mut tracks: Vec<TrackDto> = Vec::new();

    // Fonction récursive interne : descend dans les sous-dossiers et collecte les fichiers audio
    fn walk_dir(root: &std::path::Path, dir: &std::path::Path, audio_exts: &[&str], tracks: &mut Vec<TrackDto>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        let folder = dir.strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(root, &path, audio_exts, tracks);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if audio_exts.contains(&ext.to_lowercase().as_str()) {
                    let title = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    let abs_path = path
                        .canonicalize()
                        .unwrap_or(path.clone())
                        .to_string_lossy()
                        .to_string();
                    tracks.push(TrackDto { path: abs_path, title, folder: folder.clone() });
                }
            }
        }
    }

    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    walk_dir(root, root, &audio_exts, &mut tracks);
    tracks.sort_by(|a, b| {
        match (a.folder.is_empty(), b.folder.is_empty()) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => a.folder.to_lowercase().cmp(&b.folder.to_lowercase())
                .then(a.title.to_lowercase().cmp(&b.title.to_lowercase())),
        }
    });
    Ok(tracks)
}

// Commande Tauri : extrait l'icône d'un fichier .exe et la retourne en data-URL PNG 64×64
#[tauri::command]
fn get_file_icon_data_url(path: String) -> Result<String, String> {
    icon_extract::file_icon_png_data_url(&path, 64)
}

// Commande Tauri : ouvre un dossier dans l'explorateur de fichiers natif (cross-platform)
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Commande Tauri de test (non utilisée en prod) — conservée pour compatibilité
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Commande Tauri : scanne les jeux Steam installés via les manifestes ACF
#[tauri::command]
fn scan_steam_games() -> Result<Vec<steam_scan::GameDto>, String> {
    steam_scan::scan_steam_games()
}

// Commande Tauri : scanne les jeux Epic Games via les fichiers .item du launcher
#[tauri::command]
fn scan_epic_games() -> Result<Vec<steam_scan::GameDto>, String> {
    epic_scan::scan_epic_games()
}

// Commande Tauri : scanne les jeux Battle.net via le registre Windows
#[tauri::command]
fn scan_battlenet_games() -> Result<Vec<steam_scan::GameDto>, String> {
    battlenet_scan::scan_battlenet_games()
}

// Commande Tauri : scanne les jeux Riot Games via le registre Windows
#[tauri::command]
fn scan_riot_games() -> Result<Vec<steam_scan::GameDto>, String> {
    riot_scan::scan_riot_games()
}

// Commande Tauri : scanne les jeux Rockstar Games via le registre Windows
#[tauri::command]
fn scan_rockstar_games() -> Result<Vec<steam_scan::GameDto>, String> {
    rockstar_scan::scan_rockstar_games()
}

// Commande Tauri : scanne les jeux Ubisoft Connect via le registre Windows
#[tauri::command]
fn scan_ubisoft_games() -> Result<Vec<steam_scan::GameDto>, String> {
    ubisoft_scan::scan_ubisoft_games()
}

// Commande Tauri : détecte les launchers installés (Steam, Epic, Battle.net, Riot, Rockstar, Ubisoft)
#[tauri::command]
fn scan_launchers() -> Result<Vec<launcher_scan::LauncherDto>, String> {
    launcher_scan::scan_launchers()
}

// Commande Tauri : liste tous les sous-dossiers d'un dossier racine (chemins relatifs)
#[tauri::command]
fn list_music_dirs(root: String) -> Result<Vec<String>, String> {
    let root_path = std::path::Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    let mut dirs: Vec<String> = Vec::new();

    // Fonction récursive interne : collecte les chemins relatifs de tous les sous-dossiers
    fn walk(root: &std::path::Path, dir: &std::path::Path, dirs: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(rel) = path.strip_prefix(root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if !rel_str.is_empty() {
                        dirs.push(rel_str);
                    }
                }
                walk(root, &path, dirs);
            }
        }
    }

    walk(root_path, root_path, &mut dirs);
    dirs.sort();
    Ok(dirs)
}

// Commande Tauri : crée un dossier musical (et ses parents si nécessaire)
#[tauri::command]
fn create_music_folder(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

// Commande Tauri : supprime récursivement un dossier musical et tout son contenu
#[tauri::command]
fn delete_music_folder(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

// Commande Tauri : renomme un dossier musical en vérifiant l'absence de conflit de noms
#[tauri::command]
fn rename_music_folder(path: String, new_name: String) -> Result<(), String> {
    use std::path::Path;
    let src = Path::new(&path);
    let parent = src.parent().ok_or_else(|| "Dossier sans parent".to_string())?;
    let dst = parent.join(&new_name);
    if dst.exists() {
        return Err(format!("Un dossier « {} » existe déjà", new_name));
    }
    std::fs::rename(&path, &dst).map_err(|e| e.to_string())
}

// Commande Tauri : déplace un fichier audio vers un autre dossier, renomme si conflit de noms
#[tauri::command]
fn move_music_file(src: String, dst_folder: String) -> Result<(), String> {
    use std::path::Path;
    let src_path = Path::new(&src);
    let filename = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Fichier source invalide".to_string())?;

    let dst_dir = Path::new(&dst_folder);
    std::fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;

    let mut dst_path = dst_dir.join(filename);

    // Résoudre les conflits de noms en ajoutant un compteur numérique "(1)", "(2)"…
    if dst_path.exists() {
        let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mut i = 1u32;
        loop {
            let name = if ext.is_empty() {
                format!("{} ({})", stem, i)
            } else {
                format!("{} ({}).{}", stem, i, ext)
            };
            let candidate = dst_dir.join(&name);
            if !candidate.exists() {
                dst_path = candidate;
                break;
            }
            i += 1;
        }
    }

    std::fs::rename(&src, &dst_path).map_err(|e| e.to_string())
}

// Commande Tauri : vérifie si ArcHive est configuré pour démarrer avec Windows
#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
            Ok(key) => key.get_value::<String, _>("ArcHive").is_ok(),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

// Commande Tauri : active ou désactive le démarrage automatique d'ArcHive via la clé Run du registre
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| e.to_string())?;
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            run.set_value("ArcHive", &exe_path).map_err(|e| e.to_string())?;
        } else {
            let _ = run.delete_value("ArcHive");
        }
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = enabled; }
    Ok(())
}

// Commande Tauri : lance un jeu Battle.net via l'argument --exec=launch de Battle.net.exe
#[tauri::command]
fn launch_battlenet_game(uid: String) -> Result<(), String> {
    let candidates = [
        r"C:\Program Files (x86)\Battle.net\Battle.net.exe",
        r"C:\Program Files\Battle.net\Battle.net.exe",
    ];

    let exe = candidates
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .ok_or_else(|| "Battle.net.exe introuvable".to_string())?;

    std::process::Command::new(exe)
        .arg(format!("--exec=launch {uid}"))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Commande Tauri : lance un jeu Riot via RiotClientServices.exe avec le product ID et la patchline live
#[tauri::command]
fn launch_riot_game(product: String) -> Result<(), String> {
    let exe = riot_scan::find_riot_client_exe()
        .ok_or_else(|| "RiotClientServices.exe introuvable".to_string())?;

    std::process::Command::new(&exe)
        .arg(format!("--launch-product={}", product))
        .arg("--launch-patchline=live")
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Commande Tauri : lance un jeu Ubisoft via le protocole uplay:// (cmd /c start pour déclencher le handler Windows)
#[tauri::command]
fn launch_ubisoft_game(game_id: String) -> Result<(), String> {
    // uplay://launch/<id>/0 — cmd /c start est nécessaire pour activer le handler de protocole Windows
    let url = format!("uplay://launch/{}/0", game_id);
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Résultat d'enrichissement renvoyé au frontend : artiste, album, URL de pochette et source API
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMetaResult {
    pub artist: Option<String>,
    pub album: Option<String>,
    // URL HTTPS externe vers la pochette d'album, prête à être utilisée dans <img src>
    pub cover_url: Option<String>,
    // Quelle API a trouvé le résultat : "itunes" ou "deezer"
    pub source: String,
}

// Calcule la fraction de mots de needle_lc (≥ 3 caractères) présents dans haystack_lc
// Les deux chaînes doivent déjà être en minuscules
fn word_recall(needle_lc: &str, haystack_lc: &str) -> f32 {
    let needle_words: Vec<&str> = needle_lc
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3)
        .collect();
    if needle_words.is_empty() { return 0.0; }

    let hay_words: Vec<&str> = haystack_lc
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();

    let matched = needle_words.iter()
        .filter(|&&w| hay_words.contains(&w))
        .count();

    matched as f32 / needle_words.len() as f32
}

// Supprime tout ce qui suit la première parenthèse ou crochet pour nettoyer les titres avec remix/remaster
// Ex : "Stressed Out (Tomsize Remix)" → "Stressed Out"
fn strip_parens(s: &str) -> &str {
    let cut = s.find('(').or_else(|| s.find('['));
    cut.map(|i| s[..i].trim_end()).unwrap_or(s)
}

// Retourne un score de confiance [0, 1] indiquant à quel point (result_title, result_artist) correspond à `term`
// Format "Artiste - Titre" : titre pondéré à 65 %, artiste à 35 %
// Sans artiste dans le terme de recherche : retourne 0.0 pour éviter les faux positifs
fn match_score(term: &str, result_title: &str, result_artist: &str) -> f32 {
    let term_lc   = term.to_lowercase();
    let title_lc  = result_title.to_lowercase();
    let artist_lc = result_artist.to_lowercase();

    // Format "Artiste - Titre" : calcule le score séparément pour chaque partie
    if let Some(dash) = term_lc.find(" - ") {
        let t_artist = &term_lc[..dash];
        let t_title  = &term_lc[dash + 3..];

        // Compare avec et sans suffixe entre parenthèses pour tolérer les remixes/remasters
        let t_title_clean = strip_parens(t_title);
        let tr = word_recall(t_title,       &title_lc)
            .max(word_recall(t_title_clean, &title_lc));
        let ar = word_recall(t_artist, &artist_lc);

        // Si l'artiste du terme contient des mots mais qu'aucun ne correspond → résultat suspect
        let artist_has_words = t_artist
            .split(|c: char| !c.is_alphanumeric())
            .any(|w| w.len() >= 3);
        if artist_has_words && ar == 0.0 {
            return tr * 0.35; // correspondance titre seulement — peu fiable
        }

        return tr * 0.65 + ar * 0.35;
    }

    // Recherche titre seul : impossible de distinguer une vraie correspondance d'un homonyme
    // → retourne 0.0 pour ne jamais atteindre MIN_SCORE (mieux ne rien afficher que la mauvaise pochette)
    // Le côté JS ajoute l'artiste quand les tags ID3 sont présents, donc les pistes avec métadonnées
    // passent déjà par le format "Artiste - Titre" ci-dessus
    0.0
}

// Score minimum pour accepter un résultat : 0.7 volontairement strict pour éviter les mauvaises pochettes
const MIN_SCORE: f32 = 0.7;

// Interroge l'API iTunes Search et retourne le meilleur résultat si son score dépasse MIN_SCORE
async fn try_itunes(client: &reqwest::Client, term: &str) -> Option<MusicMetaResult> {
    let resp = client
        .get("https://itunes.apple.com/search")
        .query(&[("term", term), ("media", "music"), ("limit", "5")])
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() { return None; }

    let json: serde_json::Value = resp.json().await.ok()?;
    let results = json["results"].as_array()?;
    if results.is_empty() { return None; }

    // Sélectionne le candidat avec le meilleur score parmi les 5 résultats
    let (best_score, best) = results.iter()
        .map(|r| {
            let title  = r["trackName"].as_str().unwrap_or("");
            let artist = r["artistName"].as_str().unwrap_or("");
            (match_score(term, title, artist), r)
        })
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))?;

    if best_score < MIN_SCORE { return None; }

    // Remplace la taille 100×100 par 600×600 pour une pochette haute résolution
    let cover_url = best["artworkUrl100"]
        .as_str()
        .map(|u| u.replacen("100x100bb", "600x600bb", 1));

    Some(MusicMetaResult {
        artist:    best["artistName"].as_str().map(String::from),
        album:     best["collectionName"].as_str().map(String::from),
        cover_url,
        source:    "itunes".into(),
    })
}

// Interroge l'API Deezer Search en fallback et retourne le meilleur résultat si son score dépasse MIN_SCORE
async fn try_deezer(client: &reqwest::Client, term: &str) -> Option<MusicMetaResult> {
    let resp = client
        .get("https://api.deezer.com/search")
        .query(&[("q", term), ("limit", "5")])
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() { return None; }

    let json: serde_json::Value = resp.json().await.ok()?;
    let data = json["data"].as_array()?;
    if data.is_empty() { return None; }

    // Sélectionne le candidat avec le meilleur score parmi les 5 résultats
    let (best_score, best) = data.iter()
        .map(|r| {
            let title  = r["title"].as_str().unwrap_or("");
            let artist = r["artist"]["name"].as_str().unwrap_or("");
            (match_score(term, title, artist), r)
        })
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))?;

    if best_score < MIN_SCORE { return None; }

    // cover_xl = 1000×1000 — meilleure résolution disponible chez Deezer
    let cover_url = best["album"]["cover_xl"].as_str().map(String::from);

    Some(MusicMetaResult {
        artist:    best["artist"]["name"].as_str().map(String::from),
        album:     best["album"]["title"].as_str().map(String::from),
        cover_url,
        source:    "deezer".into(),
    })
}

// Commande Tauri : enrichit les métadonnées d'une piste via iTunes puis Deezer en fallback
// S'exécute côté Rust pour contourner les restrictions CORS du navigateur
// term doit déjà être nettoyé (sans extension, sans numéro de piste)
#[tauri::command]
async fn search_itunes(term: String) -> Result<Option<MusicMetaResult>, String> {
    if term.trim().is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. iTunes en priorité : catalogue mondial, métadonnées structurées de qualité
    if let Some(result) = try_itunes(&client, &term).await {
        return Ok(Some(result));
    }

    // 2. Deezer en fallback : meilleure couverture des titres non-anglophones
    Ok(try_deezer(&client, &term).await)
}


// Point d'entrée de l'application Tauri : configure les plugins, la tray icon et les commandes disponibles
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Configure l'icône de la zone de notification avec un menu contextuel Ouvrir/Quitter
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::Manager;
                let show_i = MenuItem::with_id(app, "show", "Ouvrir ArcHive", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
                TrayIconBuilder::new()
                    .menu(&menu)
                    .icon(app.default_window_icon().unwrap().clone())
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_riot_games, scan_rockstar_games, scan_ubisoft_games, scan_launchers, get_file_icon_data_url, open_folder, launch_battlenet_game, launch_riot_game, launch_ubisoft_game, scan_music_folder, get_autostart, set_autostart, list_music_dirs, create_music_folder, delete_music_folder, rename_music_folder, move_music_file, get_track_metadata, get_tracks_basic_batch, search_itunes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
