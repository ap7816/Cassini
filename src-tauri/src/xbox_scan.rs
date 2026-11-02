//! Détection des jeux Xbox / Microsoft Store (Game Pass PC).
//!
//! Ces jeux ne s'installent pas comme les autres : leur contenu vit dans un
//! dossier `XboxGames` à la racine d'un disque, mais le système les connaît
//! comme des paquets, sous un dossier `WindowsApps` que l'utilisateur n'a pas
//! le droit de lire. D'où deux sources, croisées :
//!
//! ```text
//! X:\XboxGames\<Nom du jeu>\Content\
//!   MicrosoftGame.Config   identité du paquet, titre affiché, identifiant Store
//!   appxmanifest.xml       identifiant de l'application à lancer
//!
//! HKCU\…\AppModel\Repository\Packages\<nom complet du paquet>
//!   DisplayName, PackageID — lisibles sans élévation
//! ```
//!
//! Le dossier donne les jeux installés et leur poids ; le registre donne le
//! nom complet du paquet, dont se déduit la famille (`Nom_éditeur`) qui sert à
//! le lancer : `shell:AppsFolder\<famille>!<application>`.
//!
//! Rien n'est lu dans `WindowsApps` : tout est accessible sans élévation.

use crate::steam_scan::{dir_size, GameDto};
use base64::Engine as _;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

/// Inventaire des paquets installés, lisible par l'utilisateur courant.
const PAQUETS: &str = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";

/// Valeur d'un attribut XML, cherchée dans la première balise de ce nom.
///
/// Un analyseur complet serait ici hors de proportion : ces deux fichiers sont
/// écrits par Microsoft, et l'on n'y cherche que trois valeurs.
pub fn attribut(xml: &str, balise: &str, attribut: &str) -> Option<String> {
    // Le nom doit être entier : chercher « <Application » trouvait d'abord
    // « <Applications> », qui ne porte aucun attribut.
    let ouvrante = format!("<{balise}");
    let mut depuis = 0;
    let tag = loop {
        let debut = depuis + xml[depuis..].find(&ouvrante)?;
        let reste = &xml[debut..];
        let fin = reste.find('>')?;
        let tag = &reste[..fin];
        let suite = tag[ouvrante.len()..].chars().next();
        if suite.is_none_or(|c| c.is_whitespace() || c == '/') {
            break tag;
        }
        depuis = debut + ouvrante.len();
    };
    let pos = tag.find(&format!("{attribut}=\""))?;
    let apres = &tag[pos + attribut.len() + 2..];
    let fin_valeur = apres.find('"')?;
    let valeur = apres[..fin_valeur].trim();
    (!valeur.is_empty()).then(|| valeur.to_string())
}

/// Famille d'un paquet, déduite de son nom complet.
///
/// `Microsoft.MinecraftUWP_1.26.5101.0_x64__8wekyb3d8bbwe` donne
/// `Microsoft.MinecraftUWP_8wekyb3d8bbwe` : c'est sous ce nom-là que le shell
/// sait lancer une application.
pub fn famille_du_paquet(nom_complet: &str) -> Option<String> {
    let (nom, _) = nom_complet.split_once('_')?;
    let (_, editeur) = nom_complet.rsplit_once("__")?;
    if nom.is_empty() || editeur.is_empty() {
        return None;
    }
    Some(format!("{nom}_{editeur}"))
}

/// Cible de lancement d'une application de paquet.
pub fn cible_de_lancement(famille: &str, application: &str) -> String {
    format!("shell:AppsFolder\\{famille}!{application}")
}

/// Vrai pour une cible `shell:AppsFolder\famille!application`, et rien d'autre.
///
/// Vérifiée ici plutôt que par confiance : `launch_target` est appelable
/// depuis la webview, et cette forme échappe aux contrôles des URL comme à
/// ceux des chemins. Seuls les caractères d'un nom de paquet sont admis — ni
/// espace, ni séparateur, ni guillemet.
pub fn est_cible_appsfolder(cible: &str) -> bool {
    const PREFIXE: &str = r"shell:AppsFolder\";
    let Some(reste) = cible.strip_prefix(PREFIXE) else {
        return false;
    };
    let Some((famille, application)) = reste.split_once('!') else {
        return false;
    };
    let admis = |s: &str| {
        !s.is_empty()
            && s.len() <= 128
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    };
    admis(famille) && admis(application)
}

/// Les dossiers `XboxGames` de tous les disques.
pub fn dossiers_xbox() -> Vec<PathBuf> {
    ('A'..='Z')
        .map(|l| PathBuf::from(format!("{l}:\\XboxGames")))
        .filter(|d| d.is_dir())
        .collect()
}

/// Le fichier demandé dans un dossier, quelle que soit sa casse.
///
/// Microsoft écrit tantôt `MicrosoftGame.Config`, tantôt `MicrosoftGame.config`.
fn fichier_insensible(dossier: &Path, nom: &str) -> Option<PathBuf> {
    let direct = dossier.join(nom);
    if direct.is_file() {
        return Some(direct);
    }
    std::fs::read_dir(dossier).ok()?.flatten().find_map(|e| {
        let p = e.path();
        let trouve = p
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case(nom));
        (trouve && p.is_file()).then_some(p)
    })
}

/// Nom complet du paquet dont l'identité est celle-ci, lu dans le registre.
fn nom_complet_du_paquet(identite: &str) -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let paquets = hkcu.open_subkey(PAQUETS).ok()?;
    let prefixe = format!("{identite}_");
    paquets
        .enum_keys()
        .flatten()
        .find(|nom| nom.starts_with(&prefixe) && nom.contains("__"))
}

/// Logos déclarés par un jeu, du plus grand au plus petit.
///
/// Ce sont ceux que Windows affiche dans le menu Démarrer ; ils font une
/// jaquette honnête pour un jeu du Store, qui n'a ni page Steam ni jaquette
/// ailleurs.
const LOGOS: [&str; 4] = [
    "Square480x480Logo",
    "Square150x150Logo",
    "SplashScreenImage",
    "StoreLogo",
];

/// Le fichier d'un logo dans le dossier `Content`.
///
/// Le nom déclaré peut ne pas exister tel quel : Windows range souvent les
/// variantes d'échelle à côté (`Logo.scale-200.png`). À défaut du nom exact,
/// la première variante fait l'affaire.
pub fn fichier_du_logo(contenu: &Path, nom: &str) -> Option<PathBuf> {
    let nom = nom.replace('\\', "/");
    let direct = contenu.join(&nom);
    if direct.is_file() {
        return Some(direct);
    }
    let dossier = direct.parent()?.to_path_buf();
    let souche = Path::new(&nom).file_stem()?.to_str()?.to_ascii_lowercase();
    std::fs::read_dir(dossier).ok()?.flatten().find_map(|e| {
        let p = e.path();
        let f = p.file_name()?.to_str()?.to_ascii_lowercase();
        (f.starts_with(&souche) && f.ends_with(".png") && p.is_file()).then_some(p)
    })
}

/// Vrai pour un dossier de jeu du Store, et lui seul.
///
/// `cover_xbox` lit un fichier du disque à la demande de la webview : elle ne
/// doit pouvoir lire qu'à cet endroit-là.
pub fn est_dossier_de_jeu_xbox(chemin: &str) -> bool {
    let p = Path::new(chemin);
    !chemin.contains("..")
        && p.is_absolute()
        && p.components().any(|c| {
            c.as_os_str()
                .to_str()
                .is_some_and(|n| n.eq_ignore_ascii_case("XboxGames"))
        })
}

/// Jaquette d'un jeu du Store : son propre logo, en `data:` URL.
pub fn cover_xbox(dossier_jeu: &str) -> Option<String> {
    if !est_dossier_de_jeu_xbox(dossier_jeu) {
        return None;
    }
    let contenu = Path::new(dossier_jeu).join("Content");
    let config = fichier_insensible(&contenu, "MicrosoftGame.Config")?;
    let texte = std::fs::read_to_string(config).ok()?;

    let logo = LOGOS.iter().find_map(|attr| {
        let nom = attribut(&texte, "ShellVisuals", attr)?;
        fichier_du_logo(&contenu, &nom)
    })?;

    let octets = std::fs::read(&logo).ok()?;
    // Une jaquette de menu Démarrer pèse quelques dizaines de kilo-octets ;
    // au-delà du mégaoctet, ce n'en est pas une.
    if octets.is_empty() || octets.len() > 1024 * 1024 {
        return None;
    }
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(octets)
    ))
}

pub fn scan_xbox_games() -> Result<Vec<GameDto>, String> {
    let dossiers = dossiers_xbox();
    if dossiers.is_empty() {
        return Err("Aucun jeu Xbox sur ce PC.".into());
    }

    let mut sortie = Vec::new();
    for racine in dossiers {
        let Ok(entrees) = std::fs::read_dir(&racine) else {
            continue;
        };
        for entree in entrees.flatten() {
            let jeu = entree.path();
            let contenu = jeu.join("Content");
            if !contenu.is_dir() {
                continue;
            }
            let Some(config) = fichier_insensible(&contenu, "MicrosoftGame.Config") else {
                continue;
            };
            let Ok(texte) = std::fs::read_to_string(&config) else {
                continue;
            };

            let Some(identite) = attribut(&texte, "Identity", "Name") else {
                continue;
            };
            let titre = attribut(&texte, "ShellVisuals", "DefaultDisplayName")
                .or_else(|| jeu.file_name().and_then(|n| n.to_str()).map(String::from))
                .unwrap_or_else(|| identite.clone());

            // L'application à lancer : la première du manifeste. Un paquet de
            // jeu n'en déclare qu'une, et son identifiant varie — « Game »
            // pour Minecraft, « App » ailleurs.
            let manifeste = fichier_insensible(&contenu, "appxmanifest.xml")
                .and_then(|p| std::fs::read_to_string(p).ok())
                .unwrap_or_default();
            let application =
                attribut(&manifeste, "Application", "Id").unwrap_or_else(|| "App".into());

            // Sans nom complet, le jeu reste listé : on sait le montrer et
            // dire son poids, mais pas le lancer.
            let launch_url = nom_complet_du_paquet(&identite)
                .as_deref()
                .and_then(famille_du_paquet)
                .map(|famille| cible_de_lancement(&famille, &application));

            let taille = dir_size(&jeu);
            sortie.push(GameDto {
                id: format!("xbox-{}", identite.to_ascii_lowercase()),
                title: titre,
                platform: "Xbox".to_string(),
                installed: true,
                last_played_at: None,
                launch_url,
                steam_app_id: None,
                size_on_disk: (taille > 0).then_some(taille),
                install_path: Some(jeu.to_string_lossy().to_string()),
            });
        }
    }
    Ok(sortie)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="Microsoft.MinecraftUWP"
            Publisher="CN=Microsoft Corporation"
            Version="1.26.5101.0" />
  <TitleId>35760C07</TitleId>
  <ShellVisuals DefaultDisplayName="Minecraft for Windows"
      PublisherDisplayName="Microsoft Studios"/>
</Game>"#;

    const MANIFESTE: &str = r#"<Package>
  <Identity Name="Microsoft.MinecraftUWP" Version="1.26.5101.0" />
  <Applications><Application Id="Game" Executable="GameLaunchHelper.exe" /></Applications>
</Package>"#;

    #[test]
    fn lit_les_attributs_sur_plusieurs_lignes() {
        assert_eq!(
            attribut(CONFIG, "Identity", "Name").as_deref(),
            Some("Microsoft.MinecraftUWP")
        );
        assert_eq!(
            attribut(CONFIG, "ShellVisuals", "DefaultDisplayName").as_deref(),
            Some("Minecraft for Windows")
        );
        assert_eq!(
            attribut(MANIFESTE, "Application", "Id").as_deref(),
            Some("Game")
        );
    }

    #[test]
    fn ne_confond_pas_une_balise_avec_celle_qui_la_contient() {
        // « <Applications> » ne porte pas d'attribut : c'est « <Application »
        // qu'il faut trouver.
        assert_eq!(
            attribut(MANIFESTE, "Application", "Id").as_deref(),
            Some("Game")
        );
        assert_eq!(
            attribut(MANIFESTE, "Identity", "Name").as_deref(),
            Some("Microsoft.MinecraftUWP")
        );
    }

    #[test]
    fn rend_rien_pour_un_attribut_absent_ou_vide() {
        assert!(attribut(CONFIG, "Identity", "Editeur").is_none());
        assert!(attribut(CONFIG, "Inconnue", "Name").is_none());
        assert!(attribut(r#"<Identity Name="" />"#, "Identity", "Name").is_none());
    }

    #[test]
    fn deduit_la_famille_du_nom_complet() {
        assert_eq!(
            famille_du_paquet("Microsoft.MinecraftUWP_1.26.5101.0_x64__8wekyb3d8bbwe").as_deref(),
            Some("Microsoft.MinecraftUWP_8wekyb3d8bbwe")
        );
        assert_eq!(
            famille_du_paquet("Microsoft.4297127D64EC6_1.0.0.0_x64__8wekyb3d8bbwe").as_deref(),
            Some("Microsoft.4297127D64EC6_8wekyb3d8bbwe")
        );
        assert!(famille_du_paquet("SansSeparateur").is_none());
        assert!(famille_du_paquet("Nom_1.0_x64_8wekyb3d8bbwe").is_none());
    }

    #[test]
    fn n_ouvre_que_les_dossiers_de_jeux_du_store() {
        assert!(est_dossier_de_jeu_xbox(
            r"C:\XboxGames\Minecraft for Windows"
        ));
        assert!(est_dossier_de_jeu_xbox(r"D:\xboxgames\Un jeu"));
        assert!(!est_dossier_de_jeu_xbox(r"C:\Users\anton\Documents"));
        assert!(!est_dossier_de_jeu_xbox(
            r"C:\XboxGames\..\Windows\System32"
        ));
        assert!(!est_dossier_de_jeu_xbox("XboxGames"));
    }

    #[test]
    fn n_admet_que_la_forme_attendue_de_cible() {
        assert!(est_cible_appsfolder(
            r"shell:AppsFolder\Microsoft.MinecraftUWP_8wekyb3d8bbwe!Game"
        ));
        assert!(!est_cible_appsfolder(r"shell:AppsFolderamille"));
        assert!(!est_cible_appsfolder(r"shell:AppsFolderamille!"));
        assert!(!est_cible_appsfolder(r"shell:AppsFolderam ille!App"));
        assert!(!est_cible_appsfolder(r"shell:AppsFolder\..\..\Windows!App"));
        assert!(!est_cible_appsfolder(r"C:\jeu.exe"));
        assert!(!est_cible_appsfolder("steam://rungameid/440"));
    }

    #[test]
    fn compose_la_cible_attendue_par_le_shell() {
        assert_eq!(
            cible_de_lancement("Microsoft.MinecraftUWP_8wekyb3d8bbwe", "Game"),
            r"shell:AppsFolder\Microsoft.MinecraftUWP_8wekyb3d8bbwe!Game"
        );
    }
}
