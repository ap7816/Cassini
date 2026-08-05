// Contrôles de sécurité partagés par toutes les commandes Tauri.
//
// Point clé : le système de « capabilities » de Tauri ne protège que les
// commandes des plugins. Les commandes `#[tauri::command]` maison le
// contournent entièrement — c'est ici qu'on rétablit les garde-fous.
//
// Règle générale : toute validation faite côté JavaScript est du confort, pas
// de la sécurité. La webview peut invoquer n'importe quelle commande
// directement, donc chaque entrée est revalidée ici.

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

// ─────────────────────────────────────────────────────────────────────────────
// Racine musique autorisée
// ─────────────────────────────────────────────────────────────────────────────

/// Racine du dossier musique choisi par l'utilisateur. Toutes les opérations
/// destructrices (création, suppression, renommage, déplacement, écriture de
/// tags) doivent rester à l'intérieur.
#[derive(Default)]
pub struct MusicRoot(pub Mutex<Option<PathBuf>>);

/// Répertoire personnel de l'utilisateur (`C:\Users\<nom>`), utilisé comme
/// enveloppe extérieure : rien n'est autorisé en dehors, même comme racine.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
}

/// Dossiers qu'on refuse de prendre comme racine musique : les désigner
/// reviendrait à autoriser la suppression de tout le profil utilisateur.
fn is_forbidden_root(p: &Path) -> bool {
    // Une racine de volume (`C:\`) n'a qu'un seul composant de préfixe/racine
    let depth = p
        .components()
        .filter(|c| matches!(c, Component::Normal(_)))
        .count();
    if depth == 0 {
        return true;
    }

    if let Some(home) = home_dir() {
        if let (Ok(a), Ok(b)) = (p.canonicalize(), home.canonicalize()) {
            if a == b {
                return true;
            }
        }
    }

    // Répertoires système Windows
    let lossy = p.to_string_lossy().to_ascii_lowercase();
    const SYSTEM_DIRS: [&str; 5] = [
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "c:\\users\\public",
    ];
    SYSTEM_DIRS.iter().any(|d| lossy.starts_with(d))
}

/// Normalise un chemin en résolvant `..`, les liens symboliques et la casse.
/// Échoue si le chemin n'existe pas — c'est voulu : on ne valide jamais un
/// chemin qu'on ne peut pas résoudre concrètement.
fn canonical(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Chemin vide".into());
    }
    std::fs::canonicalize(trimmed).map_err(|e| format!("Chemin introuvable : {e}"))
}

/// Variante pour un chemin qui n'existe pas encore (cible d'une création ou
/// d'un déplacement) : on résout le parent, qui lui doit exister.
fn canonical_parent_of(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Chemin vide".into());
    }
    let p = Path::new(trimmed);

    // Un nom de fichier contenant un séparateur ou `..` est rejeté d'office
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        if name == ".." || name == "." {
            return Err("Nom de fichier invalide".into());
        }
    } else {
        return Err("Chemin sans nom de fichier".into());
    }

    let parent = p.parent().ok_or("Chemin sans parent")?;
    let parent_canon = std::fs::canonicalize(parent)
        .map_err(|e| format!("Dossier parent introuvable : {e}"))?;
    Ok(parent_canon.join(p.file_name().unwrap()))
}

/// Enregistre la racine musique après validation. Appelée quand l'utilisateur
/// choisit son dossier via le sélecteur natif.
///
/// La racine peut se trouver sur n'importe quel volume (beaucoup de gens
/// rangent leur musique sur un disque secondaire) ; on refuse en revanche les
/// racines de volume et les dossiers système, qui reviendraient à tout
/// autoriser.
pub fn set_root(state: &MusicRoot, path: &str) -> Result<(), String> {
    let canon = canonical(path)?;

    if !canon.is_dir() {
        return Err("La racine musique doit être un dossier".into());
    }
    if is_forbidden_root(&canon) {
        return Err("Ce dossier ne peut pas servir de racine musique".into());
    }

    *state.0.lock().map_err(|_| "Verrou empoisonné")? = Some(canon);
    Ok(())
}

/// Racine musique courante, si elle est configurée.
pub fn current_root(state: &MusicRoot) -> Option<PathBuf> {
    state.0.lock().ok().and_then(|g| g.clone())
}

/// Vérifie qu'un chemin **existant** est bien sous la racine musique.
/// Renvoie le chemin canonique, seul à utiliser ensuite — jamais l'original,
/// qui pourrait contenir des `..` ou une casse trompeuse.
pub fn within_root(state: &MusicRoot, path: &str) -> Result<PathBuf, String> {
    let root = state
        .0
        .lock()
        .map_err(|_| "Verrou empoisonné")?
        .clone()
        .ok_or("Aucun dossier musique configuré")?;

    let canon = canonical(path)?;
    if !canon.starts_with(&root) {
        return Err("Accès refusé : chemin hors du dossier musique".into());
    }
    // Interdit d'opérer sur la racine elle-même
    if canon == root {
        return Err("Opération interdite sur la racine du dossier musique".into());
    }
    Ok(canon)
}

/// Même contrôle pour une cible qui n'existe pas encore (création, déplacement).
pub fn new_path_within_root(state: &MusicRoot, path: &str) -> Result<PathBuf, String> {
    let root = state
        .0
        .lock()
        .map_err(|_| "Verrou empoisonné")?
        .clone()
        .ok_or("Aucun dossier musique configuré")?;

    let target = canonical_parent_of(path)?;
    if !target.starts_with(&root) {
        return Err("Accès refusé : chemin hors du dossier musique".into());
    }
    Ok(target)
}

/// Contrôle allégé pour les commandes en **lecture seule** (métadonnées,
/// icônes) : le fichier doit exister et rester dans le profil utilisateur, la
/// bibliothèque musicale, ou un emplacement d'installation de jeu légitime.
///
/// `extra_root` sert à autoriser la racine musique quand elle est sur un autre
/// volume que le profil utilisateur (`D:\Musique`, etc.).
pub fn readable_path_with(path: &str, extra_root: Option<PathBuf>) -> Result<PathBuf, String> {
    let canon = canonical(path)?;

    let mut allowed: Vec<PathBuf> = Vec::new();
    if let Some(root) = extra_root {
        allowed.push(root);
    }
    if let Some(home) = home_dir() {
        if let Ok(h) = home.canonicalize() {
            allowed.push(h);
        }
    }
    // Emplacements d'installation de jeux courants
    for dir in [
        "C:\\Program Files (x86)\\Steam",
        "C:\\Program Files\\Epic Games",
        "C:\\Program Files (x86)\\Epic Games",
        "C:\\Program Files (x86)\\Battle.net",
        "C:\\Program Files\\Battle.net",
        "C:\\Riot Games",
        "C:\\Program Files\\Rockstar Games",
        "C:\\Program Files (x86)\\Rockstar Games",
        "C:\\Program Files\\Ubisoft",
        "C:\\Program Files (x86)\\Ubisoft",
        "C:\\SteamLibrary",
        "D:\\SteamLibrary",
        "D:\\Games",
        "E:\\Games",
    ] {
        if let Ok(p) = std::fs::canonicalize(dir) {
            allowed.push(p);
        }
    }

    if allowed.iter().any(|a| canon.starts_with(a)) {
        Ok(canon)
    } else {
        Err("Accès refusé : chemin hors des dossiers autorisés".into())
    }
}

/// Variante sans racine musique, pour les chemins qui n'ont rien à voir
/// avec la bibliothèque audio (icônes d'exécutables, par exemple).
pub fn readable_path(path: &str) -> Result<PathBuf, String> {
    readable_path_with(path, None)
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation des identifiants passés aux lanceurs
// ─────────────────────────────────────────────────────────────────────────────

/// Un identifiant purement numérique (Ubisoft). Indispensable : cette valeur
/// finissait dans une ligne de commande `cmd.exe`, qui reparse `&`, `|` et `^`
/// même après l'échappement appliqué par Rust.
pub fn validate_numeric_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 24 || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identifiant de jeu invalide".into());
    }
    Ok(())
}

/// Identifiant alphanumérique tolérant `-`, `_` et `.` (Battle.net, Riot).
/// Ces valeurs sont passées en argument à un exécutable qui peut les
/// re-découper : on interdit espaces, guillemets et métacaractères.
pub fn validate_token(id: &str, field: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!("{field} invalide"));
    }
    Ok(())
}
