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
// Pour les URL de protocole (steam://, battlenet://…), on délègue à
// explorer.exe : il transmet la cible au shell puis se termine, si bien que le
// vrai processus est rattaché à la session Explorer et non à la nôtre.

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

/// Ouvre une URL de protocole ou un chemin via le shell, détaché.
///
/// Passer par explorer.exe plutôt que par ShellExecuteW est délibéré : le
/// processus finalement lancé devient un enfant de la session Explorer, donc
/// hors de portée du job de Cassini quelles que soient ses limitations.
pub fn open_via_shell(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
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
