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

// Sémaphore global : limite MusicBrainz à 1 requête simultanée pour respecter leur rate-limit (1 req/s)
static MB_SEMAPHORE: std::sync::OnceLock<tokio::sync::Semaphore> = std::sync::OnceLock::new();

fn get_mb_semaphore() -> &'static tokio::sync::Semaphore {
    MB_SEMAPHORE.get_or_init(|| tokio::sync::Semaphore::new(1))
}

// Interroge l'API MusicBrainz en dernier recours — plus lent (rate-limit 1 req/s) mais plus précis
// Ne fonctionne que sur le format "Artiste - Titre" (sans artiste → résultats trop ambigus)
async fn try_musicbrainz(client: &reqwest::Client, term: &str) -> Option<MusicMetaResult> {
    // Un seul permit à la fois + délai pour respecter le rate-limit MusicBrainz
    let _permit = get_mb_semaphore().acquire().await.ok()?;
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

    // Requête structurée "Artiste - Titre" uniquement
    let (artist_part, title_part) = {
        let dash = term.find(" - ")?; // retourne None si pas de " - " → pas de recherche MB
        (&term[..dash], &term[dash + 3..])
    };
    // Supprime les suffixes entre parenthèses (remix, remaster…) pour améliorer le match
    let title_clean = {
        let cut = title_part.find('(').or_else(|| title_part.find('['));
        cut.map(|i| title_part[..i].trim_end()).unwrap_or(title_part)
    };
    let query = format!("recording:\"{}\" AND artist:\"{}\"", title_clean, artist_part);

    let resp = client
        .get("https://musicbrainz.org/ws/2/recording/")
        .header("User-Agent", "ArcHive/1.1.3 (desktop; noreply@example.com)")
        .query(&[("query", query.as_str()), ("fmt", "json"), ("limit", "5")])
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() { return None; }

    let json: serde_json::Value = resp.json().await.ok()?;
    let recordings = json["recordings"].as_array()?;

    // Score MusicBrainz : 0-100 — seuil 80 pour limiter les faux positifs
    let best = recordings.iter()
        .filter(|r| r["score"].as_u64().unwrap_or(0) >= 80)
        .max_by_key(|r| r["score"].as_u64().unwrap_or(0))?;

    let artist = best["artist-credit"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a["name"].as_str())
        .map(String::from);

    let release = best["releases"].as_array().and_then(|r| r.first());
    let album = release
        .and_then(|r| r["title"].as_str())
        .map(String::from);

    // Cover Art Archive : pochette 500px depuis l'ID de release MusicBrainz
    let cover_url = release
        .and_then(|r| r["id"].as_str())
        .map(|rid| format!("https://coverartarchive.org/release/{}/front-500", rid));

    // Rejette si pas d'artiste ni de pochette (résultat inutile)
    if artist.is_none() && cover_url.is_none() { return None; }

    Some(MusicMetaResult { artist, album, cover_url, source: "musicbrainz".into() })
}

// Commande Tauri : enrichit les métadonnées d'une piste via iTunes, Deezer puis MusicBrainz en fallback
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
    if let Some(result) = try_deezer(&client, &term).await {
        return Ok(Some(result));
    }

    // 3. MusicBrainz en dernier recours : open-source, très précis, rate-limité à 1 req/s
    Ok(try_musicbrainz(&client, &term).await)
}

// Commande Tauri : écrit artiste, album et pochette directement dans les tags du fichier audio
// Utilise lofty pour supporter MP3 (ID3v2), FLAC, OGG, M4A, Opus
// Permet de ne plus jamais refaire la recherche réseau pour une piste déjà enrichie
#[tauri::command]
async fn write_audio_tags(
    path: String,
    artist: Option<String>,
    album: Option<String>,
    cover_url: Option<String>,
) -> Result<(), String> {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use lofty::picture::{Picture, PictureType, MimeType};
    use lofty::config::WriteOptions;

    // Télécharge la pochette si une URL est fournie (avant d'ouvrir le fichier pour éviter les conflits)
    let cover_bytes: Option<(Vec<u8>, MimeType)> = if let Some(ref url) = cover_url {
        let dl_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        match dl_client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let mime = resp.headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| if s.contains("png") { MimeType::Png } else { MimeType::Jpeg })
                    .unwrap_or(MimeType::Jpeg);
                match resp.bytes().await {
                    Ok(b) if !b.is_empty() => Some((b.to_vec(), mime)),
                    _ => None,
                }
            }
            _ => None,
        }
    } else {
        None
    };

    // Rien à écrire → succès silencieux
    if artist.is_none() && album.is_none() && cover_bytes.is_none() {
        return Ok(());
    }

    // Lecture du fichier audio existant
    let mut tagged_file = Probe::open(&path)
        .map_err(|e| format!("Ouverture impossible ({path}): {e}"))?
        .guess_file_type()
        .map_err(|e| format!("Format inconnu ({path}): {e}"))?
        .read()
        .map_err(|e| format!("Lecture échouée ({path}): {e}"))?;

    // Crée un tag vide si le fichier n'en a aucun
    if tagged_file.primary_tag().is_none() && tagged_file.first_tag().is_none() {
        let tag_type = tagged_file.primary_tag_type();
        tagged_file.insert_tag(lofty::tag::Tag::new(tag_type));
    }

    // Modifie le tag en place (n'écrase que les champs fournis)
    // On vérifie d'abord quel tag est disponible, puis on le modifie (évite le double borrow mutable)
    let has_primary = tagged_file.primary_tag().is_some();
    if let Some(tag) = if has_primary {
        tagged_file.primary_tag_mut()
    } else {
        tagged_file.first_tag_mut()
    } {
        if let Some(a) = artist { tag.set_artist(a); }
        if let Some(a) = album  { tag.set_album(a);  }
        if let Some((bytes, mime)) = cover_bytes {
            tag.remove_picture_type(PictureType::CoverFront);
            tag.push_picture(Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime),
                None,
                bytes,
            ));
        }
    }

    // Écrit les modifications dans le fichier
    tagged_file
        .save_to_path(&path, WriteOptions::default())
        .map_err(|e| format!("Écriture échouée ({path}): {e}"))
}


// Commande Tauri : remplace la pochette d'un fichier audio par une image choisie localement
// Lit l'image depuis le disque (pas de réseau), supportée sur tous les formats gérés par lofty
#[tauri::command]
fn write_audio_cover_from_file(audio_path: String, image_path: String) -> Result<(), String> {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use lofty::picture::{Picture, PictureType, MimeType};
    use lofty::config::WriteOptions;

    // Lit les octets de l'image depuis le disque local
    let image_data = std::fs::read(&image_path)
        .map_err(|e| format!("Lecture image impossible : {e}"))?;
    if image_data.is_empty() {
        return Err("Fichier image vide".to_string());
    }

    // Déduit le type MIME depuis l'extension du fichier image
    let mime = match std::path::Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("png") => MimeType::Png,
        Some("gif") => MimeType::Gif,
        Some("bmp") => MimeType::Bmp,
        _           => MimeType::Jpeg, // jpg, jpeg, webp…
    };

    // Lit le fichier audio existant
    let mut tagged_file = Probe::open(&audio_path)
        .map_err(|e| format!("Ouverture impossible : {e}"))?
        .guess_file_type()
        .map_err(|e| format!("Format inconnu : {e}"))?
        .read()
        .map_err(|e| format!("Lecture échouée : {e}"))?;

    // Crée un tag si le fichier n'en a aucun
    if tagged_file.primary_tag().is_none() && tagged_file.first_tag().is_none() {
        let tag_type = tagged_file.primary_tag_type();
        tagged_file.insert_tag(lofty::tag::Tag::new(tag_type));
    }

    let has_primary = tagged_file.primary_tag().is_some();
    if let Some(tag) = if has_primary {
        tagged_file.primary_tag_mut()
    } else {
        tagged_file.first_tag_mut()
    } {
        tag.remove_picture_type(PictureType::CoverFront);
        tag.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            image_data,
        ));
    }

    tagged_file
        .save_to_path(&audio_path, WriteOptions::default())
        .map_err(|e| format!("Écriture échouée : {e}"))
}

// Recherche un jeu sur SteamGridDB et retourne l'URL de la meilleure bannière (460×215).
// Appelé depuis le frontend pour contourner les restrictions CORS du navigateur.
async fn sgdb_search_and_fetch(client: &reqwest::Client, title: &str, api_key: &str) -> Option<String> {
    let encoded = urlencoding::encode(title);
    let search_url = format!("https://www.steamgriddb.com/api/v2/search/autocomplete/{}", encoded);

    let resp = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        eprintln!("[sgdb] search HTTP {} for «{}»", resp.status(), title);
        return None;
    }

    let data: serde_json::Value = resp.json().await.ok()?;
    let results = data["data"].as_array()?;

    if results.is_empty() {
        eprintln!("[sgdb] «{}» → no results", title);
        return None;
    }

    let first = &results[0];
    let game_id = first["id"].as_u64()?;
    let matched_name = first["name"].as_str().unwrap_or("?");
    eprintln!("[sgdb] «{}» → matched «{}» (id {})", title, matched_name, game_id);

    // Tentative 1 : bannières paysage standard (460×215 ou 920×430)
    let grids_url = format!(
        "https://www.steamgriddb.com/api/v2/grids/game/{}?dimensions=460x215,920x430&nsfw=false",
        game_id
    );

    let resp = client
        .get(&grids_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .ok()?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await.ok()?;
        if let Some(url) = data["data"].as_array().and_then(|a| a.first()).and_then(|g| g["url"].as_str()) {
            eprintln!("[sgdb] «{}» → image found ✓", title);
            return Some(url.to_string());
        }
    }

    // Tentative 2 : n'importe quelle grille si pas de taille standard disponible
    let grids_url2 = format!(
        "https://www.steamgriddb.com/api/v2/grids/game/{}?nsfw=false&limit=1",
        game_id
    );

    let resp2 = client
        .get(&grids_url2)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .ok()?;

    if !resp2.status().is_success() {
        eprintln!("[sgdb] grids HTTP {} for «{}»", resp2.status(), title);
        return None;
    }

    let data2: serde_json::Value = resp2.json().await.ok()?;
    let url = data2["data"].as_array()?.first()?["url"].as_str().map(|s| s.to_string());

    if url.is_some() {
        eprintln!("[sgdb] «{}» → image found (non-standard size) ✓", title);
    } else {
        eprintln!("[sgdb] «{}» → matched but no grid image", title);
    }

    url
}

#[tauri::command]
async fn fetch_sgdb_image(title: String, api_key: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();

    if let Some(url) = sgdb_search_and_fetch(&client, &title, &api_key).await {
        return Ok(Some(url));
    }

    // 2ème tentative sans les chiffres finaux (ex: "Call of Duty 2" → "Call of Duty")
    let stripped = title.trim_end_matches(|c: char| c.is_ascii_digit()).trim_end();
    if !stripped.is_empty() && stripped != title.as_str() {
        eprintln!("[sgdb] «{}» → retrying as «{}»", title, stripped);
        if let Some(url) = sgdb_search_and_fetch(&client, stripped, &api_key).await {
            return Ok(Some(url));
        }
    }

    eprintln!("[sgdb] «{}» → not found", title);
    Ok(None)
}

// Structure renvoyée au frontend avec les informations d'espace disque
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

// Commande Tauri : retourne l'espace libre et total du lecteur système (ex: C:\)
#[tauri::command]
fn get_disk_free_space() -> Result<DiskInfo, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        let path = format!("{}\\", drive);

        let wide: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;

        unsafe {
            GetDiskFreeSpaceExW(
                PCWSTR(wide.as_ptr()),
                Some(std::ptr::addr_of_mut!(free_bytes)),
                Some(std::ptr::addr_of_mut!(total_bytes)),
                None,
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(DiskInfo { free_bytes, total_bytes })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Unsupported platform".to_string())
    }
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
        .invoke_handler(tauri::generate_handler![greet, scan_steam_games, scan_epic_games, scan_battlenet_games, scan_riot_games, scan_rockstar_games, scan_ubisoft_games, scan_launchers, get_file_icon_data_url, open_folder, launch_battlenet_game, launch_riot_game, launch_ubisoft_game, scan_music_folder, get_autostart, set_autostart, list_music_dirs, create_music_folder, delete_music_folder, rename_music_folder, move_music_file, get_track_metadata, get_tracks_basic_batch, search_itunes, write_audio_tags, write_audio_cover_from_file, get_disk_free_space, fetch_sgdb_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
