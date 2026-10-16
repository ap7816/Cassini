// Modules de scan par plateforme et utilitaires d'extraction d'icônes
mod battlenet_scan;
mod detached;
mod epic_scan;
mod hoyoplay_scan;
mod hytale_scan;
mod icon_extract;
mod launcher_scan;
mod riot_scan;
mod rockstar_scan;
mod secret_store;
mod security;
mod steam_scan;
mod store_icons;
mod ubisoft_scan;
mod uninstall;
mod watcher;
mod xbox_scan;
use security::MusicRoot;
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

/// Exécute un travail bloquant hors du fil de la fenêtre.
///
/// Une commande Tauri qui n'est pas `async` s'exécute sur le fil principal —
/// celui qui pompe les messages de la fenêtre. Mesuré au retour d'une fenêtre
/// réduite : les neuf scans de launchers y tenaient ce fil quatre secondes et
/// demie, pendant lesquelles la fenêtre ne répondait plus. C'est le gel que
/// l'on voyait ; le moteur web, lui, affichait sa première image sept
/// millisecondes après le retour.
///
/// Le travail part donc sur la réserve de fils prévue pour ce qui bloque. Les
/// scans s'exécutent enfin vraiment en parallèle, et le fil principal ne fait
/// plus qu'attendre leurs réponses.
async fn hors_fil_principal<T, F>(travail: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(travail)
        .await
        .map_err(|e| format!("tâche interrompue : {e}"))
}

// Commande Tauri : retourne les métadonnées complètes d'une piste (avec pochette) pour le mini-lecteur
#[tauri::command]
async fn get_track_metadata(app: tauri::AppHandle, path: String) -> TrackMetadata {
    // La racine est lue ici, avant de partir : elle vit derrière un verrou que
    // l'on ne peut pas emporter ailleurs. Le reste — ouvrir le fichier, décoder
    // ses tags, encoder la pochette — se fait hors du fil de la fenêtre.
    //
    // La poignée de l'application plutôt que l'état lui-même : une commande
    // asynchrone ne peut pas recevoir de référence empruntée sans rendre un
    // Result, et cette fiche-ci n'échoue jamais — elle revient vide.
    use tauri::Manager;
    let music_root = security::current_root(&app.state::<MusicRoot>());
    let chemin = path.clone();
    let lecture = hors_fil_principal(move || match security::readable_path_with(&chemin, music_root) {
        Ok(p) => Some(read_track_metadata(&p.to_string_lossy(), true)),
        // Chemin hors périmètre : on renvoie une fiche vide plutôt qu'une
        // erreur, pour ne pas révéler l'existence ou non du fichier.
        Err(_) => None,
    })
    .await
    .ok()
    .flatten();

    lecture.unwrap_or(TrackMetadata {
        path,
        title: None, artist: None, album: None,
        cover_data_url: None, duration_secs: None,
    })
}

// Commande Tauri : retourne titre/artiste/album/durée pour toutes les pistes sans pochette
// Traitement en parallèle via rayon pour ne pas bloquer le thread UI
#[tauri::command]
async fn get_tracks_basic_batch(app: tauri::AppHandle, paths: Vec<String>) -> Vec<TrackMetadata> {
    use tauri::Manager;
    let music_root = security::current_root(&app.state::<MusicRoot>());
    hors_fil_principal(move || lire_pistes(paths, music_root)).await.unwrap_or_default()
}

/// Titre, artiste, album et durée de chaque piste — sans pochette.
///
/// Rayon répartit le décodage sur tous les cœurs ; encore faut-il que cette
/// répartition n'ait pas lieu sur le fil de la fenêtre, qui attendait la fin.
fn lire_pistes(paths: Vec<String>, music_root: Option<std::path::PathBuf>) -> Vec<TrackMetadata> {
    use rayon::prelude::*;
    paths.par_iter()
        .map(|p| match security::readable_path_with(p, music_root.clone()) {
            Ok(safe) => read_track_metadata(&safe.to_string_lossy(), false),
            Err(_) => TrackMetadata {
                path: p.clone(),
                title: None, artist: None, album: None,
                cover_data_url: None, duration_secs: None,
            },
        })
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
async fn scan_music_folder(path: String) -> Result<Vec<TrackDto>, String> {
    hors_fil_principal(move || parcourir_dossier_musique(path)).await?
}

/// Parcourt un dossier et rend ses pistes, triées par dossier puis par titre.
fn parcourir_dossier_musique(path: String) -> Result<Vec<TrackDto>, String> {
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
async fn get_file_icon_data_url(path: String) -> Result<String, String> {
    hors_fil_principal(move || {
        let safe = security::icon_source_path(&path)?;
        icon_extract::file_icon_png_data_url(&safe.to_string_lossy(), 64)
    })
    .await?
}

// Commande Tauri : ouvre un dossier dans l'explorateur de fichiers natif (cross-platform)
// explorer.exe retombe silencieusement sur Documents si le chemin est invalide,
// donc on normalise les séparateurs et on vérifie l'existence avant de lancer.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Empty path".to_string());
    }

    #[cfg(target_os = "windows")]
    let normalized = trimmed.replace('/', "\\");
    #[cfg(not(target_os = "windows"))]
    let normalized = trimmed.to_string();

    let p = std::path::Path::new(&normalized);

    // Si c'est un fichier (ex: .exe), ouvrir son dossier parent
    let target = if p.is_file() {
        p.parent()
            .ok_or_else(|| format!("No parent directory for {}", normalized))?
            .to_path_buf()
    } else {
        p.to_path_buf()
    };

    if !target.is_dir() {
        return Err(format!("Folder not found: {}", target.display()));
    }

    // canonicalize renvoie un préfixe \\?\ qu'explorer ne comprend pas.
    // `strip_verbatim` le retire correctement, y compris pour les chemins
    // réseau `\\?\UNC\serveur\partage` qu'un simple remplacement mutilerait.
    let canonical = std::fs::canonicalize(&target).unwrap_or(target);
    let final_path = security::strip_verbatim(&canonical);

    detached::open_via_shell(&final_path.to_string_lossy())
}

// Commande Tauri : scanne les jeux Steam installés via les manifestes ACF
#[tauri::command]
async fn scan_steam_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(steam_scan::scan_steam_games).await?
}

// Commande Tauri : temps de jeu Steam, en minutes, par identifiant d'application
#[tauri::command]
async fn steam_playtimes() -> std::collections::HashMap<String, u64> {
    hors_fil_principal(steam_scan::temps_de_jeu).await.unwrap_or_default()
}

// Commande Tauri : scanne les jeux Epic Games via les fichiers .item du launcher
#[tauri::command]
async fn scan_epic_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(epic_scan::scan_epic_games).await?
}

// Commande Tauri : scanne les jeux Battle.net via le registre Windows
#[tauri::command]
async fn scan_battlenet_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(battlenet_scan::scan_battlenet_games).await?
}

// Commande Tauri : scanne les jeux Riot Games via le registre Windows
/// Commande Tauri : détecte Hytale via son dossier de données
#[tauri::command]
async fn scan_hytale_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(hytale_scan::scan_hytale_games).await?
}

#[tauri::command]
async fn scan_riot_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(riot_scan::scan_riot_games).await?
}

// Commande Tauri : jeux HoYoverse installés par HoYoPlay (inventaire du registre)
#[tauri::command]
async fn scan_hoyoplay_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(hoyoplay_scan::scan_hoyoplay_games).await?
}

// Commande Tauri : jeux Xbox / Microsoft Store installés (Game Pass PC)
#[tauri::command]
async fn scan_xbox_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(xbox_scan::scan_xbox_games).await?
}

// Commande Tauri : icône d'une application du Store, demandée au shell.
//
// Sert à la barre des systèmes : un jeu Xbox n'a pas de launcher dont extraire
// une icône, et son application vit dans un dossier illisible.
#[tauri::command]
async fn store_app_icon(prefix: String) -> Option<String> {
    if prefix.is_empty()
        || prefix.len() > 128
        || !prefix.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return None;
    }
    // Le shell est parcouru entrée par entrée jusqu'à trouver l'application :
    // long, et sans rapport avec ce que la fenêtre a à faire pendant ce temps.
    hors_fil_principal(move || {
        let cible = store_icons::cible_application(&prefix)?;
        store_icons::icone_application(&cible, 64).ok()
    })
    .await
    .ok()
    .flatten()
}

// Commande Tauri : jaquette d'un jeu du Store, tirée de son propre logo
#[tauri::command]
async fn xbox_cover(path: String) -> Option<String> {
    hors_fil_principal(move || xbox_scan::cover_xbox(&path)).await.ok().flatten()
}

// Commande Tauri : scanne les jeux Rockstar Games via le registre Windows
#[tauri::command]
async fn scan_rockstar_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(rockstar_scan::scan_rockstar_games).await?
}

// Commande Tauri : scanne les jeux Ubisoft Connect via le registre Windows
#[tauri::command]
async fn scan_ubisoft_games() -> Result<Vec<steam_scan::GameDto>, String> {
    hors_fil_principal(ubisoft_scan::scan_ubisoft_games).await?
}

// Commande Tauri : détecte les launchers installés (Steam, Epic, Battle.net, Riot, Rockstar, Ubisoft)
#[tauri::command]
async fn scan_launchers() -> Result<Vec<launcher_scan::LauncherDto>, String> {
    hors_fil_principal(launcher_scan::scan_launchers).await?
}

// Commande Tauri : liste tous les sous-dossiers d'un dossier racine (chemins relatifs)
#[tauri::command]
async fn list_music_dirs(root: String) -> Result<Vec<String>, String> {
    hors_fil_principal(move || lister_dossiers_musique(root)).await?
}

/// Sous-dossiers d'un dossier racine, en chemins relatifs.
fn lister_dossiers_musique(root: String) -> Result<Vec<String>, String> {
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

// Commande Tauri : enregistre la racine du dossier musique après validation.
// Toutes les commandes destructrices ci-dessous s'y réfèrent — sans racine
// configurée, elles refusent de s'exécuter.
#[tauri::command]
fn set_music_root(root: tauri::State<'_, MusicRoot>, path: String) -> Result<(), String> {
    security::set_root(&root, &path)
}

// Commande Tauri : crée un dossier musical (et ses parents si nécessaire)
#[tauri::command]
fn create_music_folder(root: tauri::State<'_, MusicRoot>, path: String) -> Result<(), String> {
    let target = security::new_path_within_root(&root, &path)?;
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())
}

// Commande Tauri : supprime récursivement un dossier musical et tout son contenu
#[tauri::command]
fn delete_music_folder(root: tauri::State<'_, MusicRoot>, path: String) -> Result<(), String> {
    let target = security::within_root(&root, &path)?;
    if !target.is_dir() {
        return Err("La cible n'est pas un dossier".into());
    }
    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

// Commande Tauri : renomme un dossier musical en vérifiant l'absence de conflit de noms
#[tauri::command]
fn rename_music_folder(
    root: tauri::State<'_, MusicRoot>,
    path: String,
    new_name: String,
) -> Result<(), String> {
    let src = security::within_root(&root, &path)?;

    // Le nouveau nom ne doit pas pouvoir remonter l'arborescence
    if new_name.trim().is_empty()
        || new_name.contains(['/', '\\', ':'])
        || new_name.contains("..")
    {
        return Err("Nom de dossier invalide".into());
    }

    let parent = src.parent().ok_or_else(|| "Dossier sans parent".to_string())?;
    let dst = parent.join(new_name.trim());
    if dst.exists() {
        return Err(format!("Un dossier « {} » existe déjà", new_name));
    }
    std::fs::rename(&src, &dst).map_err(|e| e.to_string())
}

// Commande Tauri : déplace un fichier audio vers un autre dossier, renomme si conflit de noms
#[tauri::command]
fn move_music_file(
    root: tauri::State<'_, MusicRoot>,
    src: String,
    dst_folder: String,
) -> Result<(), String> {
    let src_path = security::within_root(&root, &src)?;
    let dst_dir = security::new_path_within_root(&root, &dst_folder)?;

    let filename = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Fichier source invalide".to_string())?;

    std::fs::create_dir_all(&dst_dir).map_err(|e| e.to_string())?;

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

    std::fs::rename(&src_path, &dst_path).map_err(|e| e.to_string())
}

// Chemin de la clé Run du registre, et nom de la valeur qu'on y écrit.
//
// La valeur portait « ArcHive » avant le renommage de l'application. Deux
// raisons de ne pas se contenter d'écrire le nouveau nom : l'ancienne valeur
// désigne un exécutable qui n'existe plus après la mise à jour — Windows
// échouerait silencieusement à le lancer — et les deux coexisteraient, donc
// l'application démarrerait deux fois. On la déplace au lieu de l'ignorer.
#[cfg(target_os = "windows")]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const AUTOSTART_VALUE: &str = "Cassini";
#[cfg(target_os = "windows")]
const AUTOSTART_LEGACY: &str = "ArcHive";

/// Déplace l'entrée de démarrage automatique vers le nouveau nom.
///
/// Appelée au lancement : sans elle, une installation qui démarrait avec
/// Windows cesserait de le faire sans rien dire, et l'utilisateur devrait
/// rouvrir les paramètres pour s'en apercevoir.
#[cfg(target_os = "windows")]
fn migrate_autostart() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok((run, _)) = hkcu.create_subkey(RUN_KEY) else {
        return;
    };

    // Rien à déplacer si l'ancienne valeur est absente.
    if run.get_value::<String, _>(AUTOSTART_LEGACY).is_err() {
        return;
    }

    // Le chemin vient de l'exécutable courant, non de l'ancienne valeur :
    // celle-ci désigne encore ArcHive.exe, que la mise à jour a remplacé.
    // Sans chemin fiable, on préfère laisser l'ancienne entrée que retirer le
    // démarrage automatique de l'utilisateur.
    if let Ok(exe) = std::env::current_exe() {
        let path = exe.to_string_lossy().to_string();
        if run.set_value(AUTOSTART_VALUE, &path).is_ok() {
            let _ = run.delete_value(AUTOSTART_LEGACY);
        }
    }
}

// Commande Tauri : vérifie si Cassini est configuré pour démarrer avec Windows
#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey(RUN_KEY) {
            // L'ancien nom compte aussi : la migration peut n'avoir pas eu
            // lieu, et l'utilisateur a bel et bien activé l'option.
            Ok(key) => {
                key.get_value::<String, _>(AUTOSTART_VALUE).is_ok()
                    || key.get_value::<String, _>(AUTOSTART_LEGACY).is_ok()
            }
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

// Commande Tauri : active ou désactive le démarrage automatique de Cassini via la clé Run du registre
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu.create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            run.set_value(AUTOSTART_VALUE, &exe_path)
                .map_err(|e| e.to_string())?;
        } else {
            let _ = run.delete_value(AUTOSTART_VALUE);
        }
        // Dans les deux cas l'ancienne valeur disparaît : activer ne doit pas
        // laisser deux démarrages, désactiver doit tout retirer.
        let _ = run.delete_value(AUTOSTART_LEGACY);
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = enabled; }
    Ok(())
}

// Commande Tauri : lance un jeu Battle.net via l'argument --exec=launch de Battle.net.exe
#[tauri::command]
fn launch_battlenet_game(uid: String) -> Result<(), String> {
    // L'uid est concaténé dans un argument que Battle.net re-découpe : on
    // interdit espaces, guillemets et métacaractères.
    security::validate_token(&uid, "Identifiant Battle.net")?;

    let candidates = [
        r"C:\Program Files (x86)\Battle.net\Battle.net.exe",
        r"C:\Program Files\Battle.net\Battle.net.exe",
    ];

    let exe = candidates
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .ok_or_else(|| "Battle.net.exe introuvable".to_string())?;

    // Détaché : sinon Battle.net se ferme en même temps que Cassini
    detached::spawn_detached(exe, &[&format!("--exec=launch {uid}")])
}

// Commande Tauri : lance un jeu Riot via RiotClientServices.exe avec le product ID et la patchline live
#[tauri::command]
fn launch_riot_game(product: String) -> Result<(), String> {
    security::validate_token(&product, "Produit Riot")?;

    let exe = riot_scan::find_riot_client_exe()
        .ok_or_else(|| "RiotClientServices.exe introuvable".to_string())?;

    detached::spawn_detached(
        &exe.to_string_lossy(),
        &[
            &format!("--launch-product={}", product),
            "--launch-patchline=live",
        ],
    )
}

// Commande Tauri : lance un jeu Ubisoft via le protocole uplay://
//
// Passait auparavant par `cmd /c start`, ce qui était injectable : cmd.exe
// reparse sa ligne de commande et traite `&`, `|` et `^` comme des
// séparateurs, y compris après l'échappement MSVCRT appliqué par Rust.
// On valide donc l'identifiant, puis on appelle directement ShellExecuteW —
// aucun interpréteur de commandes n'intervient.
#[tauri::command]
fn launch_ubisoft_game(game_id: String) -> Result<(), String> {
    security::validate_numeric_id(&game_id)?;
    detached::open_via_shell(&format!("uplay://launch/{}/0", game_id))
}

// Protocoles de lancement acceptés par `launch_target`. Liste identique à
// celle du frontend, revalidée ici : une commande Tauri est appelable
// directement depuis la webview, la validation JS n'est pas une barrière.
const LAUNCH_SCHEMES: [&str; 5] = [
    "steam://",
    "com.epicgames.launcher://",
    "battlenet://",
    "riotclient://",
    "uplay://",
];

// Commande Tauri : ouvre une cible de lancement (URL de protocole ou
// exécutable local) de façon totalement détachée.
//
// Remplace `openUrl`/`openPath` du plugin opener, qui lançaient le programme
// depuis notre propre processus : celui-ci héritait alors du job Windows
// de Cassini et se fermait avec lui — c'est ce qui éteignait Steam.
#[tauri::command]
fn launch_target(target: String) -> Result<(), String> {
    let t = target.trim();
    if t.is_empty() || t.len() > 2048 {
        return Err("Cible de lancement invalide".into());
    }
    // Les caractères de contrôle n'ont rien à faire dans une cible
    if t.chars().any(|c| c.is_control()) {
        return Err("Cible de lancement invalide".into());
    }

    let lower = t.to_ascii_lowercase();
    let is_scheme = LAUNCH_SCHEMES.iter().any(|s| lower.starts_with(s));

    // Application de paquet (Xbox, Microsoft Store) : ni URL ni chemin, mais
    // une adresse du shell. Sa forme est vérifiée caractère par caractère.
    if xbox_scan::est_cible_appsfolder(t) {
        return detached::open_via_shell(t);
    }

    if !is_scheme {
        // Chemin local uniquement : on refuse les chemins UNC (\\serveur\...),
        // qui feraient exécuter un binaire hébergé à distance.
        let local = t.len() > 2
            && t.as_bytes()[1] == b':'
            && (t.as_bytes()[2] == b'\\' || t.as_bytes()[2] == b'/')
            && t.as_bytes()[0].is_ascii_alphabetic();

        if !local || t.contains("..") {
            return Err("Cible de lancement non autorisée".into());
        }
        if !std::path::Path::new(t).exists() {
            return Err("Fichier introuvable".into());
        }
    }

    detached::open_via_shell(t)
}

// Commande Tauri : le désinstalleur officiel d'un jeu, s'il existe.
//
// Sert à décider ce qu'on propose et ce qu'on annonce avant d'agir : sans
// désinstalleur trouvé, l'interface ne montre pas de bouton qui échouerait.
#[tauri::command]
async fn find_uninstaller(title: String, path: Option<String>) -> Option<uninstall::Desinstalleur> {
    hors_fil_principal(move || uninstall::trouver(&title, path.as_deref()))
        .await
        .ok()
        .flatten()
}

// Commande Tauri : lance la désinstallation d'un jeu.
//
// Cassini ne supprime rien lui-même (voir `uninstall.rs`). Steam passe par son
// propre protocole, qui ouvre sa boîte de dialogue ; les autres jeux par le
// désinstalleur que Windows leur connaît. Dans les deux cas, c'est ce
// programme qui demande la confirmation finale et fait le travail.
//
// Renvoie le nom de ce qui a été lancé, pour que l'interface puisse le dire.
#[tauri::command]
fn uninstall_game(
    platform: String,
    id: String,
    title: String,
    path: Option<String>,
) -> Result<String, String> {
    if platform == "Steam" {
        if let Some(appid) = id.strip_prefix("steam-") {
            if !appid.is_empty() && appid.chars().all(|c| c.is_ascii_digit()) {
                detached::open_via_shell(&format!("steam://uninstall/{appid}"))?;
                return Ok("Steam".to_string());
            }
        }
    }

    let Some(d) = uninstall::trouver(&title, path.as_deref()) else {
        return Err("Aucun désinstalleur trouvé pour ce jeu".to_string());
    };
    let args: Vec<&str> = d.arguments.iter().map(String::as_str).collect();
    detached::spawn_avec_elevation(&d.programme, &args)?;
    Ok(d.nom)
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
        .header(
            "User-Agent",
            // Tiré de Cargo : écrit à la main, il retardait de deux versions.
            concat!(
                "Cassini/",
                env!("CARGO_PKG_VERSION"),
                " (desktop; noreply@example.com)"
            ),
        )
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
    root: tauri::State<'_, MusicRoot>,
    path: String,
    artist: Option<String>,
    album: Option<String>,
    cover_url: Option<String>,
) -> Result<(), String> {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use lofty::picture::{Picture, PictureType, MimeType};
    use lofty::config::WriteOptions;

    // Écriture sur disque : confinée au dossier musique de l'utilisateur
    let path = security::within_root(&root, &path)?
        .to_string_lossy()
        .to_string();

    // La pochette est téléchargée depuis une URL fournie par le frontend :
    // on n'autorise que HTTPS pour éviter de transformer cette commande en
    // outil de requête arbitraire (fichiers locaux, réseau interne).
    if let Some(ref url) = cover_url {
        if !url.starts_with("https://") {
            return Err("L'URL de pochette doit être en HTTPS".into());
        }
    }

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
fn write_audio_cover_from_file(
    root: tauri::State<'_, MusicRoot>,
    audio_path: String,
    image_path: String,
) -> Result<(), String> {
    use lofty::prelude::*;
    use lofty::probe::Probe;
    use lofty::picture::{Picture, PictureType, MimeType};
    use lofty::config::WriteOptions;

    // Le fichier modifié doit être dans le dossier musique ; l'image source
    // peut venir d'ailleurs mais reste cantonnée aux dossiers lisibles.
    let audio_path = security::within_root(&root, &audio_path)?
        .to_string_lossy()
        .to_string();
    let image_path = security::readable_path_with(&image_path, security::current_root(&root))?
        .to_string_lossy()
        .to_string();

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
//
// `Ok(None)` veut dire : le fournisseur a répondu, et il n'a pas d'image.
// `Err` veut dire : on n'a pas pu le joindre. La distinction compte côté
// interface, qui retient la première comme « ce jeu n'a pas de jaquette » et
// doit au contraire **ne rien retenir** de la seconde — sans quoi une coupure
// de réseau marque toute la bibliothèque comme dépourvue d'images jusqu'au
// prochain lancement.
async fn sgdb_search_and_fetch(
    client: &reqwest::Client,
    title: &str,
    api_key: &str,
) -> Result<Option<String>, String> {
    let encoded = urlencoding::encode(title);
    let search_url = format!("https://www.steamgriddb.com/api/v2/search/autocomplete/{}", encoded);

    let resp = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("recherche injoignable : {e}"))?;

    // Un statut d'erreur vient du service, pas du jeu : clé refusée, quota,
    // panne. Rien à retenir non plus.
    if !resp.status().is_success() {
        eprintln!("[sgdb] search HTTP {} for «{}»", resp.status(), title);
        return Err(format!("recherche HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("réponse illisible : {e}"))?;
    let Some(results) = data["data"].as_array() else {
        return Err("réponse sans tableau de résultats".to_string());
    };

    if results.is_empty() {
        eprintln!("[sgdb] «{}» → no results", title);
        return Ok(None);
    }

    let first = &results[0];
    let Some(game_id) = first["id"].as_u64() else {
        return Err("résultat sans identifiant".to_string());
    };
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
        .map_err(|e| format!("bannières injoignables : {e}"))?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("réponse illisible : {e}"))?;
        if let Some(url) = data["data"].as_array().and_then(|a| a.first()).and_then(|g| g["url"].as_str()) {
            eprintln!("[sgdb] «{}» → image found ✓", title);
            return Ok(Some(url.to_string()));
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
        .map_err(|e| format!("grilles injoignables : {e}"))?;

    if !resp2.status().is_success() {
        eprintln!("[sgdb] grids HTTP {} for «{}»", resp2.status(), title);
        return Err(format!("grilles HTTP {}", resp2.status()));
    }

    let data2: serde_json::Value = resp2
        .json()
        .await
        .map_err(|e| format!("réponse illisible : {e}"))?;
    let url = data2["data"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|g| g["url"].as_str())
        .map(|s| s.to_string());

    if url.is_some() {
        eprintln!("[sgdb] «{}» → image found (non-standard size) ✓", title);
    } else {
        eprintln!("[sgdb] «{}» → matched but no grid image", title);
    }

    Ok(url)
}

// Commande Tauri : télécharge une image et la renvoie en data-URL base64.
//
// Passer par Rust contourne le CORS : `THREE.TextureLoader` exige un en-tête
// Access-Control-Allow-Origin que tous les CDN n'envoient pas (SteamGridDB
// notamment), ce qui faisait échouer silencieusement le chargement des
// textures. Un data-URL est de plus non « taintant », donc `getImageData`
// reste utilisable pour analyser les couleurs de la jaquette.
#[tauri::command]
async fn fetch_image_base64(url: String) -> Result<String, String> {
    use base64::Engine;

    // Seul HTTPS est accepté : cette commande ne doit pas devenir un moyen de
    // lire des fichiers locaux ou de sonder le réseau interne.
    if !url.starts_with("https://") {
        return Err("Seules les URLs HTTPS sont acceptées".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .to_string();

    if !mime.starts_with("image/") {
        return Err("La réponse n'est pas une image".into());
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    // Garde-fou mémoire : une jaquette dépasse rarement quelques centaines de Ko
    if bytes.is_empty() || bytes.len() > 12 * 1024 * 1024 {
        return Err("Taille d'image invalide".into());
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// Commande Tauri : enregistre la clé SteamGridDB dans le coffre système.
// La clé n'est jamais relue par le frontend — voir `has_sgdb_key`.
#[tauri::command]
fn set_sgdb_key(key: String) -> Result<(), String> {
    secret_store::set_key(&key)
}

// Commande Tauri : indique si une clé est configurée, sans jamais la révéler.
#[tauri::command]
fn has_sgdb_key() -> bool {
    secret_store::has_key()
}

// Commande Tauri : y a-t-il vraiment un réseau ?
//
// `navigator.onLine`, côté interface, ne sert à rien ici : WebView2 le laisse à
// `true` quand on coupe le wifi, et n'émet pas davantage d'événement. C'est le
// défaut qu'on répare — l'application ne voyait pas la coupure, et ne voyait
// donc pas non plus le retour.
//
// On interroge l'adresse que Windows interroge lui-même pour allumer son propre
// voyant « pas d'Internet ». Elle rend vingt-deux octets, et le **contenu**
// compte autant que le statut : un portail captif — wifi d'hôtel, d'aéroport —
// répond 200 avec sa propre page, et c'est bien une absence d'Internet pour qui
// cherche une jaquette.
#[tauri::command]
async fn reseau_joignable() -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    match client
        .get("http://www.msftconnecttest.com/connecttest.txt")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.text().await {
            Ok(corps) => corps.contains("Microsoft Connect Test"),
            Err(_) => false,
        },
        _ => false,
    }
}

// Commande Tauri : recherche une jaquette sur SteamGridDB.
// La clé API est lue depuis le coffre au moment de l'appel : elle ne transite
// plus par le JavaScript et n'est jamais écrite en clair sur le disque.
#[tauri::command]
async fn fetch_sgdb_image(title: String) -> Result<Option<String>, String> {
    let api_key = match secret_store::get_key() {
        Some(k) => k,
        None => return Ok(None),
    };

    let client = reqwest::Client::new();

    // L'erreur remonte telle quelle : le frontend doit pouvoir distinguer
    // « pas d'image » de « pas de réseau ».
    if let Some(url) = sgdb_search_and_fetch(&client, &title, &api_key).await? {
        return Ok(Some(url));
    }

    // 2ème tentative sans les chiffres finaux (ex: "Call of Duty 2" → "Call of Duty")
    let stripped = title.trim_end_matches(|c: char| c.is_ascii_digit()).trim_end();
    if !stripped.is_empty() && stripped != title.as_str() {
        eprintln!("[sgdb] «{}» → retrying as «{}»", title, stripped);
        if let Some(url) = sgdb_search_and_fetch(&client, stripped, &api_key).await? {
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
async fn get_disk_free_space() -> Result<DiskInfo, String> {
    hors_fil_principal(espace_disque).await?
}

/// Espace libre et total du disque système.
fn espace_disque() -> Result<DiskInfo, String> {
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

/// Entrées du menu de la zone de notification.
///
/// Gardées pour être renommées : le menu est construit au démarrage, avant que
/// l'interface ait chargé la langue choisie. Les libellés viennent ensuite de
/// l'interface elle-même, qui tient toutes les traductions — ce code n'en garde
/// aucune copie, seulement les libellés français du tout premier affichage.
struct TrayLabels {
    open: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
    musique: tauri::menu::MenuItem<tauri::Wry>,
    arret: tauri::menu::MenuItem<tauri::Wry>,
}

/// Renomme les entrées du menu de la zone de notification dans la langue de
/// l'interface.
#[tauri::command]
fn set_tray_labels(
    tray: tauri::State<'_, TrayLabels>,
    open: String,
    quit: String,
) -> Result<(), String> {
    tray.open.set_text(open).map_err(|e| e.to_string())?;
    tray.quit.set_text(quit).map_err(|e| e.to_string())
}

/// Met à jour les entrées « musique » du menu de la zone de notification.
///
/// Quand la fenêtre est réduite, ce menu est le seul endroit où l'on peut
/// encore mettre le lecteur en pause : la musique continue, elle, puisque
/// c'est ce qu'on attend d'un lecteur qu'on laisse tourner en fond.
///
/// L'état du lecteur ne vit que dans l'interface : les entrées sont grisées
/// tant qu'aucune piste n'est chargée, et le libellé de la bascule — mettre en
/// pause, ou reprendre — vient de là aussi, traduit.
#[tauri::command]
fn set_tray_music(
    tray: tauri::State<'_, TrayLabels>,
    active: bool,
    bascule: String,
    arret: String,
) -> Result<(), String> {
    tray.musique.set_text(bascule).map_err(|e| e.to_string())?;
    tray.musique.set_enabled(active).map_err(|e| e.to_string())?;
    tray.arret.set_text(arret).map_err(|e| e.to_string())?;
    tray.arret.set_enabled(active).map_err(|e| e.to_string())
}

/// État de la fenêtre annoncé à l'interface.
#[derive(Clone, serde::Serialize)]
struct Plan {
    masquee: bool,
}

/// Le verdict a-t-il changé depuis la dernière annonce ?
///
/// Deux appelants pour un seul état : la surveillance périodique et, si elle
/// arrive la première, la réaction aux événements de fenêtre.
fn plan_a_change(masquee: bool) -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    static DERNIER: AtomicBool = AtomicBool::new(false);
    DERNIER.swap(masquee, Ordering::Relaxed) != masquee
}

/// Annonce que la fenêtre vient de quitter l'écran, ou d'y revenir.
///
/// Rien n'est envoyé tant que le verdict ne change pas : redimensionner une
/// fenêtre à la souris émet des dizaines d'événements par seconde, qui diraient
/// tous la même chose.
fn annoncer_plan<R: tauri::Runtime, E: tauri::Emitter<R>>(emetteur: &E, masquee: bool) {
    if !plan_a_change(masquee) {
        return;
    }
    // Tracé dans le journal : c'est par lui qu'on saura, sur une machine qui
    // n'est pas la nôtre, si la fenêtre a bien été vue partir.
    tauri_plugin_log::log::info!(
        "fenêtre {}",
        if masquee { "hors de vue" } else { "à l'écran" }
    );
    let _ = emetteur.emit("fenetre-plan", Plan { masquee });
}

/// Surveille l'état de la fenêtre et le fait savoir à l'interface.
///
/// Une boucle, et non les événements de fenêtre : ceux-ci signalent bien la
/// réduction, mais pas le retour — mesuré, une fenêtre restaurée n'émet ni
/// redimensionnement ni changement de focus que l'on puisse attendre, et
/// l'interface resterait persuadée que personne ne la regarde. Le moteur web,
/// lui, ne signale pas toujours la réduction.
///
/// Deux appels Win32 deux fois par seconde : le prix est négligeable, et il
/// achète la seule réponse qui ne se trompe pas. C'est ce qui coupe la musique
/// d'ambiance quand on réduit la fenêtre, et la ramène quand on revient.
fn surveiller_plan(app: tauri::AppHandle) {
    use tauri::Manager;

    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let Some(fenetre) = app.get_webview_window("main") else { continue };
        let Some(masquee) = etat_de_la_fenetre(&fenetre) else {
            // La fenêtre ne répond plus : l'application se ferme.
            return;
        };
        annoncer_plan(&fenetre, masquee);
    });
}

/// La fenêtre est-elle hors de vue ? Réduite, ou simplement plus affichée.
///
/// Sous Windows, la question est posée à Windows directement, par le descripteur
/// de la fenêtre. `is_minimized()` et `is_visible()` de Tauri, eux, font la
/// navette avec le fil principal et attendent leur tour : deux allers-retours
/// deux fois par seconde sur le fil que l'on cherche justement à ne pas
/// encombrer — et une réponse qui n'arrive plus dès qu'il est occupé.
fn etat_de_la_fenetre(fenetre: &tauri::WebviewWindow) -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{IsIconic, IsWindowVisible};

        // Le descripteur passe par son entier : Tauri et cette caisse peuvent
        // suivre deux versions différentes de la bibliothèque Windows, dont les
        // types ne se mélangent pas.
        let brut = fenetre.hwnd().ok()?.0 as isize;
        let handle = HWND(brut as *mut std::ffi::c_void);
        Some(unsafe { IsIconic(handle).as_bool() || !IsWindowVisible(handle).as_bool() })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Some(fenetre.is_minimized().ok()? || !fenetre.is_visible().ok()?)
    }
}

// Point d'entrée de l'application Tauri : configure les plugins, la tray icon et les commandes disponibles
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Réclame la carte graphique dédiée, avant que le moteur web ne démarre.
    //
    // Mesuré sur un portable à deux cartes : la scène tournait sur le circuit
    // intégré, et le ciel calculé y coûtait trois millisecondes par image —
    // plus que tout le reste réuni. La préférence posée côté WebGL
    // (`powerPreference: 'high-performance'`) n'y changeait rien : c'est le
    // moteur qui choisit la carte, avant même que la page existe, et il ne la
    // consulte pas. Cet indicateur-là, lui, est lu à son démarrage.
    //
    // Sans seconde carte, l'indicateur est sans effet.
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--force_high_performance_gpu");

    tauri::Builder::default()
        // Instance unique — enregistré en premier, avant tout autre plugin.
        //
        // C'est une exigence du plugin et non une préférence de style : il doit
        // pouvoir constater qu'une instance tourne déjà et arrêter le second
        // processus avant que quoi que ce soit d'autre ne s'initialise. Placé
        // plus bas, on paierait le démarrage complet — scan des launchers,
        // ouverture du store, icône de notification — juste avant de quitter.
        //
        // Le rappel s'exécute dans l'instance *déjà en place*, quand une
        // seconde est lancée. Plutôt que d'ignorer la demande, on ramène la
        // fenêtre : c'est ce que l'utilisateur voulait en relançant. `show`
        // puis `unminimize` couvrent les deux façons dont elle peut être
        // absente de l'écran — repliée dans la zone de notification, ou
        // réduite dans la barre des tâches — et `set_focus` la met devant.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        // Racine musique autorisée — partagée par les commandes fichier
        .manage(MusicRoot::default())
        .setup(|app| {
            // Déplace l'entrée de démarrage automatique héritée du nom précédent.
            #[cfg(target_os = "windows")]
            migrate_autostart();

            // Prévient l'interface dès qu'un jeu s'installe ou se désinstalle.
            // Les dossiers sont cherchés hors du fil principal : trouver Steam
            // lit le registre et un fichier, rien qui doive retarder la fenêtre.
            {
                let app = app.handle().clone();
                std::thread::spawn(move || {
                    let mut dossiers = steam_scan::dossiers_steamapps();
                    dossiers.extend(epic_scan::find_manifests_path());
                    dossiers.extend(hoyoplay_scan::dossiers_jeux());
                    dossiers.extend(xbox_scan::dossiers_xbox());
                    watcher::demarrer(app, dossiers);
                });
            }

            // Dit à l'interface quand la fenêtre quitte l'écran, et quand elle
            // revient — de quoi taire la musique d'ambiance entre les deux.
            surveiller_plan(app.handle().clone());

            #[cfg(desktop)]
            {
                // Configure l'icône de la zone de notification avec un menu contextuel Ouvrir/Quitter
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::{Emitter, Manager};
                let show_i = MenuItem::with_id(app, "show", "Ouvrir Cassini", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                // Commandes du lecteur, la fenêtre fût-elle réduite. Grisées
                // tant que l'interface n'a pas dit qu'une piste est chargée.
                let music_i =
                    MenuItem::with_id(app, "music_toggle", "Musique en pause", false, None::<&str>)?;
                let stop_i =
                    MenuItem::with_id(app, "music_stop", "Arrêter la musique", false, None::<&str>)?;
                // Deux séparateurs distincts : un même élément de menu ne peut
                // pas figurer deux fois dans le même menu.
                let haut = PredefinedMenuItem::separator(app)?;
                let bas = PredefinedMenuItem::separator(app)?;
                let menu =
                    Menu::with_items(app, &[&show_i, &haut, &music_i, &stop_i, &bas, &quit_i])?;
                // Gardées pour être traduites dès que l'interface connaît sa langue.
                app.manage(TrayLabels {
                    open: show_i.clone(),
                    quit: quit_i.clone(),
                    musique: music_i.clone(),
                    arret: stop_i.clone(),
                });
                TrayIconBuilder::new()
                    .menu(&menu)
                    .icon(app.default_window_icon().unwrap().clone())
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        // Le lecteur vit dans l'interface : on lui transmet la
                        // demande plutôt que de toucher au son d'ici.
                        "music_toggle" => {
                            let _ = app.emit("commande-musique", "basculer");
                        }
                        "music_stop" => {
                            let _ = app.emit("commande-musique", "arreter");
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
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        // Réduire est un redimensionnement : autant le dire tout de suite,
        // sans attendre le prochain tour de `surveiller_plan`. Le retour de la
        // fenêtre, lui, n'émet rien de fiable — c'est la surveillance qui le
        // voit.
        .on_window_event(|fenetre, evenement| {
            if let tauri::WindowEvent::Resized(_) = evenement {
                let masquee = fenetre.is_minimized().unwrap_or(false)
                    || !fenetre.is_visible().unwrap_or(true);
                annoncer_plan(fenetre, masquee);
            }
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
        .invoke_handler(tauri::generate_handler![
            scan_steam_games, steam_playtimes, scan_epic_games, scan_battlenet_games,
            scan_hytale_games,
            scan_riot_games, scan_rockstar_games, scan_ubisoft_games, scan_hoyoplay_games,
            scan_xbox_games, xbox_cover, store_app_icon,
            scan_launchers, get_file_icon_data_url, open_folder,
            launch_battlenet_game, launch_riot_game, launch_ubisoft_game,
            launch_target,
            find_uninstaller,
            uninstall_game,
            scan_music_folder, get_autostart, set_autostart, list_music_dirs,
            set_music_root,
            create_music_folder, delete_music_folder, rename_music_folder,
            move_music_file, get_track_metadata, get_tracks_basic_batch,
            search_itunes, write_audio_tags, write_audio_cover_from_file,
            get_disk_free_space,
            fetch_sgdb_image, set_sgdb_key, has_sgdb_key, fetch_image_base64,
            reseau_joignable,
            set_tray_labels, set_tray_music
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
