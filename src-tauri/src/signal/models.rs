use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Asymmetric key pair (raw bytes).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KeyPair {
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub public: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub private: Vec<u8>,
}

/// Signed pre-key pair with id and Ed25519 signature.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SignedPreKeyPair {
    pub id: u32,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub public: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub private: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub signature: Vec<u8>,
}

/// Internal Double Ratchet session state.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionInternalState {
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub root_key: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_bytes_option")]
    pub sending_chain_key: Option<Vec<u8>>,
    #[serde(with = "crate::signal::models::base64_bytes_option")]
    pub receiving_chain_key: Option<Vec<u8>>,
    pub dh_key_pair: KeyPair,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub remote_dh_pub_key: Vec<u8>,
    pub ns: u32,
    pub nr: u32,
    pub pn: u32,
    #[serde(with = "crate::signal::models::base64_u64_bytes_map")]
    pub skipped_message_keys: HashMap<u64, Vec<u8>>,
}

/// Double Ratchet session state (immutable snapshot).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionState {
    pub internal_state: SessionInternalState,
}

/// Local account private state (identity + signed prekey + OPK pool).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LocalAccountState {
    pub identity_key_pair: KeyPair,
    pub signed_prekey_pair: SignedPreKeyPair,
    pub opk_pool: HashMap<u32, KeyPair>,
}

/// Public pre-key bundle for distribution to remote peers.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PreKeyBundle {
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub identity_key_pub: Vec<u8>,
    pub signed_prekey_id: u32,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub signed_prekey_pub: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub signed_prekey_sig: Vec<u8>,
    #[serde(with = "crate::signal::models::base64_u32_bytes_map")]
    pub one_time_prekeys: HashMap<u32, Vec<u8>>,
}

/// Message header attached to each ciphertext.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MessageHeader {
    #[serde(with = "crate::signal::models::base64_bytes")]
    pub dh_pub_key: Vec<u8>,
    pub n: u32,
    pub pn: u32,
}

// ── Serde helpers ────────────────────────────────────────────────────

pub mod base64_bytes {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(data: &Vec<u8>, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&BASE64.encode(data))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let s = String::deserialize(d)?;
        BASE64.decode(&s).map_err(serde::de::Error::custom)
    }
}

pub mod base64_bytes_option {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(data: &Option<Vec<u8>>, s: S) -> Result<S::Ok, S::Error> {
        match data {
            Some(v) => s.serialize_str(&BASE64.encode(v)),
            None => s.serialize_str(""),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Vec<u8>>, D::Error> {
        let s = String::deserialize(d)?;
        if s.is_empty() {
            Ok(None)
        } else {
            BASE64.decode(&s).map(Some).map_err(serde::de::Error::custom)
        }
    }
}

pub mod base64_u32_bytes_map {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::HashMap;

    pub fn serialize<S: Serializer>(data: &HashMap<u32, Vec<u8>>, s: S) -> Result<S::Ok, S::Error> {
        let encoded: HashMap<u32, String> = data
            .iter()
            .map(|(k, v)| (*k, BASE64.encode(v)))
            .collect();
        encoded.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<HashMap<u32, Vec<u8>>, D::Error> {
        let map: HashMap<u32, String> = HashMap::deserialize(d)?;
        map.into_iter()
            .map(|(k, v)| BASE64.decode(&v).map(|d| (k, d)).map_err(serde::de::Error::custom))
            .collect()
    }
}

pub mod base64_u64_bytes_map {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::HashMap;

    pub fn serialize<S: Serializer>(data: &HashMap<u64, Vec<u8>>, s: S) -> Result<S::Ok, S::Error> {
        let encoded: HashMap<u64, String> = data
            .iter()
            .map(|(k, v)| (*k, BASE64.encode(v)))
            .collect();
        encoded.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<HashMap<u64, Vec<u8>>, D::Error> {
        let map: HashMap<u64, String> = HashMap::deserialize(d)?;
        map.into_iter()
            .map(|(k, v)| BASE64.decode(&v).map(|d| (k, d)).map_err(serde::de::Error::custom))
            .collect()
    }
}