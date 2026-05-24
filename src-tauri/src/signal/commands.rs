use serde::{Deserialize, Serialize};

use sha2::Digest;

use super::engine::SignalCryptoEngine;
use super::models::*;
use super::state;

// ── Wire-format types (camelCase for Tauri IPC) ──────────────────────

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyBundleWire {
    pub identity_key_pub: String,
    pub signed_pre_key_id: u32,
    pub signed_pre_key_pub: String,
    pub signed_pre_key_sig: String,
    pub one_time_pre_keys: std::collections::HashMap<u32, String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalAccountResult {
    pub key_bundle: PreKeyBundleWire,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalKeyStatusResult {
    pub has_identity: bool,
    pub fingerprint: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalEnvelopeWire {
    pub sender_identity_public_key: String,
    pub header: MessageHeaderWire,
    pub ciphertext: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageHeaderWire {
    pub dh_pub_key: String,
    pub n: u32,
    pub pn: u32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub opk_id: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalKeyBundleInput {
    pub identity_public_key: String,
    pub signed_pre_key_id: u32,
    pub signed_pre_key_public: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: std::collections::HashMap<u32, String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalEnvelopeInput {
    pub sender_identity_public_key: String,
    pub header: MessageHeaderWire,
    pub ciphertext: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalDecryptResult {
    pub plaintext: String,
}

// ── Helpers ──────────────────────────────────────────────────────────

fn b64dec(s: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    BASE64.decode(s).map_err(|e| format!("base64 decode: {}", e))
}

fn b64enc(data: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    BASE64.encode(data)
}

fn input_to_prekey_bundle(input: &SignalKeyBundleInput) -> Result<PreKeyBundle, String> {
    let identity_key_pub = b64dec(&input.identity_public_key)?;
    let signed_prekey_pub = b64dec(&input.signed_pre_key_public)?;
    let signed_prekey_sig = b64dec(&input.signed_pre_key_signature)?;

    let one_time_prekeys: std::collections::HashMap<u32, Vec<u8>> = input
        .one_time_pre_keys
        .iter()
        .map(|(k, v)| b64dec(v).map(|d| (*k, d)))
        .collect::<Result<std::collections::HashMap<u32, Vec<u8>>, String>>()?;

    Ok(PreKeyBundle {
        identity_key_pub,
        signed_prekey_id: input.signed_pre_key_id,
        signed_prekey_pub,
        signed_prekey_sig,
        one_time_prekeys,
    })
}

fn bundle_to_wire(bundle: &PreKeyBundle) -> PreKeyBundleWire {
    PreKeyBundleWire {
        identity_key_pub: b64enc(&bundle.identity_key_pub),
        signed_pre_key_id: bundle.signed_prekey_id,
        signed_pre_key_pub: b64enc(&bundle.signed_prekey_pub),
        signed_pre_key_sig: b64enc(&bundle.signed_prekey_sig),
        one_time_pre_keys: bundle
            .one_time_prekeys
            .iter()
            .map(|(k, v)| (*k, b64enc(v)))
            .collect(),
    }
}

fn header_to_wire(header: &MessageHeader) -> MessageHeaderWire {
    MessageHeaderWire {
        dh_pub_key: b64enc(&header.dh_pub_key),
        n: header.n,
        pn: header.pn,
        opk_id: header.opk_id,
    }
}

fn wire_to_header(wire: &MessageHeaderWire) -> Result<MessageHeader, String> {
    Ok(MessageHeader {
        dh_pub_key: b64dec(&wire.dh_pub_key)?,
        n: wire.n,
        pn: wire.pn,
        opk_id: wire.opk_id,
    })
}

fn fingerprint(public_key: &[u8]) -> String {
    let hash = sha2::Sha256::digest(public_key);
    b64enc(&hash[..8])
}

// ── Tauri commands ───────────────────────────────────────────────────

#[tauri::command]
pub fn signal_create_account(
    user_id: u64,
    opk_count: Option<u32>,
) -> Result<SignalAccountResult, String> {
    let count = opk_count.unwrap_or(50);
    let (account_state, prekey_bundle) = SignalCryptoEngine::generate_initial_account(count);
    state::save_account(user_id, &account_state)?;

    Ok(SignalAccountResult {
        key_bundle: bundle_to_wire(&prekey_bundle),
    })
}

#[tauri::command]
pub fn signal_get_key_status(user_id: u64) -> Result<SignalKeyStatusResult, String> {
    let account = state::load_account(user_id)?;
    match account {
        Some(acc) => Ok(SignalKeyStatusResult {
            has_identity: true,
            fingerprint: Some(fingerprint(&acc.identity_key_pair.public)),
        }),
        None => Ok(SignalKeyStatusResult {
            has_identity: false,
            fingerprint: None,
        }),
    }
}

#[tauri::command]
pub fn signal_load_keys(
    user_id: u64,
    opk_count: Option<u32>,
) -> Result<SignalAccountResult, String> {
    let existing = state::load_account(user_id)?;
    if let Some(acc) = existing {
        let bundle = PreKeyBundle {
            identity_key_pub: acc.identity_key_pair.public.clone(),
            signed_prekey_id: acc.signed_prekey_pair.id,
            signed_prekey_pub: acc.signed_prekey_pair.public.clone(),
            signed_prekey_sig: acc.signed_prekey_pair.signature.clone(),
            one_time_prekeys: acc
                .opk_pool
                .iter()
                .map(|(k, v)| (*k, v.public.clone()))
                .collect(),
        };
        Ok(SignalAccountResult {
            key_bundle: bundle_to_wire(&bundle),
        })
    } else {
        let count = opk_count.unwrap_or(20);
        let (account_state, prekey_bundle) = SignalCryptoEngine::generate_initial_account(count);
        state::save_account(user_id, &account_state)?;
        Ok(SignalAccountResult {
            key_bundle: bundle_to_wire(&prekey_bundle),
        })
    }
}

#[tauri::command]
pub fn signal_encrypt_message(
    from_user_id: u64,
    to_user_id: u64,
    plaintext: String,
    recipient_bundle: SignalKeyBundleInput,
) -> Result<SignalEnvelopeWire, String> {
    let account = state::load_account(from_user_id)?.ok_or("No account state for sender")?;
    let bundle = input_to_prekey_bundle(&recipient_bundle)?;

    let existing_session = state::load_session(from_user_id, to_user_id)?;
    let session = match existing_session {
        Some(s) => s,
        None => {
            let (sess, _opk_id) = SignalCryptoEngine::initiate_session_as_sender(&account, &bundle);
            sess
        }
    };

    let (header, ciphertext, new_session) =
        SignalCryptoEngine::ratchet_encrypt(&session, plaintext.as_bytes());

    state::save_session(from_user_id, to_user_id, &new_session)?;

    Ok(SignalEnvelopeWire {
        sender_identity_public_key: b64enc(&account.identity_key_pair.public),
        header: header_to_wire(&header),
        ciphertext: b64enc(&ciphertext),
    })
}

#[tauri::command]
pub fn signal_decrypt_message(
    user_id: u64,
    from_user_id: u64,
    envelope: SignalEnvelopeInput,
) -> Result<SignalDecryptResult, String> {
    let account = state::load_account(user_id)?.ok_or("No account state for receiver")?;
    let header = wire_to_header(&envelope.header)?;
    let ciphertext = b64dec(&envelope.ciphertext)?;
    let sender_ik_pub = b64dec(&envelope.sender_identity_public_key)?;

    let existing_session = state::load_session(user_id, from_user_id)?;
    let session = match existing_session {
        Some(s) => s,
        None => {
            let (new_session, updated_account) =
                SignalCryptoEngine::initialize_session_as_receiver(&account, &header, &sender_ik_pub);
            state::save_account(user_id, &updated_account)?;
            new_session
        }
    };

    let (plaintext_bytes, new_session) =
        SignalCryptoEngine::ratchet_decrypt(&session, &header, &ciphertext)?;

    state::save_session(user_id, from_user_id, &new_session)?;

    let plaintext = String::from_utf8(plaintext_bytes)
        .map_err(|e| format!("plaintext is not valid UTF-8: {}", e))?;

    Ok(SignalDecryptResult { plaintext })
}