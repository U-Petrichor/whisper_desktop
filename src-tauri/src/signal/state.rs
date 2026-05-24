use std::fs;
use std::path::PathBuf;

use super::models::{LocalAccountState, SessionState};

fn signal_dir() -> PathBuf {
    let data_dir = dirs::data_dir().expect("cannot determine app data directory");
    data_dir.join("whisper-desktop").join("signal")
}

fn account_path(user_id: u64) -> PathBuf {
    signal_dir().join(format!("user-{}-account.json", user_id))
}

fn session_path(user_id: u64, peer_id: u64) -> PathBuf {
    signal_dir().join(format!("user-{}-peer-{}-session.json", user_id, peer_id))
}

fn ensure_dir() {
    let dir = signal_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).expect("cannot create signal data directory");
    }
}

pub fn save_account(user_id: u64, state: &LocalAccountState) -> Result<(), String> {
    ensure_dir();
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(account_path(user_id), json).map_err(|e| e.to_string())
}

pub fn load_account(user_id: u64) -> Result<Option<LocalAccountState>, String> {
    let path = account_path(user_id);
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let state: LocalAccountState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(Some(state))
}

pub fn save_session(user_id: u64, peer_id: u64, session: &SessionState) -> Result<(), String> {
    ensure_dir();
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    fs::write(session_path(user_id, peer_id), json).map_err(|e| e.to_string())
}

pub fn load_session(user_id: u64, peer_id: u64) -> Result<Option<SessionState>, String> {
    let path = session_path(user_id, peer_id);
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let session: SessionState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(Some(session))
}

pub fn account_exists(user_id: u64) -> bool {
    account_path(user_id).exists()
}

pub fn delete_account(user_id: u64) -> Result<(), String> {
    let path = account_path(user_id);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn delete_session(user_id: u64, peer_id: u64) -> Result<(), String> {
    let path = session_path(user_id, peer_id);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}