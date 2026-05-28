// Empêche l'ouverture d'une fenêtre console supplémentaire en mode release sous Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Point d'entrée du processus : délègue immédiatement à la fonction run() de la lib
fn main() {
    tauri_app_lib::run()
}
