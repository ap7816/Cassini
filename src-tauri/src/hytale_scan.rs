//! Détection de Hytale.
//!
//! Le lanceur ne tient pas d'inventaire : il n'installe qu'un seul jeu, dans
//! une arborescence fixe sous `%APPDATA%\Hytale`. Il n'y a donc rien à
//! énumérer, seulement à constater la présence du client.
//!
//! ```text
//! %APPDATA%\Hytale\
//!   patchline.json                    canal actif : "release" ou "pre-release"
//!   install\<canal>\package\game\latest\Client\HytaleClient.exe
//! ```
//!
//! `env.dat`, à côté, est chiffré et n'apporte rien d'exploitable.

use crate::steam_scan::{dir_size, GameDto};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

/// Le lanceur n'expose pas d'`InstallLocation` : seule `DisplayIcon` porte le
/// chemin de son exécutable.
const LAUNCHER_DEFAUT: &str = r"C:\Program Files\Hypixel Studios\Hytale Launcher\hytale-launcher.exe";

#[derive(Deserialize)]
struct Patchline {
    patchline: Option<String>,
}

/// Racine des données du lanceur, `%APPDATA%\Hytale`.
fn racine() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(appdata).join("Hytale");
    dir.is_dir().then_some(dir)
}

/// Canal actif. `release` par défaut : c'est celui qu'installe le lanceur, et
/// un fichier absent ou illisible ne doit pas empêcher la détection.
fn canal_actif(racine: &Path) -> String {
    let brut = std::fs::read_to_string(racine.join("patchline.json")).unwrap_or_default();
    serde_json::from_str::<Patchline>(&brut)
        .ok()
        .and_then(|p| p.patchline)
        .filter(|c| !c.is_empty() && !c.contains(['/', '\\', '.']))
        .unwrap_or_else(|| "release".to_string())
}

/// Exécutable du lanceur, lu dans la base de registre puis, à défaut, à son
/// emplacement d'installation habituel.
fn chemin_lanceur() -> Option<String> {
    for racine in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let hive = RegKey::predef(racine);
        for chemin in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            let Ok(uninstall) = hive.open_subkey(chemin) else { continue };

            for nom in uninstall.enum_keys().flatten() {
                let Ok(sk) = uninstall.open_subkey(&nom) else { continue };
                let affiche: String = sk.get_value("DisplayName").unwrap_or_default();
                if !affiche.to_lowercase().contains("hytale") {
                    continue;
                }
                // `DisplayIcon` peut porter un suffixe d'index d'icône.
                let icone: String = sk.get_value("DisplayIcon").unwrap_or_default();
                let exe = icone.split(',').next().unwrap_or("").trim().trim_matches('"');
                if !exe.is_empty() && Path::new(exe).is_file() {
                    return Some(exe.to_string());
                }
            }
        }
    }

    Path::new(LAUNCHER_DEFAUT)
        .is_file()
        .then(|| LAUNCHER_DEFAUT.to_string())
}

/// Détecte Hytale. Renvoie une liste, comme les autres scanners, mais elle ne
/// contiendra jamais plus d'une entrée.
pub fn scan_hytale_games() -> Result<Vec<GameDto>, String> {
    let Some(racine) = racine() else {
        return Err("Hytale n'est pas installé sur ce PC.".into());
    };

    let canal = canal_actif(&racine);
    let package = racine.join("install").join(&canal).join("package");
    let client = package.join("game").join("latest").join("Client");
    let exe = client.join("HytaleClient.exe");

    if !exe.is_file() {
        return Err(format!(
            "Aucun client Hytale installé sur le canal « {canal} »."
        ));
    }

    // On lance par le lanceur, jamais par le client directement.
    //
    // Le journal du lanceur montre qu'il démarre le client ainsi :
    //
    //   HytaleClient.exe --app-dir <…>\game\latest
    //                    --user-dir <…>\UserData
    //                    --java-exec <…>\jre\latest\bin\java.exe
    //                    --auth-mode authenticated --uuid <compte> --name <pseudo>
    //
    // Les trois chemins se déduisent, mais l'identifiant de compte et le
    // pseudo viennent d'`account.dat`, chiffré comme `env.dat` — les
    // reconstituer est donc hors de portée. Et le lanceur reste de toute
    // façon seul à savoir appliquer les mises à jour avant de démarrer.
    let launch_url = chemin_lanceur();

    // Le lanceur peut avoir été désinstallé alors que les fichiers du jeu
    // restent : son désinstalleur ne vide pas `AppData`. Sans lui, on ne sait
    // plus démarrer Hytale — le jeu n'est donc plus jouable, même si son
    // dossier pèse encore plusieurs gigaoctets. On le rapporte désinstallé
    // plutôt que de proposer un bouton « Jouer » qui ne ferait rien.
    let jouable = launch_url
        .as_deref()
        .is_some_and(|l| std::path::Path::new(l).is_file());

    // Taille du paquet complet, moteur de rendu et environnement Java compris —
    // c'est ce que la désinstallation libérerait.
    let taille = dir_size(&package);

    Ok(vec![GameDto {
        id: "hytale-client".to_string(),
        title: "Hytale".to_string(),
        platform: "Hytale".to_string(),
        installed: jouable,
        last_played_at: None,
        launch_url,
        steam_app_id: None,
        size_on_disk: (taille > 0).then_some(taille),
        // Le dossier du client plutôt que la racine des données : c'est celui
        // qu'on veut ouvrir depuis la bibliothèque.
        install_path: Some(client.to_string_lossy().to_string()),
    }])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Le canal se réduit à un nom simple : il sert de segment de chemin, une
    /// valeur contenant un séparateur permettrait de sortir du dossier.
    #[test]
    fn le_canal_refuse_les_chemins() {
        let dir = std::env::temp_dir().join("cassini-test-hytale");
        std::fs::create_dir_all(&dir).unwrap();

        // JSON construit par `serde_json` : un littéral d'antislash dans la
        // source dépend de la façon dont le fichier est produit, et un
        // échappement perdu en route donne un caractère de contrôle au lieu
        // d'un séparateur de chemin. 92 est le code de l'antislash.
        let antislash = serde_json::json!({
            "patchline": format!("a{}b", char::from(92u8))
        })
        .to_string();

        for (contenu, attendu) in [
            (r#"{"patchline":"pre-release"}"#.to_string(), "pre-release"),
            (r#"{"patchline":"../../evade"}"#.to_string(), "release"),
            (antislash, "release"),
            (r#"{"patchline":""}"#.to_string(), "release"),
            (r#"{}"#.to_string(), "release"),
            ("pas du json".to_string(), "release"),
        ] {
            std::fs::write(dir.join("patchline.json"), &contenu).unwrap();
            assert_eq!(canal_actif(&dir), attendu, "pour {contenu}");
        }

        // Fichier absent : on retombe aussi sur le canal par défaut
        std::fs::remove_file(dir.join("patchline.json")).unwrap();
        assert_eq!(canal_actif(&dir), "release");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// S'exécute sur la machine de développement : si Hytale y est installé,
    /// le scanner doit le décrire correctement ; sinon il doit le dire sans
    /// paniquer.
    #[test]
    fn detecte_hytale_sur_cette_machine() {
        match scan_hytale_games() {
            Err(msg) => {
                assert!(!msg.is_empty());
                eprintln!("Hytale absent de cette machine : {msg}");
            }
            Ok(jeux) => {
                assert_eq!(jeux.len(), 1, "le lanceur n'installe qu'un jeu");
                let j = &jeux[0];
                assert_eq!(j.platform, "Hytale");
                assert_eq!(j.title, "Hytale");

                let chemin = j.install_path.as_deref().expect("dossier d'installation");
                assert!(
                    std::path::Path::new(chemin).join("HytaleClient.exe").is_file(),
                    "le client doit se trouver dans {chemin}"
                );

                // Jouable seulement si le lanceur est là. Le cas contraire
                // n'est pas théorique : désinstaller Hytale retire le lanceur
                // et laisse les fichiers du jeu dans `AppData`.
                let lanceur = j
                    .launch_url
                    .as_deref()
                    .filter(|l| std::path::Path::new(l).is_file());
                assert_eq!(
                    j.installed,
                    lanceur.is_some(),
                    "« installé » doit suivre la présence du lanceur"
                );
                if lanceur.is_none() {
                    eprintln!("Hytale : fichiers présents, lanceur désinstallé");
                }

                assert!(j.size_on_disk.unwrap_or(0) > 0, "taille sur disque non nulle");
                eprintln!(
                    "Hytale détecté — {} Go, lancé par {}",
                    j.size_on_disk.unwrap_or(0) / 1_073_741_824,
                    lanceur.unwrap_or("(lanceur absent)")
                );
            }
        }
    }
}
