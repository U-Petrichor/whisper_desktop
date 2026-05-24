mod signal;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            signal::commands::signal_create_account,
            signal::commands::signal_get_key_status,
            signal::commands::signal_load_keys,
            signal::commands::signal_encrypt_message,
            signal::commands::signal_decrypt_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}