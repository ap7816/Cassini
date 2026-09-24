//! Icône d'une application du Microsoft Store, demandée au shell.
//!
//! Les launchers classiques laissent un exécutable, dont `icon_extract` tire
//! l'icône. Une application du Store, elle, vit dans `WindowsApps`, que
//! l'utilisateur n'a pas le droit de lire : impossible d'aller y chercher le
//! moindre fichier.
//!
//! Le shell, lui, sait la dessiner — c'est ce qu'il fait dans le menu
//! Démarrer. On la lui demande donc, au lieu d'embarquer une image dans le
//! dépôt : l'icône affichée est celle installée sur la machine, et rien de la
//! marque n'est copié ici.
//!
//! Deux étapes, toutes deux par le shell :
//!  - retrouver l'application d'après le préfixe de sa famille de paquet, en
//!    parcourant le dossier virtuel des applications ;
//!  - lui demander son image.

use base64::{engine::general_purpose, Engine as _};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    IEnumShellItems, IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName,
    SHGetKnownFolderItem, BHID_EnumItems, FOLDERID_AppsFolder, KF_FLAG_DEFAULT,
    SIGDN_PARENTRELATIVEPARSING, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

/// Initialise COM pour le fil courant, et le libère à la sortie.
///
/// Les commandes Tauri s'exécutent sur un fil de la réserve, qui n'a rien
/// initialisé. `RPC_E_CHANGED_MODE` signale un fil déjà initialisé autrement :
/// on s'en sert tel quel, sans le libérer.
struct Com(bool);

impl Com {
    fn nouveau() -> Self {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        Com(hr.is_ok())
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

/// Cible de lancement de la première application dont la famille commence
/// ainsi — par exemple `Microsoft.GamingApp_` pour l'application Xbox.
///
/// Le dossier virtuel des applications donne, pour chaque entrée, le nom que
/// le shell comprend : `famille!application`.
pub fn cible_application(prefixe_famille: &str) -> Option<String> {
    let _com = Com::nouveau();
    unsafe {
        let applications: IShellItem =
            SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None).ok()?;
        let entrees: IEnumShellItems = applications.BindToHandler(None, &BHID_EnumItems).ok()?;

        loop {
            let mut lot = [None; 1];
            let mut lues = 0;
            entrees.Next(&mut lot, Some(&mut lues)).ok()?;
            if lues == 0 {
                return None;
            }
            let entree = lot[0].take()?;
            let Ok(nom) = entree.GetDisplayName(SIGDN_PARENTRELATIVEPARSING) else { continue };
            let texte = chaine(nom);
            if texte.starts_with(prefixe_famille) {
                return Some(texte);
            }
        }
    }
}

/// Reprend une chaîne rendue par le shell, et rend la mémoire qu'il a allouée.
unsafe fn chaine(p: PWSTR) -> String {
    let texte = p.to_string().unwrap_or_default();
    windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const _));
    texte
}

/// Icône d'une application du Store, en `data:` URL.
///
/// `cible` est ce que rend `cible_application` : `famille!application`.
pub fn icone_application(cible: &str, taille: i32) -> Result<String, String> {
    let _com = Com::nouveau();
    let chemin = HSTRING::from(format!("shell:AppsFolder\\{cible}"));

    unsafe {
        let fabrique: IShellItemImageFactory = SHCreateItemFromParsingName(&chemin, None)
            .map_err(|e| format!("application introuvable : {e}"))?;

        // `BIGGERSIZEOK` : mieux vaut une image plus grande, que l'on réduira à
        // l'affichage, qu'une petite étirée.
        let bitmap: HBITMAP = fabrique
            .GetImage(SIZE { cx: taille, cy: taille }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK)
            .map_err(|e| format!("image indisponible : {e}"))?;

        let resultat = png_depuis_bitmap(bitmap, taille);
        let _ = DeleteObject(bitmap);
        resultat
    }
}

/// Lit les pixels d'un bitmap Windows et les encode en PNG base64.
unsafe fn png_depuis_bitmap(bitmap: HBITMAP, taille: i32) -> Result<String, String> {
    let ecran = GetDC(None);
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: taille,
            // Hauteur négative : l'image est lue de haut en bas, comme un PNG.
            biHeight: -taille,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut bgra = vec![0u8; (taille * taille * 4) as usize];
    let lignes = GetDIBits(
        ecran,
        bitmap,
        0,
        taille as u32,
        Some(bgra.as_mut_ptr() as *mut _),
        &mut info,
        DIB_RGB_COLORS,
    );
    ReleaseDC(None, ecran);
    if lignes == 0 {
        return Err("lecture des pixels impossible".into());
    }

    let mut rgba = Vec::with_capacity(bgra.len());
    for px in bgra.chunks_exact(4) {
        rgba.extend_from_slice(&[px[2], px[1], px[0], px[3]]);
    }

    let mut png: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&rgba, taille as u32, taille as u32, ColorType::Rgba8.into())
        .map_err(|e| format!("encodage PNG impossible : {e}"))?;
    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(png)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Une famille inconnue ne doit rien rendre — et surtout ne pas planter
    /// dans le parcours du dossier virtuel.
    #[test]
    fn une_famille_inconnue_ne_rend_rien() {
        assert!(cible_application("Famille.Qui.NExiste.Pas_").is_none());
    }

    #[test]
    fn une_cible_introuvable_rend_une_erreur() {
        assert!(icone_application("Famille.Qui.NExiste.Pas_abcdefghijklm!App", 64).is_err());
    }
}
