//! Détection des jeux HoYoPlay (HoYoverse : Genshin Impact, Honkai: Star Rail,
//! Zenless Zone Zero, Honkai Impact 3rd).
//!
//! HoYoPlay tient un inventaire dans la base de registre de l'utilisateur, une
//! sous-clé par jeu, nommée d'après son code (`hk4e_global`, `nap_global`…) :
//!
//! ```text
//! HKCU\Software\Cognosphere\HYP\1_0\             version internationale
//!   InstallPath        dossier du lanceur (launcher.exe)
//!   nap_global\
//!     GameInstallPath  dossier du jeu
//! HKCU\Software\miHoYo\HYP\1_1\                  version chinoise, même forme
//! ```
//!
//! La branche `standalone` décrit les copies distribuées par d'autres
//! boutiques — Epic, par exemple — que leur propre scanner rapporte déjà.
//!
//! Une sous-clé existe dès le début du téléchargement : c'est la présence de
//! l'exécutable, et non celle de la clé, qui dit qu'un jeu est jouable.

use crate::steam_scan::{dir_size, GameDto};
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

/// Racines de l'inventaire, sous `HKCU\Software`.
const RACINES: [&str; 2] = [r"Software\Cognosphere\HYP", r"Software\miHoYo\HYP"];

/// Jeux connus : préfixe du code, titre, exécutables possibles.
///
/// Le titre ne sert qu'à défaut de celui qu'inscrit HoYoPlay dans la liste des
/// programmes installés, qui est le nom officiel dans la langue du lanceur.
const JEUX: [(&str, &str, &[&str]); 4] = [
    ("hk4e", "Genshin Impact", &["GenshinImpact.exe", "YuanShen.exe"]),
    ("hkrpg", "Honkai: Star Rail", &["StarRail.exe"]),
    ("nap", "Zenless Zone Zero", &["ZenlessZoneZero.exe"]),
    ("bh3", "Honkai Impact 3rd", &["BH3.exe"]),
];

/// Exécutables qu'on trouve à côté d'un jeu et qui n'en sont pas.
const PAS_LE_JEU: [&str; 3] = ["unitycrashhandler", "crashreport", "uninstall"];

fn connu(code: &str) -> Option<&'static (&'static str, &'static str, &'static [&'static str])> {
    let prefixe = code.split('_').next().unwrap_or(code);
    JEUX.iter().find(|(p, _, _)| p.eq_ignore_ascii_case(prefixe))
}

/// Un code de jeu est un identifiant simple : il sert à composer un
/// identifiant de bibliothèque, et rien d'autre ne doit y passer.
fn code_valide(code: &str) -> bool {
    !code.is_empty() && code.len() <= 64 && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// L'exécutable du jeu dans son dossier, s'il y est.
///
/// Les noms connus d'abord ; pour un jeu que ce module ne connaît pas encore,
/// le seul exécutable de la racine qui ne soit pas un utilitaire.
pub fn trouver_exe(dossier: &Path, code: &str) -> Option<PathBuf> {
    if let Some((_, _, noms)) = connu(code) {
        return noms.iter().map(|n| dossier.join(n)).find(|p| p.is_file());
    }
    let candidats: Vec<PathBuf> = std::fs::read_dir(dossier)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let nom = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
            p.is_file() && nom.ends_with(".exe") && !PAS_LE_JEU.iter().any(|x| nom.contains(x))
        })
        .collect();
    // Plusieurs candidats : on ne devine pas, un mauvais choix lancerait
    // n'importe quoi.
    (candidats.len() == 1).then(|| candidats[0].clone())
}

/// Nom affiché qu'HoYoPlay a inscrit pour ce jeu dans la liste des programmes
/// installés — reconnu à sa commande `--uninstall_game=<code>`.
fn titre_inscrit(code: &str) -> Option<String> {
    let marque = format!("--uninstall_game={}", code.to_ascii_lowercase());
    for racine in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let hive = RegKey::predef(racine);
        for chemin in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            let Ok(liste) = hive.open_subkey(chemin) else { continue };
            for nom in liste.enum_keys().flatten() {
                let Ok(cle) = liste.open_subkey(&nom) else { continue };
                let commande: String = cle.get_value("UninstallString").unwrap_or_default();
                if !commande.to_ascii_lowercase().contains(&marque) {
                    continue;
                }
                let affiche: String = cle.get_value("DisplayName").unwrap_or_default();
                let affiche = affiche.trim();
                if !affiche.is_empty() {
                    return Some(affiche.to_string());
                }
            }
        }
    }
    None
}

/// Les jeux inscrits par HoYoPlay : code et dossier d'installation.
fn inscrits() -> Vec<(String, PathBuf)> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut sortie: Vec<(String, PathBuf)> = Vec::new();
    for racine in RACINES {
        let Ok(hyp) = hkcu.open_subkey(racine) else { continue };
        for version in hyp.enum_keys().flatten() {
            if version.eq_ignore_ascii_case("standalone") {
                continue;
            }
            let Ok(v) = hyp.open_subkey(&version) else { continue };
            for code in v.enum_keys().flatten() {
                if !code_valide(&code) || sortie.iter().any(|(c, _)| c == &code) {
                    continue;
                }
                let Ok(jeu) = v.open_subkey(&code) else { continue };
                let dossier: String = jeu.get_value("GameInstallPath").unwrap_or_default();
                if dossier.trim().is_empty() {
                    continue;
                }
                sortie.push((code, PathBuf::from(dossier.trim())));
            }
        }
    }
    sortie
}

/// Dossiers des jeux HoYoPlay, pour la veille : l'exécutable y apparaît à la
/// fin d'un téléchargement, sans qu'aucune clé du registre ne change.
pub fn dossiers_jeux() -> Vec<PathBuf> {
    inscrits().into_iter().map(|(_, d)| d).filter(|d| d.is_dir()).collect()
}

/// Le lanceur HoYoPlay, d'après le registre puis son emplacement habituel.
pub fn chemin_lanceur() -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for racine in RACINES {
        let Ok(hyp) = hkcu.open_subkey(racine) else { continue };
        for version in hyp.enum_keys().flatten() {
            let Ok(v) = hyp.open_subkey(&version) else { continue };
            let dossier: String = v.get_value("InstallPath").unwrap_or_default();
            let exe = PathBuf::from(dossier.trim()).join("launcher.exe");
            if !dossier.trim().is_empty() && exe.is_file() {
                return Some(exe);
            }
        }
    }
    let defaut = PathBuf::from(r"C:\Program Files\HoYoPlay\launcher.exe");
    defaut.is_file().then_some(defaut)
}

pub fn scan_hoyoplay_games() -> Result<Vec<GameDto>, String> {
    let jeux = inscrits();
    if jeux.is_empty() && chemin_lanceur().is_none() {
        return Err("HoYoPlay n'est pas installé sur ce PC.".into());
    }

    let mut sortie = Vec::new();
    for (code, dossier) in jeux {
        // Dossier disparu : le jeu a été désinstallé et la clé est restée. On
        // ne le rapporte pas, la bibliothèque le marquera désinstallé.
        if !dossier.is_dir() {
            continue;
        }
        // Dossier présent sans exécutable : téléchargement en cours. Le jeu
        // figure dans la bibliothèque, mais pas encore comme jouable.
        let exe = trouver_exe(&dossier, &code);
        let titre = titre_inscrit(&code)
            .or_else(|| connu(&code).map(|(_, t, _)| t.to_string()))
            .unwrap_or_else(|| code.clone());
        let taille = if exe.is_some() { dir_size(&dossier) } else { 0 };

        sortie.push(GameDto {
            id: format!("hoyoplay-{}", code.to_ascii_lowercase()),
            title: titre,
            platform: "HoYoPlay".to_string(),
            installed: exe.is_some(),
            last_played_at: None,
            // L'exécutable du jeu, lancé tel quel : Windows demande lui-même
            // l'élévation quand le jeu l'exige. HoYoPlay reste seul à savoir
            // appliquer les mises à jour, qu'il propose à sa prochaine ouverture.
            launch_url: exe.map(|p| p.to_string_lossy().to_string()),
            steam_app_id: None,
            size_on_disk: (taille > 0).then_some(taille),
            install_path: Some(dossier.to_string_lossy().to_string()),
        });
    }
    Ok(sortie)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier(nom: &str, fichiers: &[&str]) -> PathBuf {
        let d = std::env::temp_dir().join(format!("cassini-test-hoyo-{nom}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        for f in fichiers {
            std::fs::write(d.join(f), b"").unwrap();
        }
        d
    }

    #[test]
    fn reconnait_les_jeux_par_leur_code() {
        assert_eq!(connu("hk4e_global").map(|j| j.1), Some("Genshin Impact"));
        assert_eq!(connu("hkrpg_cn").map(|j| j.1), Some("Honkai: Star Rail"));
        assert_eq!(connu("nap_global").map(|j| j.1), Some("Zenless Zone Zero"));
        assert!(connu("abc_global").is_none());
    }

    #[test]
    fn un_telechargement_en_cours_n_a_pas_d_executable() {
        let d = dossier("telechargement", &["config.ini", "mhypbase.dll"]);
        assert!(trouver_exe(&d, "nap_global").is_none());
    }

    #[test]
    fn trouve_l_executable_d_un_jeu_connu() {
        let d = dossier("zzz", &["ZenlessZoneZero.exe", "UnityCrashHandler64.exe"]);
        assert_eq!(trouver_exe(&d, "nap_global"), Some(d.join("ZenlessZoneZero.exe")));
    }

    #[test]
    fn devine_un_jeu_inconnu_seulement_sans_ambiguite() {
        let seul = dossier("inconnu-seul", &["NouveauJeu.exe", "UnityCrashHandler64.exe"]);
        assert_eq!(trouver_exe(&seul, "xyz_global"), Some(seul.join("NouveauJeu.exe")));

        let deux = dossier("inconnu-deux", &["A.exe", "B.exe"]);
        assert!(trouver_exe(&deux, "xyz_global").is_none());
    }

    #[test]
    fn refuse_un_code_qui_n_est_pas_un_identifiant() {
        assert!(code_valide("nap_global"));
        assert!(!code_valide(""));
        assert!(!code_valide(r"..\..\Windows"));
        assert!(!code_valide("nap global"));
    }
}
