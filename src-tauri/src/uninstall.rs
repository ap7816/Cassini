//! Désinstallation d'un jeu, par son propre désinstalleur.
//!
//! Cassini ne supprime jamais de fichiers. Il retrouve le désinstalleur déclaré
//! par le jeu — celui que Windows liste dans « Applications installées » — et
//! le lance. C'est ce programme-là qui demande confirmation, retire les
//! fichiers et nettoie la base de registre, comme si l'utilisateur était passé
//! par le panneau de configuration.
//!
//! Deux raisons de procéder ainsi plutôt que d'effacer le dossier. Un jeu ne se
//! résume pas à son dossier : clés de registre, sauvegardes, préfixes de
//! launcher, redistribuables. Et surtout, effacer nous-mêmes rendrait
//! irréversible une commande envoyée par erreur, alors qu'un désinstalleur
//! officiel demande toujours confirmation.
//!
//! Steam fait exception : son protocole `steam://uninstall/<appid>` ouvre la
//! boîte de dialogue de Steam, qui connaît mieux que nous ses bibliothèques.

use std::path::Path;

#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

/// Ce qu'on a trouvé pour désinstaller un jeu.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Desinstalleur {
    /// Nom affiché par Windows — celui qu'on montre avant de lancer quoi que ce soit.
    pub nom: String,
    /// Programme à exécuter.
    pub programme: String,
    /// Arguments, tels que déclarés par le jeu.
    pub arguments: Vec<String>,
}

/// Réduit un titre à ce qui permet de le comparer : minuscules, sans
/// ponctuation ni mentions d'édition, espaces normalisés.
pub fn normaliser_titre(t: &str) -> String {
    let mut sortie = String::with_capacity(t.len());
    for c in t.chars() {
        if c.is_alphanumeric() {
            sortie.extend(c.to_lowercase());
        } else if !sortie.ends_with(' ') {
            sortie.push(' ');
        }
    }
    let coupes = [
        " game of the year edition",
        " goty edition",
        " definitive edition",
        " remastered",
        " deluxe edition",
        " standard edition",
    ];
    let mut s = sortie.trim().to_string();
    for c in coupes {
        if let Some(reste) = s.strip_suffix(c.trim_start()) {
            s = reste.trim().to_string();
        }
    }
    s
}

/// Découpe une ligne de commande Windows en programme et arguments.
///
/// Les chaînes de désinstallation prennent deux formes :
/// `"C:\Jeux\X\unins000.exe" /SILENT` et, sans guillemets,
/// `C:\Program Files\X\uninstall.exe --mode` — où l'espace de « Program
/// Files » interdit de couper au premier blanc. Faute de guillemets, on prend
/// donc le plus long préfixe qui se termine par `.exe`.
pub fn decouper(commande: &str) -> Option<(String, Vec<String>)> {
    let c = commande.trim();
    if c.is_empty() {
        return None;
    }

    if let Some(reste) = c.strip_prefix('"') {
        let (programme, args) = reste.split_once('"')?;
        return Some((programme.to_string(), decouper_arguments(args)));
    }

    // Sans guillemets : on cherche la dernière terminaison « .exe » possible.
    let minuscules = c.to_ascii_lowercase();
    let mut coupe = None;
    let mut depuis = 0;
    while let Some(i) = minuscules[depuis..].find(".exe") {
        coupe = Some(depuis + i + 4);
        depuis += i + 4;
    }
    let fin = coupe?;
    Some((c[..fin].to_string(), decouper_arguments(&c[fin..])))
}

/// Sépare des arguments en respectant les guillemets.
fn decouper_arguments(s: &str) -> Vec<String> {
    let mut sortie = Vec::new();
    let mut courant = String::new();
    let mut entre_guillemets = false;
    for ch in s.chars() {
        match ch {
            '"' => entre_guillemets = !entre_guillemets,
            c if c.is_whitespace() && !entre_guillemets => {
                if !courant.is_empty() {
                    sortie.push(std::mem::take(&mut courant));
                }
            }
            c => courant.push(c),
        }
    }
    if !courant.is_empty() {
        sortie.push(courant);
    }
    sortie
}

/// Programmes qu'on ne lance jamais, d'où qu'ils viennent.
///
/// Ils exécutent ce qu'on leur donne : leur passer des arguments revient à
/// exécuter n'importe quoi. Une entrée de registre — que n'importe quel
/// programme peut écrire sous `HKCU` sans droits administrateur — pourrait
/// sinon déclarer `cmd.exe /c rd /s /q C:\Windows\System32` comme chaîne de
/// désinstallation, et nous la lancerions sur un clic.
const INTERPRETEURS: [&str; 18] = [
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
    "rundll32.exe",
    "regsvr32.exe",
    "wmic.exe",
    "forfiles.exe",
    "schtasks.exe",
    "reg.exe",
    "net.exe",
    "taskkill.exe",
    "explorer.exe",
    "bash.exe",
    "sh.exe",
    "python.exe",
];

/// Le programme lui-même est-il acceptable ? Décision pure, sans accès disque.
///
/// Trois refus, dans cet ordre : les interpréteurs ci-dessus, tout ce qui vit
/// dans le dossier de Windows — `msiexec` excepté, seul outil système qui
/// désinstalle légitimement — et les chemins réseau, qui feraient exécuter un
/// binaire hébergé ailleurs.
pub fn programme_admis(programme: &str, racine_systeme: &str) -> bool {
    let p = programme.trim();
    if p.is_empty() || p.starts_with("\\\\") || p.starts_with("//") {
        return false;
    }

    let fichier = Path::new(p)
        .file_name()
        .map(|f| f.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    if fichier == "msiexec.exe" || fichier == "msiexec" {
        return true;
    }
    if INTERPRETEURS.contains(&fichier.as_str()) || !fichier.ends_with(".exe") {
        return false;
    }

    let chemin = p.to_ascii_lowercase().replace('/', "\\");
    let racine = racine_systeme.to_ascii_lowercase().replace('/', "\\");
    let racine = racine.trim_end_matches('\\');
    !racine.is_empty() && !chemin.starts_with(&format!("{racine}\\"))
}

/// N'accepte que ce qu'on sait être un désinstalleur.
///
/// Le registre est modifiable par n'importe quel programme installé : on ne
/// lance donc pas la chaîne trouvée telle quelle. Deux formes sont admises —
/// un exécutable qui existe sur le disque et n'appartient pas au système, ou
/// `msiexec` avec un code produit.
pub fn commande_admise(programme: &str, arguments: &[String]) -> bool {
    let racine = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    if !programme_admis(programme, &racine) {
        return false;
    }

    let fichier = Path::new(programme.trim())
        .file_name()
        .map(|f| f.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    if fichier == "msiexec.exe" || fichier == "msiexec" {
        // Sans code produit, `msiexec` ne désinstalle rien de précis.
        return arguments.iter().any(|a| {
            let a = a.to_ascii_lowercase();
            (a.starts_with("/x") || a.starts_with("-x")) && a.contains('{')
        });
    }

    Path::new(programme.trim()).is_file()
}

/// Un chemin de dossier réduit à ce qui permet de le comparer : minuscules,
/// séparateurs uniformes, sans barre finale.
///
/// Les trois sont nécessaires, et le registre fournit l'exemple de chacun :
/// `C:\Program Files\Epic Games\` finit par une barre, `C:/Riot Games/Riot
/// Client/` emploie l'autre séparateur, et la casse ne veut rien dire sous
/// Windows.
fn dossier_normalise(p: &str) -> String {
    p.replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

/// Note la ressemblance entre une entrée du registre et le jeu cherché.
/// `None` quand rien ne correspond assez pour prendre le risque.
pub fn score(
    titre_jeu: &str,
    nom_entree: &str,
    emplacement: Option<&str>,
    chemin_jeu: Option<&str>,
) -> Option<u32> {
    let a = normaliser_titre(titre_jeu);
    let b = normaliser_titre(nom_entree);
    if a.is_empty() || b.is_empty() {
        return None;
    }

    // Le même dossier, et lui seul.
    //
    // Un dossier qui *contient* celui du jeu comptait aussi, et c'était un
    // défaut grave : le lanceur est précisément ce qui s'installe au-dessus de
    // ses jeux. Le registre donne `C:\Program Files\Epic Games\` à « Epic
    // Games Launcher », et chaque jeu Epic est dedans — demander à désinstaller
    // un jeu Epic lançait donc le désinstalleur du lanceur, avec la meilleure
    // note possible, devant l'entrée du jeu lui-même. Ubisoft Connect
    // (`…\Ubisoft Game Launcher\`, qui porte `games\…`) et HoYoPlay avaient le
    // même piège.
    //
    // L'inverse — un dossier *contenu* dans celui du jeu — est parti avec :
    // c'est la porte ouverte aux composants installés à côté du jeu, dans son
    // propre dossier. Les deux directions ne servaient qu'à rattraper un nom
    // différent, ce que la règle suivante fait déjà quand elle est sûre.
    let meme_dossier = match (emplacement, chemin_jeu) {
        (Some(e), Some(j)) => {
            let e = dossier_normalise(e);
            !e.is_empty() && e == dossier_normalise(j)
        }
        _ => false,
    };

    if meme_dossier {
        return Some(100);
    }
    if a == b {
        return Some(90);
    }
    // Rien d'autre. Un préfixe commun paraissait suffisant — et faisait
    // correspondre « Portal » à « Portal 2 », « Half-Life » à
    // « Half-Life: Alyx ». Devant une action irréversible, ne rien proposer
    // vaut mieux que désinstaller le mauvais jeu : l'utilisateur garde le
    // chemin habituel par Windows, et nous le lui disons.
    None
}

/// Lanceurs de jeux, tels que Windows les nomme, une fois normalisés.
///
/// Hytale n'y est pas : son lanceur porte le nom du jeu, et c'est par lui que
/// le jeu s'installe.
const LANCEURS: [&str; 13] = [
    "steam",
    "epic games",
    "epic games launcher",
    "epic online services",
    "battle net",
    "ubisoft connect",
    "ubisoft game launcher",
    "ea app",
    "ea desktop",
    "origin",
    "gog galaxy",
    "riot client",
    "rockstar games launcher",
];

/// L'entrée désigne-t-elle un lanceur, quand ce n'est pas lui qu'on cherchait ?
///
/// Seconde barrière, posée après la correction de la règle des dossiers : une
/// entrée peut encore tomber sur un lanceur par son nom, ou par un dossier
/// d'installation que le lanceur et le jeu partagent pour de bon. Or le
/// désinstalleur d'un lanceur retire le lanceur, jamais un seul de ses jeux —
/// il n'y a donc aucun cas où le lancer serve ce qu'on demandait.
///
/// Le lanceur lui-même reste désinstallable : ce qui est refusé, c'est de
/// répondre « Epic Games Launcher » à qui demande à retirer un jeu. La version
/// est admise après le nom, le registre en portant (« RSI Launcher 2.18.1 »).
pub fn lanceur_etranger(nom_entree: &str, titre_jeu: &str) -> bool {
    let n = normaliser_titre(nom_entree);
    let est_lanceur = LANCEURS
        .iter()
        .any(|l| n == *l || n.starts_with(&format!("{l} ")));
    est_lanceur && n != normaliser_titre(titre_jeu)
}

/// Éditeurs dont on ne touche jamais aux logiciels depuis Cassini.
///
/// Pilotes, composants système, utilitaires constructeur : rien de tout cela
/// n'est un jeu, et s'en débarrasser par erreur peut laisser une machine sans
/// carte graphique, sans son ou sans réseau.
const EDITEURS_SYSTEME: [&str; 12] = [
    "microsoft",
    "nvidia",
    "advanced micro devices",
    "intel",
    "realtek",
    "qualcomm",
    "mediatek",
    "asus",
    "dell",
    "hp inc",
    "lenovo",
    "gigabyte",
];

/// Motifs qui désignent un composant technique, quel qu'en soit l'éditeur.
///
/// Choisis pour ne jamais correspondre à un titre de jeu : « Driver » seul en
/// est absent, parce que la série *Driver* existe. « Vanguard » et les
/// anti-triche y figurent : les retirer casse le jeu qui en dépend, et cela se
/// fait depuis le jeu, pas depuis un lanceur.
const MOTIFS_SYSTEME: [&str; 18] = [
    "redistributable",
    "runtime",
    "visual c++",
    ".net",
    "directx",
    "vulkan",
    "physx",
    " sdk",
    "driver package",
    "graphics driver",
    "chipset",
    "firmware",
    "hotfix",
    "update for",
    "anticheat",
    "anti-cheat",
    "vanguard",
    "battleye",
];

/// Ce qu'on refuse de désinstaller depuis Cassini, à lister comme à lancer.
///
/// Cassini est un lanceur de jeux : il n'a aucune raison de servir de panneau
/// de configuration. Ce qui relève du système reste du ressort de Windows, où
/// l'utilisateur sait qu'il touche à sa machine.
pub fn est_systeme(nom: &str, editeur: Option<&str>) -> bool {
    let n = nom.to_lowercase();
    if MOTIFS_SYSTEME.iter().any(|m| n.contains(m)) {
        return true;
    }
    match editeur {
        Some(e) => {
            let e = e.to_lowercase();
            EDITEURS_SYSTEME.iter().any(|v| e.contains(v))
        }
        None => false,
    }
}

/// Les trois endroits où Windows liste ce qui est installé.
#[cfg(target_os = "windows")]
const RACINES: [(isize, &str); 3] = [
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

/// Cherche dans le registre le désinstalleur d'un jeu.
#[cfg(target_os = "windows")]
pub fn trouver(titre: &str, chemin_jeu: Option<&str>) -> Option<Desinstalleur> {
    let mut meilleur: Option<(u32, Desinstalleur)> = None;

    for (ruche, chemin) in RACINES {
        let Ok(base) = RegKey::predef(ruche).open_subkey(chemin) else {
            continue;
        };
        for cle in base.enum_keys().flatten() {
            let Ok(entree) = base.open_subkey(&cle) else {
                continue;
            };
            let nom: String = entree.get_value("DisplayName").unwrap_or_default();
            if nom.is_empty() {
                continue;
            }
            // Les mises à jour et correctifs système ne sont pas des jeux.
            if entree.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
                continue;
            }

            let editeur: String = entree.get_value("Publisher").unwrap_or_default();
            if est_systeme(&nom, Some(editeur.as_str()).filter(|e| !e.is_empty())) {
                continue;
            }
            // Un lanceur ne se désinstalle pas à la place d'un de ses jeux.
            if lanceur_etranger(&nom, titre) {
                continue;
            }

            let emplacement: String = entree.get_value("InstallLocation").unwrap_or_default();
            let Some(note) = score(
                titre,
                &nom,
                Some(emplacement.as_str()).filter(|e| !e.is_empty()),
                chemin_jeu,
            ) else {
                continue;
            };

            // Silencieux d'abord : il évite une fenêtre de plus quand le jeu
            // en propose un, sans rien changer à ce qui est supprimé.
            let brute: String = entree
                .get_value("QuietUninstallString")
                .or_else(|_| entree.get_value("UninstallString"))
                .unwrap_or_default();
            let Some((programme, arguments)) = decouper(&brute) else {
                continue;
            };
            if !commande_admise(&programme, &arguments) {
                continue;
            }

            if meilleur.as_ref().is_none_or(|(n, _)| note > *n) {
                meilleur = Some((
                    note,
                    Desinstalleur {
                        nom,
                        programme,
                        arguments,
                    },
                ));
            }
        }
    }

    meilleur.map(|(_, d)| d)
}

#[cfg(not(target_os = "windows"))]
pub fn trouver(_titre: &str, _chemin_jeu: Option<&str>) -> Option<Desinstalleur> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ecarte_les_pilotes_et_composants_systeme() {
        assert!(est_systeme(
            "NVIDIA Graphics Driver 566.36",
            Some("NVIDIA Corporation")
        ));
        assert!(est_systeme(
            "Microsoft Visual C++ 2015-2022 Redistributable (x64)",
            Some("Microsoft Corporation")
        ));
        assert!(est_systeme("Microsoft Edge", Some("Microsoft Corporation")));
        assert!(est_systeme(
            "Intel(R) Chipset Device Software",
            Some("Intel Corporation")
        ));
        assert!(est_systeme(
            "Realtek Audio Driver Package",
            Some("Realtek Semiconductor")
        ));
        assert!(est_systeme("Windows SDK", None));
        assert!(est_systeme("Easy Anti-Cheat", Some("Epic Games")));
        // Anti-triche : le retirer casse le jeu qui en dépend.
        assert!(est_systeme("Riot Vanguard", Some("Riot Games")));
    }

    #[test]
    fn laisse_passer_les_jeux() {
        assert!(!est_systeme("Hytale Launcher", Some("Hypixel Studios")));
        assert!(!est_systeme("VALORANT", Some("Riot Games")));
        assert!(!est_systeme("Steam", Some("Valve Corporation")));
        // « Driver » est une série de jeux : le mot seul ne doit rien bloquer.
        assert!(!est_systeme("Driver San Francisco", Some("Ubisoft")));
        assert!(!est_systeme("Age of Empires II", Some("Xbox Game Studios")));
    }

    #[test]
    fn decoupe_une_commande_entre_guillemets() {
        let (p, a) = decouper(r#""C:\Jeux\X\unins000.exe" /SILENT /NORESTART"#).unwrap();
        assert_eq!(p, r"C:\Jeux\X\unins000.exe");
        assert_eq!(a, vec!["/SILENT", "/NORESTART"]);
    }

    #[test]
    fn decoupe_un_chemin_sans_guillemets_contenant_des_espaces() {
        let (p, a) = decouper(r"C:\Program Files\Mon Jeu\uninstall.exe --mode silencieux").unwrap();
        assert_eq!(p, r"C:\Program Files\Mon Jeu\uninstall.exe");
        assert_eq!(a, vec!["--mode", "silencieux"]);
    }

    #[test]
    fn decoupe_msiexec() {
        let (p, a) = decouper("MsiExec.exe /X{12345678-1234-1234-1234-123456789012}").unwrap();
        assert_eq!(p, "MsiExec.exe");
        assert_eq!(a, vec!["/X{12345678-1234-1234-1234-123456789012}"]);
    }

    #[test]
    fn refuse_les_interpreteurs_meme_avec_leur_chemin_complet() {
        // Le cas qui comptait : ces programmes existent bel et bien sur la
        // machine, et « un .exe qui existe » suffisait à les accepter.
        let racine = r"C:\Windows";
        assert!(!programme_admis(r"C:\Windows\System32\cmd.exe", racine));
        assert!(!programme_admis(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            racine
        ));
        assert!(!programme_admis(
            r"C:\Windows\System32\rundll32.exe",
            racine
        ));
        assert!(!programme_admis(r"C:\Windows\explorer.exe", racine));
        assert!(!programme_admis(r"c:/windows/system32/CMD.EXE", racine));
    }

    #[test]
    fn refuse_tout_le_dossier_de_windows_sauf_msiexec() {
        let racine = r"C:\Windows";
        assert!(!programme_admis(r"C:\Windows\System32\sethc.exe", racine));
        assert!(!programme_admis(r"C:\Windows\quelconque.exe", racine));
        assert!(programme_admis(r"C:\Windows\System32\msiexec.exe", racine));
    }

    #[test]
    fn refuse_un_binaire_distant() {
        assert!(!programme_admis(
            r"\\serveur\partage\unins.exe",
            r"C:\Windows"
        ));
    }

    #[test]
    fn accepte_un_desinstalleur_ordinaire() {
        let racine = r"C:\Windows";
        assert!(programme_admis(
            r"C:\Program Files\Mon Jeu\unins000.exe",
            racine
        ));
        assert!(programme_admis(r"D:\Jeux\X\uninstall.exe", racine));
        // Un dossier qui commence comme Windows sans en être : Windows Apps.
        assert!(programme_admis(r"C:\WindowsGames\X\unins.exe", racine));
    }

    #[test]
    fn refuse_ce_qui_n_est_pas_un_desinstalleur() {
        // Un exécutable inexistant, un script, un passage par l'interpréteur.
        // Les chemins sont complets : en relatif, le refus venait seulement de
        // ce que le fichier n'existait pas dans le dossier courant, ce qui
        // donnait une fausse assurance.
        assert!(!commande_admise(r"C:\introuvable\unins.exe", &[]));
        assert!(!commande_admise(
            r"C:\Windows\System32\cmd.exe",
            &["/c".into(), "rd /s /q C:\\Windows\\System32".into()]
        ));
        assert!(!commande_admise(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            &["-Command".into(), "rm".into()]
        ));
        assert!(!commande_admise("script.bat", &[]));
        // msiexec sans code produit ne désinstalle rien de précis.
        assert!(!commande_admise("msiexec.exe", &["/i".into()]));
        assert!(commande_admise("msiexec.exe", &["/X{1234}".into()]));
    }

    #[test]
    fn normalise_les_titres() {
        assert_eq!(normaliser_titre("PAYDAY 3"), "payday 3");
        assert_eq!(
            normaliser_titre("Marvel's Spider-Man"),
            "marvel s spider man"
        );
        assert_eq!(
            normaliser_titre("Tomb Raider: Definitive Edition"),
            "tomb raider"
        );
    }

    #[test]
    fn ne_confond_pas_deux_jeux_d_une_meme_serie() {
        assert!(score("Portal", "Portal 2", None, None).is_none());
        assert!(score("Half-Life", "Half-Life: Alyx", None, None).is_none());
        assert_eq!(score("Portal 2", "Portal 2", None, None), Some(90));
    }

    #[test]
    fn le_meme_dossier_prime_sur_le_nom() {
        // Deux noms sans rapport, un seul dossier : c'est bien la même chose.
        assert_eq!(
            score(
                "Mon Jeu",
                "Un nom tout autre",
                Some(r"C:\Jeux\MonJeu"),
                Some(r"C:\Jeux\MonJeu")
            ),
            Some(100)
        );
        // La barre finale et le séparateur de l'autre bord ne changent rien :
        // le registre écrit les deux.
        assert_eq!(
            score(
                "Mon Jeu",
                "Un nom tout autre",
                Some(r"C:\Jeux\MonJeu\"),
                Some("C:/Jeux/MonJeu")
            ),
            Some(100)
        );
    }

    /// Le défaut qui a désinstallé un lanceur à la place d'un jeu.
    ///
    /// Un dossier qui *contient* celui du jeu valait pour le même, et un
    /// lanceur s'installe précisément au-dessus de ses jeux : sa note était la
    /// meilleure possible, devant l'entrée du jeu lui-même. Les valeurs sont
    /// celles d'un registre réel, barre finale comprise.
    #[test]
    fn ne_prend_pas_le_lanceur_pour_un_de_ses_jeux() {
        assert!(score(
            "Fortnite",
            "Epic Games Launcher",
            Some(r"C:\Program Files\Epic Games\"),
            Some(r"C:\Program Files\Epic Games\Fortnite"),
        )
        .is_none());

        assert!(score(
            "Assassin's Creed Mirage",
            "Ubisoft Connect",
            Some(r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\"),
            Some(r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games\Assassin's Creed Mirage"),
        )
        .is_none());

        assert!(score(
            "Genshin Impact",
            "HoYoPlay",
            Some(r"C:\Program Files\HoYoPlay"),
            Some(r"C:\Program Files\HoYoPlay\games\Genshin Impact game"),
        )
        .is_none());
    }

    #[test]
    fn ne_prend_pas_un_composant_installe_dans_le_dossier_du_jeu() {
        assert!(score(
            "Mon Jeu",
            "Un greffon quelconque",
            Some(r"C:\Jeux\MonJeu\extras"),
            Some(r"C:\Jeux\MonJeu"),
        )
        .is_none());
    }

    #[test]
    fn refuse_un_lanceur_quand_on_cherche_un_jeu() {
        assert!(lanceur_etranger("Epic Games Launcher", "Fortnite"));
        assert!(lanceur_etranger("Steam", "Half-Life"));
        assert!(lanceur_etranger("Battle.net", "Diablo IV"));
        assert!(lanceur_etranger("Ubisoft Connect", "Far Cry 6"));
        // Avec son numéro de version, comme le registre l'écrit parfois.
        assert!(lanceur_etranger("Epic Games Launcher 17.2.1", "Fortnite"));

        // Le lanceur lui-même reste désinstallable.
        assert!(!lanceur_etranger(
            "Epic Games Launcher",
            "Epic Games Launcher"
        ));
        assert!(!lanceur_etranger("Steam", "Steam"));
        // Hytale s'installe par un lanceur qui porte son nom : le bloquer
        // priverait le jeu du seul désinstalleur qu'il ait.
        assert!(!lanceur_etranger("Hytale Launcher", "Hytale"));
        // Et un jeu dont le nom commence comme un lanceur reste un jeu.
        assert!(!lanceur_etranger("SteamWorld Dig", "SteamWorld Dig"));
        assert!(!lanceur_etranger("SteamWorld Dig", "Un autre jeu"));
    }

    #[test]
    fn un_nom_qui_ne_ressemble_a_rien_ne_correspond_pas() {
        assert!(score("Mon Jeu", "Microsoft Edge", None, None).is_none());
    }
}
