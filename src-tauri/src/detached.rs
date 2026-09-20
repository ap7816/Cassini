// Lancement de programmes externes totalement détachés de Cassini.
//
// Problème résolu : sous Windows, un processus créé par `Command::spawn()`
// hérite du *job object* de son parent. La pile WebView2 sur laquelle repose
// Tauri place l'application dans un job configuré pour tuer ses membres à la
// fermeture — conséquence, fermer Cassini éteignait Steam (ou tout autre
// launcher qu'il avait démarré), puisque celui-ci se retrouvait dans le même
// job.
//
// Deux mécanismes combinés ici :
//   - CREATE_BREAKAWAY_FROM_JOB : sort explicitement le nouveau processus du
//     job. Nécessite que le job l'autorise (JOB_OBJECT_LIMIT_BREAKAWAY_OK),
//     d'où le repli si l'appel échoue.
//   - DETACHED_PROCESS : pas de console héritée, aucun lien d'entrée/sortie.
//
// Le lancement final passe par un relais court, qui transmet la cible au shell
// puis se termine : le vrai processus est rattaché à ce relais, et non à nous.
// Un chemin passe par explorer.exe, une URL de protocole par
// `url.dll,FileProtocolHandler` (voir `open_via_shell`).

#[cfg(target_os = "windows")]
mod flags {
    pub const DETACHED_PROCESS: u32 = 0x0000_0008;
    pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    pub const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
}

/// Lance `program` avec `args`, sans aucun lien de cycle de vie avec Cassini.
pub fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};

        let build = |extra: u32| {
            let mut c = Command::new(program);
            c.args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(
                    flags::DETACHED_PROCESS | flags::CREATE_NEW_PROCESS_GROUP | extra,
                );
            c
        };

        // Tentative avec sortie du job ; certains jobs l'interdisent, auquel
        // cas CreateProcess échoue et on retente sans ce drapeau.
        match build(flags::CREATE_BREAKAWAY_FROM_JOB).spawn() {
            Ok(_) => Ok(()),
            Err(_) => build(0).spawn().map(|_| ()).map_err(|e| e.to_string()),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::{Command, Stdio};
        Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// Code Windows signalant qu'un programme exige les droits administrateur.
#[cfg(target_os = "windows")]
const ERROR_ELEVATION_REQUIRED: i32 = 740;

/// Lance un programme en laissant Windows demander l'élévation si besoin.
///
/// `CreateProcess` — donc `spawn_detached` — ne sait pas élever : face à un
/// exécutable qui réclame les droits administrateur, il échoue avec l'erreur
/// 740 sans rien afficher. C'est le cas de beaucoup de désinstalleurs, qui
/// touchent à `Program Files` et à la base de registre.
///
/// On tente donc d'abord le lancement détaché, qui a l'avantage de survivre à
/// la fermeture de Cassini ; et seulement si Windows réclame une élévation, on
/// repasse par le shell, qui affiche l'invite UAC. Le programme élevé est
/// lancé par le service d'élévation du système, hors de notre job : il survit
/// donc lui aussi.
#[cfg(target_os = "windows")]
pub fn spawn_avec_elevation(program: &str, args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    let tentative = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(
            flags::DETACHED_PROCESS | flags::CREATE_NEW_PROCESS_GROUP | flags::CREATE_BREAKAWAY_FROM_JOB,
        )
        .spawn();

    match tentative {
        Ok(_) => return Ok(()),
        Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => {}
        // Le job peut interdire la sortie : on retente sans, comme ailleurs.
        Err(_) => {
            match Command::new(program)
                .args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(flags::DETACHED_PROCESS | flags::CREATE_NEW_PROCESS_GROUP)
                .spawn()
            {
                Ok(_) => return Ok(()),
                Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }

    shell_execute(program, args)
}

/// Passe la main au shell, qui affiche l'invite d'élévation.
///
/// Les arguments sont regroupés en une ligne de commande, comme l'API
/// l'attend. Aucune interprétation par un interpréteur n'a lieu : la ligne
/// n'est relue que par le programme visé, lequel a déjà été validé côté
/// appelant (voir `uninstall::commande_admise`).
#[cfg(target_os = "windows")]
fn shell_execute(program: &str, args: &[&str]) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let ligne = args
        .iter()
        .map(|a| if a.contains(' ') && !a.starts_with('"') { format!("\"{a}\"") } else { (*a).to_string() })
        .collect::<Vec<_>>()
        .join(" ");

    let fichier = HSTRING::from(program);
    let parametres = HSTRING::from(ligne);

    // `ShellExecuteW` rend une valeur supérieure à 32 quand elle a réussi ;
    // en dessous, c'est un code d'erreur — dont l'annulation de l'invite UAC.
    let code = unsafe {
        ShellExecuteW(
            None,
            &HSTRING::new(),
            &fichier,
            &parametres,
            &HSTRING::new(),
            SW_SHOWNORMAL,
        )
    };

    match code.0 as isize {
        n if n > 32 => Ok(()),
        // Codes hérités de ShellExecute. Le premier est le plus fréquent :
        // c'est l'invite d'élévation refusée ou fermée par l'utilisateur.
        5 => Err("Élévation refusée".to_string()),
        2 => Err("Programme introuvable".to_string()),
        3 => Err("Chemin introuvable".to_string()),
        31 => Err("Aucun programme associé à ce fichier".to_string()),
        n => Err(format!("Le lancement a échoué (code {n})")),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn spawn_avec_elevation(program: &str, args: &[&str]) -> Result<(), String> {
    spawn_detached(program, args)
}

/// Vrai pour une cible de protocole — `steam://…` — et non un chemin de fichier.
///
/// `C:\jeu.exe` n'en est pas une : le deux-points y suit une seule lettre, et
/// aucun `//` ne le suit.
pub fn est_url(target: &str) -> bool {
    let Some(i) = target.find("://") else { return false };
    i > 0
        && target[..i]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
}

/// Ouvre une URL de protocole ou un chemin via le shell, détaché.
///
/// Deux relais, jamais un interpréteur de commandes : `cmd /c start` traitait
/// `&` et `|` comme des séparateurs, ce qui rendait la cible injectable.
///
/// - Un chemin passe par explorer.exe : le processus lancé devient un enfant
///   de la session Explorer, donc hors de portée du job de Cassini, quelles
///   que soient ses limitations.
/// - Une URL passe par `url.dll,FileProtocolHandler`. Explorer, lui, ouvre le
///   dossier Documents dès que l'URL porte une requête — mesuré avec
///   `https://example.com/?a=1&b=2`, et c'est ce qui arrivait en lançant un
///   jeu Epic, dont l'URL finit par `?action=launch&silent=true`. Le relais
///   `rundll32` est lui aussi lancé détaché : ce qu'il démarre sort du job
///   avec lui.
pub fn open_via_shell(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if est_url(target) {
            // Rust cite un argument qui contient une espace ; un guillemet
            // dans la cible ressortirait tel quel côté gestionnaire.
            if target.contains('"') {
                return Err("Cible de lancement invalide".to_string());
            }
            return spawn_detached("rundll32.exe", &["url.dll,FileProtocolHandler", target]);
        }
        spawn_detached("explorer.exe", &[target])
    }
    #[cfg(target_os = "macos")]
    {
        spawn_detached("open", &[target])
    }
    #[cfg(target_os = "linux")]
    {
        spawn_detached("xdg-open", &[target])
    }
}


#[cfg(test)]
mod tests {
    use super::est_url;

    #[test]
    fn reconnait_les_url_de_protocole() {
        assert!(est_url("steam://rungameid/440"));
        assert!(est_url("com.epicgames.launcher://apps/Brill?action=launch&silent=true"));
        assert!(est_url("uplay://launch/123/0"));
    }

    #[test]
    fn un_chemin_windows_n_est_pas_une_url() {
        assert!(!est_url(r"C:\Program Files\Jeu\jeu.exe"));
        assert!(!est_url(r"\serveur\partage\jeu.exe"));
        assert!(!est_url("jeu.exe"));
        assert!(!est_url("://sans-schema"));
    }
}
