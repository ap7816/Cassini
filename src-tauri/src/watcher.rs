//! Veille sur ce qui change la bibliothèque, pour la rafraîchir aussitôt.
//!
//! Sans elle, un jeu installé ou désinstallé n'apparaissait qu'au prochain
//! scan : au démarrage, au retour sur la fenêtre, ou sur un clic d'« Actualiser ».
//! Désinstaller un jeu depuis Steam pendant que Cassini reste affiché laissait
//! sa planète « installée ».
//!
//! Deux sources, parce que les launchers n'écrivent pas tous au même endroit :
//! - les manifestes de Steam (`steamapps/appmanifest_*.acf`) et d'Epic
//!   (`Manifests/*.item`), surveillés par `notify` ;
//! - les clés « Uninstall » du registre, où s'inscrivent les jeux de
//!   Battle.net, Riot, Ubisoft, Rockstar, et le lanceur d'Hytale.
//!
//! La veille ne scanne rien elle-même : elle prévient l'interface, qui relance
//! le scan habituel. Les rafales — une installation touche plusieurs fichiers
//! et plusieurs clés — sont regroupées en un seul signal.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;

use notify::event::ModifyKind;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Événement émis vers l'interface quand la bibliothèque a pu changer.
pub const EVENEMENT: &str = "bibliotheque-changee";

/// Silence attendu après le dernier changement avant de prévenir l'interface.
const CALME: Duration = Duration::from_millis(1500);

pub fn demarrer(app: AppHandle, dossiers: Vec<PathBuf>) {
    let (tx, rx) = mpsc::channel::<()>();
    surveiller_dossiers(tx.clone(), dossiers);
    #[cfg(windows)]
    surveiller_registre(tx);

    let _ = std::thread::Builder::new()
        .name("veille-bibliotheque".into())
        .spawn(move || {
            while rx.recv().is_ok() {
                // Attendre que la rafale se calme.
                loop {
                    match rx.recv_timeout(CALME) {
                        Ok(()) => continue,
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
                let _ = app.emit(EVENEMENT, ());
            }
        });
}

fn surveiller_dossiers(tx: Sender<()>, dossiers: Vec<PathBuf>) {
    if dossiers.is_empty() {
        return;
    }
    let watcher = notify::recommended_watcher(move |ev: notify::Result<Event>| {
        if let Ok(ev) = ev {
            if pertinent(&ev) {
                let _ = tx.send(());
            }
        }
    });
    let Ok(mut watcher) = watcher else { return };

    let mut actif = false;
    for d in &dossiers {
        actif |= watcher.watch(d, RecursiveMode::NonRecursive).is_ok();
    }
    if actif {
        // Vit aussi longtemps que l'application.
        Box::leak(Box::new(watcher));
    }
}

/// Seules l'apparition et la disparition d'un manifeste comptent.
///
/// Steam réécrit le manifeste d'un jeu tout au long d'un téléchargement ou
/// d'une mise à jour : réagir à chaque modification relancerait un scan toutes
/// les deux secondes pendant des heures.
fn pertinent(ev: &Event) -> bool {
    matches!(
        ev.kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    ) && ev.paths.iter().any(|p| est_manifeste(p))
}

fn est_manifeste(p: &Path) -> bool {
    let nom = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    (nom.starts_with("appmanifest_") && nom.ends_with(".acf")) || nom.ends_with(".item")
}

/// Un fil par clé, bloqué sur `RegNotifyChangeKeyValue` jusqu'au prochain
/// ajout ou retrait de sous-clé — une installation ou une désinstallation.
#[cfg(windows)]
fn surveiller_registre(tx: Sender<()>) {
    const CHEMIN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    const CHEMIN_32: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

    for (machine, chemin) in [(true, CHEMIN), (true, CHEMIN_32), (false, CHEMIN)] {
        let tx = tx.clone();
        let _ = std::thread::Builder::new()
            .name("veille-registre".into())
            .spawn(move || veiller_cle(machine, chemin, tx));
    }
}

#[cfg(windows)]
fn veiller_cle(machine: bool, chemin: &str, tx: Sender<()>) {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
        HKEY_LOCAL_MACHINE, KEY_NOTIFY, REG_NOTIFY_CHANGE_NAME,
    };

    let racine = if machine { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
    let mut cle = HKEY::default();
    // SAFETY : `cle` n'est utilisée qu'après une ouverture réussie, et fermée
    // à la sortie de la boucle.
    unsafe {
        if RegOpenKeyExW(racine, &HSTRING::from(chemin), 0, KEY_NOTIFY, &mut cle).is_err() {
            return;
        }
        while RegNotifyChangeKeyValue(cle, true, REG_NOTIFY_CHANGE_NAME, HANDLE::default(), false)
            .is_ok()
        {
            if tx.send(()).is_err() {
                break;
            }
        }
        let _ = RegCloseKey(cle);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, RemoveKind};

    fn ev(kind: EventKind, chemin: &str) -> Event {
        Event::new(kind).add_path(PathBuf::from(chemin))
    }

    #[test]
    fn reconnait_les_manifestes_de_steam_et_d_epic() {
        assert!(est_manifeste(Path::new(r"D:\SteamLibrary\steamapps\appmanifest_620.acf")));
        assert!(est_manifeste(Path::new(r"C:\ProgramData\Epic\Manifests\ABC123.item")));
        assert!(!est_manifeste(Path::new(r"D:\SteamLibrary\steamapps\libraryfolders.vdf")));
        assert!(!est_manifeste(Path::new(r"D:\SteamLibrary\steamapps\appmanifest_620.acf.tmp")));
    }

    #[test]
    fn reagit_a_une_installation_et_a_une_desinstallation() {
        let acf = r"D:\SteamLibrary\steamapps\appmanifest_620.acf";
        assert!(pertinent(&ev(EventKind::Create(CreateKind::File), acf)));
        assert!(pertinent(&ev(EventKind::Remove(RemoveKind::File), acf)));
    }

    #[test]
    fn ignore_la_reecriture_d_un_manifeste_pendant_un_telechargement() {
        let acf = r"D:\SteamLibrary\steamapps\appmanifest_620.acf";
        assert!(!pertinent(&ev(EventKind::Modify(ModifyKind::Data(DataChange::Content)), acf)));
    }

    #[test]
    fn ignore_les_autres_fichiers() {
        let vdf = r"D:\SteamLibrary\steamapps\libraryfolders.vdf";
        assert!(!pertinent(&ev(EventKind::Create(CreateKind::File), vdf)));
    }
}
