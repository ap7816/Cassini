use base64::{engine::general_purpose, Engine as _};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

// Convertit une chaîne Rust en chaîne wide UTF-16 terminée par un null (nécessaire pour les API Windows)
fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

// Extrait l'icône d'un fichier .exe et la retourne encodée en PNG base64 data-URL
// Utilise les API GDI Windows : SHGetFileInfoW → DIBSection → DrawIconEx → PNG encode
pub fn file_icon_png_data_url(path: &str, size: i32) -> Result<String, String> {
    let wide = to_wide(path);

    // Étape 1 : récupère le handle HICON depuis le fichier via Shell API
    let mut sfi = SHFILEINFOW::default();
    let r = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut sfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };

    if r == 0 || sfi.hIcon.0.is_null() {
        return Err("Could not extract file icon.".to_string());
    }

    let hicon = sfi.hIcon;

    // Étape 2 : crée un DC écran et un DC mémoire pour le rendu hors-écran
    let hwnd = HWND(std::ptr::null_mut());

    let screen_dc = unsafe { GetDC(hwnd) };
    if screen_dc.0.is_null() {
        unsafe {
            let _ = DestroyIcon(hicon);
        }
        return Err("GetDC failed.".to_string());
    }

    let mem_dc = unsafe { CreateCompatibleDC(screen_dc) };
    if mem_dc.0.is_null() {
        unsafe {
            ReleaseDC(hwnd, screen_dc);
            let _ = DestroyIcon(hicon);
        }
        return Err("CreateCompatibleDC failed.".to_string());
    }

    // Étape 3 : crée une DIB 32 bpp (top-down) pour capturer les pixels avec transparence
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size, // Valeur négative = orientation top-down (ligne 0 en haut)
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default()],
    };

    let mut bits_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
    let hbitmap =
        unsafe { CreateDIBSection(screen_dc, &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0) }
            .map_err(|e| format!("CreateDIBSection failed: {e}"))?;

    if hbitmap.0.is_null() || bits_ptr.is_null() {
        unsafe {
            let _ = DeleteDC(mem_dc);
            ReleaseDC(hwnd, screen_dc);
            let _ = DestroyIcon(hicon);
        }
        return Err("CreateDIBSection returned null.".to_string());
    }

    let old = unsafe { SelectObject(mem_dc, hbitmap) };

    // Étape 4 : dessine l'icône dans le bitmap mémoire
    unsafe { DrawIconEx(mem_dc, 0, 0, hicon, size, size, 0, None, DI_NORMAL) }
        .map_err(|e| format!("DrawIconEx failed: {e}"))?;

    // Étape 5 : lit les pixels BGRA bruts et les convertit en RGBA (format PNG standard)
    let byte_len = (size * size * 4) as usize;
    let src = unsafe { std::slice::from_raw_parts(bits_ptr as *const u8, byte_len) };
    let mut rgba = Vec::with_capacity(byte_len);

    for px in src.chunks_exact(4) {
        // Permutation des canaux : BGRA (Windows GDI) → RGBA (PNG)
        rgba.push(px[2]); // R
        rgba.push(px[1]); // G
        rgba.push(px[0]); // B
        rgba.push(px[3]); // A
    }

    // Libère toutes les ressources GDI et l'icône
    unsafe {
        SelectObject(mem_dc, old);
        let _ = DeleteObject(hbitmap);
        let _ = DeleteDC(mem_dc);
        ReleaseDC(hwnd, screen_dc);
        let _ = DestroyIcon(hicon);
    }

    // Étape 6 : encode les pixels RGBA en PNG puis en base64 data-URL
    let mut png_bytes: Vec<u8> = Vec::new();
    let enc = PngEncoder::new(&mut png_bytes);
    enc.write_image(&rgba, size as u32, size as u32, ColorType::Rgba8.into())
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    let b64 = general_purpose::STANDARD.encode(png_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}
