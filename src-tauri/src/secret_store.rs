// Stockage de la clé API SteamGridDB dans le gestionnaire d'identifiants de
// Windows (DPAPI), chiffré par l'OS avec les identifiants de la session.
//
// Pourquoi pas un hash : une clé API doit être transmise telle quelle au
// service distant pour authentifier la requête. Un hash étant irréversible,
// la clé ne pourrait plus jamais être utilisée. La bonne protection n'est
// donc pas de la rendre illisible pour nous, mais de la rendre illisible
// pour tout le reste — d'où le coffre système.
//
// Conséquence côté frontend : la clé ne transite plus jamais par le JS.
// Le frontend appelle `fetch_sgdb_image(title)` sans clé ; Rust la récupère
// du coffre au dernier moment.

use keyring::Entry;

const SERVICE: &str = "Cassini";

/// Nom du service avant le renommage de l'application.
///
/// Le coffre de Windows indexe par (service, compte) : changer le service rend
/// la clé déjà enregistrée introuvable. L'utilisateur ne verrait pas d'erreur,
/// seulement des jaquettes qui cessent d'arriver — le pire des symptômes, car
/// rien ne le relierait au renommage. `get_key` la déplace au premier accès.
const SERVICE_LEGACY: &str = "ArcHive";

const ACCOUNT: &str = "sgdb_api_key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("Coffre indisponible : {e}"))
}

/// Écrit la clé dans le coffre système. Une chaîne vide supprime l'entrée.
pub fn set_key(key: &str) -> Result<(), String> {
    let e = entry()?;
    let trimmed = key.trim();

    if trimmed.is_empty() {
        // `NoEntry` est un succès ici : la clé est déjà absente
        return match e.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("Suppression impossible : {err}")),
        };
    }

    if trimmed.len() > 512 {
        return Err("Clé API trop longue".into());
    }

    e.set_password(trimmed)
        .map_err(|err| format!("Enregistrement impossible : {err}"))
}

/// Lit la clé depuis le coffre. `None` si aucune clé n'est enregistrée.
/// Volontairement non exposée au frontend : seules les commandes Rust
/// qui en ont besoin l'appellent.
pub fn get_key() -> Option<String> {
    let e = entry().ok()?;
    if let Ok(k) = e.get_password() {
        if !k.trim().is_empty() {
            return Some(k);
        }
    }

    // Rien sous le nom actuel : la clé a pu être écrite avant le renommage.
    // On la recopie sous le nouveau service, puis on retire l'ancienne entrée.
    // Un échec de recopie n'est pas bloquant — la clé est rendue quand même,
    // et la migration sera retentée au prochain appel.
    let ancienne = Entry::new(SERVICE_LEGACY, ACCOUNT).ok()?;
    let k = ancienne.get_password().ok()?;
    if k.trim().is_empty() {
        return None;
    }

    if e.set_password(&k).is_ok() {
        let _ = ancienne.delete_credential();
    }
    Some(k)
}

/// Indique au frontend si une clé est configurée, sans jamais la révéler.
/// C'est tout ce dont l'écran de réglages a besoin pour son affichage.
pub fn has_key() -> bool {
    get_key().is_some()
}
