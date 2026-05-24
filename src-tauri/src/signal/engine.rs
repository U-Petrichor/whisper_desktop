use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit};
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use num_bigint::BigUint;
use num_traits::Zero;
use sha2::{Digest, Sha256, Sha512};
use std::collections::HashMap;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519StaticSecret};

use super::models::*;

const HKDF_INFO: &[u8] = b"WhisperSignalX3DH";
const ROOT_RATCHET_INFO: &[u8] = b"WhisperRootRatchet";
const CURVE25519_FIELD_PRIME: [u8; 32] = [
    0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x7f,
];

pub struct SignalCryptoEngine;

impl SignalCryptoEngine {
    pub fn generate_initial_account(opk_count: u32) -> (LocalAccountState, PreKeyBundle) {
        let mut rng = rand::thread_rng();

        let identity_sk = SigningKey::generate(&mut rng);
        let identity_pk = identity_sk.verifying_key();
        let identity_key_pair = KeyPair {
            public: identity_pk.to_bytes().to_vec(),
            private: identity_sk.to_bytes().to_vec(),
        };

        // Signed prekey is X25519-native (used for DH, not signing)
        let signed_prekey_sk = X25519StaticSecret::random_from_rng(&mut rng);
        let signed_prekey_pk = X25519PublicKey::from(&signed_prekey_sk);
        let spk_signature = identity_sk.sign(signed_prekey_pk.as_bytes());
        let signed_prekey_id: u32 = 1;

        let signed_prekey_pair = SignedPreKeyPair {
            id: signed_prekey_id,
            public: signed_prekey_pk.as_bytes().to_vec(),
            private: signed_prekey_sk.to_bytes().to_vec(),
            signature: spk_signature.to_bytes().to_vec(),
        };

        let mut opk_pool = HashMap::new();
        let mut one_time_prekeys = HashMap::new();
        for i in 1..=opk_count {
            let opk_sk = X25519StaticSecret::random_from_rng(&mut rng);
            let opk_pk = X25519PublicKey::from(&opk_sk);
            opk_pool.insert(i, KeyPair {
                public: opk_pk.as_bytes().to_vec(),
                private: opk_sk.to_bytes().to_vec(),
            });
            one_time_prekeys.insert(i, opk_pk.as_bytes().to_vec());
        }

        let account_state = LocalAccountState {
            identity_key_pair,
            signed_prekey_pair,
            opk_pool,
        };

        let prekey_bundle = PreKeyBundle {
            identity_key_pub: account_state.identity_key_pair.public.clone(),
            signed_prekey_id,
            signed_prekey_pub: account_state.signed_prekey_pair.public.clone(),
            signed_prekey_sig: account_state.signed_prekey_pair.signature.clone(),
            one_time_prekeys,
        };

        (account_state, prekey_bundle)
    }

    pub fn rotate_signed_prekey(state: &LocalAccountState) -> (LocalAccountState, u32, Vec<u8>, Vec<u8>) {
        let mut rng = rand::thread_rng();
        // Signed prekey is X25519-native
        let new_sk = X25519StaticSecret::random_from_rng(&mut rng);
        let new_pk = X25519PublicKey::from(&new_sk);
        let signature = SigningKey::from_bytes(&{
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&state.identity_key_pair.private);
            arr
        })
        .sign(new_pk.as_bytes());

        let new_id = state.signed_prekey_pair.id + 1;

        let new_state = LocalAccountState {
            identity_key_pair: state.identity_key_pair.clone(),
            signed_prekey_pair: SignedPreKeyPair {
                id: new_id,
                public: new_pk.as_bytes().to_vec(),
                private: new_sk.to_bytes().to_vec(),
                signature: signature.to_bytes().to_vec(),
            },
            opk_pool: state.opk_pool.clone(),
        };

        (new_state, new_id, new_pk.as_bytes().to_vec(), signature.to_bytes().to_vec())
    }

    pub fn replenish_one_time_prekeys(
        state: &LocalAccountState,
        count: u32,
    ) -> (LocalAccountState, HashMap<u32, Vec<u8>>) {
        let mut rng = rand::thread_rng();
        let start_id = state.opk_pool.keys().max().copied().unwrap_or(0) + 1;
        let mut new_opk_pool = state.opk_pool.clone();
        let mut new_one_time_prekeys = HashMap::new();

        for i in 0..count {
            let id = start_id + i;
            let opk_sk = X25519StaticSecret::random_from_rng(&mut rng);
            let opk_pk = X25519PublicKey::from(&opk_sk);
            new_opk_pool.insert(id, KeyPair {
                public: opk_pk.as_bytes().to_vec(),
                private: opk_sk.to_bytes().to_vec(),
            });
            new_one_time_prekeys.insert(id, opk_pk.as_bytes().to_vec());
        }

        let new_state = LocalAccountState {
            identity_key_pair: state.identity_key_pair.clone(),
            signed_prekey_pair: state.signed_prekey_pair.clone(),
            opk_pool: new_opk_pool,
        };

        (new_state, new_one_time_prekeys)
    }

    /// Returns (SessionState, opk_id_used) — opk_id is Some if an OPK was used in DH4.
    pub fn initiate_session_as_sender(
        state: &LocalAccountState,
        bundle: &PreKeyBundle,
    ) -> (SessionState, Option<u32>) {
        let mut rng = rand::thread_rng();

        // Verify signed prekey signature
        let sender_ik = SigningKey::from_bytes(&{
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&state.identity_key_pair.private);
            arr
        });

        // Verify the remote's signed prekey
        let remote_ik_pk_bytes = &bundle.identity_key_pub;
        let remote_spk_bytes = &bundle.signed_prekey_pub;
        let remote_spk_sig = &bundle.signed_prekey_sig;

        let remote_ik_vk = VerifyingKey::from_bytes(
            &{
                let mut arr = [0u8; 32];
                arr.copy_from_slice(remote_ik_pk_bytes);
                arr
            },
        )
        .expect("invalid remote identity key");
        let sig_arr: [u8; 64] = {
            let mut arr = [0u8; 64];
            arr.copy_from_slice(remote_spk_sig);
            arr
        };
        remote_ik_vk
            .verify(remote_spk_bytes, &ed25519_dalek::Signature::from_bytes(&sig_arr))
            .expect("signed prekey signature verification failed");

        // X3DH
        let ik_a_priv = ed25519_private_to_x25519_private(&sender_ik.to_bytes());
        let ik_b_pub = ed25519_public_to_x25519_public(remote_ik_pk_bytes);
        // SPK is X25519-native — use directly, no Ed25519 conversion needed
        let spk_b_pub = bytes_to_x25519_pub(remote_spk_bytes);
        let ek_a = X25519StaticSecret::random_from_rng(&mut rng);
        let ek_a_pub = X25519PublicKey::from(&ek_a);

        // DH computations
        let dh1 = X25519StaticSecret::from(ik_a_priv).diffie_hellman(&ik_b_pub);
        let dh2 = X25519StaticSecret::from(ik_a_priv).diffie_hellman(&spk_b_pub);
        let dh3 = ek_a.diffie_hellman(&spk_b_pub);

        let mut dh_concat = Vec::new();
        dh_concat.extend_from_slice(dh1.as_bytes());
        dh_concat.extend_from_slice(dh2.as_bytes());
        dh_concat.extend_from_slice(dh3.as_bytes());

        // DH4: use OPK if available — OPKs are X25519-native, use directly
        let (opk_used, dh_concat) = if let Some(lowest_id) = select_lowest_prekey_id(&bundle.one_time_prekeys) {
            let opk_b_pub = bytes_to_x25519_pub(&bundle.one_time_prekeys[&lowest_id]);
            let dh4 = ek_a.diffie_hellman(&opk_b_pub);
            let mut full = dh_concat;
            full.extend_from_slice(dh4.as_bytes());
            (Some(lowest_id), full)
        } else {
            (None, dh_concat)
        };

        // HKDF root key
        let hk = Hkdf::<Sha256>::new(Some(HKDF_INFO), &dh_concat);
        let mut root_key = [0u8; 32];
        hk.expand(b"root_key", &mut root_key)
            .expect("HKDF expand failed for root key");
        let mut chain_key = [0u8; 32];
        hk.expand(b"chain_key", &mut chain_key)
            .expect("HKDF expand failed for chain key");

        // Build session
        let session = build_session_state(
            root_key.to_vec(),
            Some(chain_key.to_vec()),
            None,
            KeyPair {
                public: ek_a_pub.as_bytes().to_vec(),
                private: ek_a.to_bytes().to_vec(),
            },
            spk_b_pub.as_bytes().to_vec(),
            0,
            0,
            0,
            opk_used,
        );

        (session, opk_used)
    }

    pub fn initialize_session_as_receiver(
        state: &LocalAccountState,
        header: &MessageHeader,
        alice_ik_pub: &[u8],
    ) -> (SessionState, LocalAccountState) {
        let bob_ik = SigningKey::from_bytes(&{
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&state.identity_key_pair.private);
            arr
        });

        // SPK private is X25519-native — use directly, no Ed25519 conversion needed
        let bob_spk_priv_bytes: [u8; 32] = {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&state.signed_prekey_pair.private);
            arr
        };
        let bob_spk = X25519StaticSecret::from(bob_spk_priv_bytes);

        // X3DH
        let ik_a_pub = ed25519_public_to_x25519_public(alice_ik_pub);
        // Ephemeral key is X25519-native — use directly
        let ek_a_pub = bytes_to_x25519_pub(&header.dh_pub_key);
        let ik_b_priv = ed25519_private_to_x25519_private(&bob_ik.to_bytes());
        let _ik_b_pub = X25519PublicKey::from(&X25519StaticSecret::from(ik_b_priv));

        let dh1 = X25519StaticSecret::from(ik_b_priv).diffie_hellman(&ik_a_pub);
        let dh2 = bob_spk.diffie_hellman(&ik_a_pub);
        let dh3 = bob_spk.diffie_hellman(&ek_a_pub);

        let mut dh_concat = Vec::new();
        dh_concat.extend_from_slice(dh1.as_bytes());
        dh_concat.extend_from_slice(dh2.as_bytes());
        dh_concat.extend_from_slice(dh3.as_bytes());

        // Use the OPK ID from the message header (sent by Alice) instead of guessing
        let mut new_opk_pool = state.opk_pool.clone();
        if let Some(opk_id) = header.opk_id {
            if let Some(opk_kp) = new_opk_pool.remove(&opk_id) {
                // OPK private is X25519-native — use directly
                let opk_priv_bytes: [u8; 32] = {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&opk_kp.private);
                    arr
                };
                let opk_priv = X25519StaticSecret::from(opk_priv_bytes);
                let dh4 = opk_priv.diffie_hellman(&ek_a_pub);
                dh_concat.extend_from_slice(dh4.as_bytes());
            }
        }

        let hk = Hkdf::<Sha256>::new(Some(HKDF_INFO), &dh_concat);
        let mut root_key = [0u8; 32];
        hk.expand(b"root_key", &mut root_key)
            .expect("HKDF expand failed for root key");
        let mut chain_key = [0u8; 32];
        hk.expand(b"chain_key", &mut chain_key)
            .expect("HKDF expand failed for chain_key");

        let session = build_session_state(
            root_key.to_vec(),
            None,
            Some(chain_key.to_vec()),
            KeyPair {
                public: ed25519_public_to_x25519_public(&state.identity_key_pair.public)
                    .as_bytes()
                    .to_vec(),
                private: ik_b_priv.to_vec(),
            },
            ek_a_pub.as_bytes().to_vec(),
            0,
            0,
            0,
            None,
        );

        let new_account = LocalAccountState {
            identity_key_pair: state.identity_key_pair.clone(),
            signed_prekey_pair: state.signed_prekey_pair.clone(),
            opk_pool: new_opk_pool,
        };

        (session, new_account)
    }

    pub fn ratchet_encrypt(
        session: &SessionState,
        plaintext: &[u8],
    ) -> (MessageHeader, Vec<u8>, SessionState) {
        let internal = &session.internal_state;

        // Derive sending chain key if not present
        let (root_key, sending_chain_key, dh_key_pair) = match &internal.sending_chain_key {
            Some(_) => (
                internal.root_key.clone(),
                internal.sending_chain_key.clone(),
                internal.dh_key_pair.clone(),
            ),
            None => {
                let mut rng = rand::thread_rng();
                let new_dh = X25519StaticSecret::random_from_rng(&mut rng);
                let new_dh_pub = X25519PublicKey::from(&new_dh);
                // remote_dh_pub_key stores X25519 bytes — use directly
                let remote_pub = bytes_to_x25519_pub(&internal.remote_dh_pub_key);
                let dh_output = new_dh.diffie_hellman(&remote_pub);

                let (new_root, new_chain) =
                    kdf_root_chain(&internal.root_key, dh_output.as_bytes());

                (
                    new_root,
                    Some(new_chain),
                    KeyPair {
                        public: new_dh_pub.as_bytes().to_vec(),
                        private: new_dh.to_bytes().to_vec(),
                    },
                )
            }
        };

        let ck = sending_chain_key.as_ref().expect("sending chain key must exist after ratchet");
        let (message_key, new_chain_key) = kdf_chain(ck);

        // Include opk_id only in the very first message (from initial_opk_id)
        let opk_id = internal.initial_opk_id;
        let aad = serialize_message_header(&MessageHeader {
            dh_pub_key: dh_key_pair.public.clone(),
            n: internal.ns,
            pn: internal.pn,
            opk_id,
        });
        let ciphertext = aesgcm_encrypt(&message_key, plaintext, &aad);

        let new_session = build_session_state(
            root_key,
            Some(new_chain_key),
            internal.receiving_chain_key.clone(),
            dh_key_pair.clone(),
            internal.remote_dh_pub_key.clone(),
            internal.ns + 1,
            internal.nr,
            internal.pn,
            None, // initial_opk_id cleared after first message
        );

        let header = MessageHeader {
            dh_pub_key: dh_key_pair.public,
            n: internal.ns,
            pn: internal.pn,
            opk_id,
        };

        (header, ciphertext, new_session)
    }

    pub fn ratchet_decrypt(
        session: &SessionState,
        header: &MessageHeader,
        ciphertext: &[u8],
    ) -> Result<(Vec<u8>, SessionState), String> {
        let internal = &session.internal_state;

        // Try skipped message keys first
        let skip_id = skipped_message_key_id(header.n, &header.dh_pub_key);
        if let Some(mk) = internal.skipped_message_keys.get(&skip_id) {
            let aad = serialize_message_header(header);
            let plaintext = aesgcm_decrypt(mk, ciphertext, &aad)?;
            let mut new_skipped = internal.skipped_message_keys.clone();
            new_skipped.remove(&skip_id);
            let mut new_session = build_session_state(
                internal.root_key.clone(),
                internal.sending_chain_key.clone(),
                internal.receiving_chain_key.clone(),
                internal.dh_key_pair.clone(),
                internal.remote_dh_pub_key.clone(),
                internal.ns,
                internal.nr,
                internal.pn,
                None,
            );
            new_session.internal_state.skipped_message_keys = new_skipped;
            return Ok((plaintext, new_session));
        }

        // DH ratchet step needed (new public key from remote)
        if header.dh_pub_key != internal.remote_dh_pub_key {
            let mut skipped = internal.skipped_message_keys.clone();

            // Skip messages in the current receiving chain
            if let Some(ref rck) = internal.receiving_chain_key {
                let mut ck = rck.clone();
                for n in internal.nr..header.pn {
                    let (mk, new_ck) = kdf_chain(&ck);
                    let sid = skipped_message_key_id(n, &internal.remote_dh_pub_key);
                    skipped.insert(sid, mk);
                    ck = new_ck;
                }
            }

            // DH ratchet step — header.dh_pub_key is X25519, use directly
            let new_remote_pub = bytes_to_x25519_pub(&header.dh_pub_key);
            let dh_priv_bytes: [u8; 32] = {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&internal.dh_key_pair.private);
                arr
            };
            let dh_priv = X25519StaticSecret::from(dh_priv_bytes);
            let dh_output = dh_priv.diffie_hellman(&new_remote_pub);
            let (new_root, new_recv_chain) = kdf_root_chain(&internal.root_key, dh_output.as_bytes());

            // Skip messages in new chain
            let mut ck = new_recv_chain.clone();
            for n in 0..header.n {
                let (mk, new_ck) = kdf_chain(&ck);
                let sid = skipped_message_key_id(n, &header.dh_pub_key);
                skipped.insert(sid, mk);
                ck = new_ck;
            }

            let (message_key, final_chain_key) = kdf_chain(&ck);
            let aad = serialize_message_header(header);
            let plaintext = aesgcm_decrypt(&message_key, ciphertext, &aad)?;

            // New sending DH
            let mut rng = rand::thread_rng();
            let new_dh = X25519StaticSecret::random_from_rng(&mut rng);
            let new_dh_pub = X25519PublicKey::from(&new_dh);
            let dh_output2 = new_dh.diffie_hellman(&new_remote_pub);
            let (final_root, sending_chain) = kdf_root_chain(&new_root, dh_output2.as_bytes());

            let mut new_session = build_session_state(
                final_root,
                Some(sending_chain),
                Some(final_chain_key),
                KeyPair {
                    public: new_dh_pub.as_bytes().to_vec(),
                    private: new_dh.to_bytes().to_vec(),
                },
                header.dh_pub_key.clone(),
                0,
                header.n + 1,
                header.n,
                None,
            );
            new_session.internal_state.skipped_message_keys = skipped;
            return Ok((plaintext, new_session));
        }

        // Same DH — just advance the receiving chain
        let rck = internal
            .receiving_chain_key
            .as_ref()
            .ok_or("No receiving chain key available")?;

        let mut skipped = internal.skipped_message_keys.clone();
        let mut ck = rck.clone();
        for n in internal.nr..header.n {
            let (mk, new_ck) = kdf_chain(&ck);
            let sid = skipped_message_key_id(n, &header.dh_pub_key);
            skipped.insert(sid, mk);
            ck = new_ck;
        }

        let (message_key, new_chain_key) = kdf_chain(&ck);
        let aad = serialize_message_header(header);
        let plaintext = aesgcm_decrypt(&message_key, ciphertext, &aad)?;

        let mut new_session = build_session_state(
            internal.root_key.clone(),
            internal.sending_chain_key.clone(),
            Some(new_chain_key),
            internal.dh_key_pair.clone(),
            internal.remote_dh_pub_key.clone(),
            internal.ns,
            header.n + 1,
            internal.pn,
            None,
        );
        new_session.internal_state.skipped_message_keys = skipped;

        Ok((plaintext, new_session))
    }
}

// ── Private helpers ──────────────────────────────────────────────────

fn ed25519_private_to_x25519_private(private_key: &[u8]) -> [u8; 32] {
    let hash = Sha512::digest(private_key);
    let mut result = [0u8; 32];
    result.copy_from_slice(&hash[..32]);
    // Clamp
    result[0] &= 248;
    result[31] &= 127;
    result[31] |= 64;
    result
}

fn ed25519_public_to_x25519_public(public_key_bytes: &[u8]) -> X25519PublicKey {
    assert_eq!(public_key_bytes.len(), 32, "Ed25519 public key must be 32 bytes");
    let p = BigUint::from_bytes_be(&CURVE25519_FIELD_PRIME);
    let mask = (BigUint::from(1u32) << 255) - BigUint::from(1u32);
    let y = BigUint::from_bytes_le(public_key_bytes) & mask;
    assert!(y < p, "Ed25519 public key encoding invalid");
    let denominator: BigUint = (BigUint::from(1u32) + &p - &y) % &p;
    assert!(!denominator.is_zero(), "Ed25519 public key cannot be converted to X25519");
    let inv = denominator.modpow(&(p.clone() - BigUint::from(2u32)), &p);
    let u: BigUint = ((BigUint::from(1u32) + &y) * &inv) % &p;
    let u_bytes = u.to_bytes_le();
    let mut fixed = [0u8; 32];
    let copy_len = u_bytes.len().min(32);
    fixed[..copy_len].copy_from_slice(&u_bytes[..copy_len]);
    X25519PublicKey::from(fixed)
}

/// Interpret raw 32 bytes as an X25519 public key (no Ed25519 conversion).
/// Used for keys that are already X25519-native: OPK pub, ephemeral pub, SPK pub, DH ratchet pub.
fn bytes_to_x25519_pub(bytes: &[u8]) -> X25519PublicKey {
    assert_eq!(bytes.len(), 32, "X25519 public key must be 32 bytes");
    let mut arr = [0u8; 32];
    arr.copy_from_slice(bytes);
    X25519PublicKey::from(arr)
}

fn derive_root_key(ikm: &[u8], salt: Option<&[u8]>) -> Vec<u8> {
    let hk = Hkdf::<Sha256>::new(salt, ikm);
    let mut okm = [0u8; 32];
    hk.expand(ROOT_RATCHET_INFO, &mut okm)
        .expect("HKDF expand failed");
    okm.to_vec()
}

fn kdf_root_chain(root_key: &[u8], dh_output: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let hk = Hkdf::<Sha256>::new(Some(root_key), dh_output);
    let mut new_root = [0u8; 32];
    let mut new_chain = [0u8; 32];
    hk.expand(b"root", &mut new_root).expect("HKDF expand failed");
    hk.expand(b"chain", &mut new_chain).expect("HKDF expand failed");
    (new_root.to_vec(), new_chain.to_vec())
}

fn kdf_chain(chain_key: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let mk = hmac_sha256(chain_key, b"0x01");
    let new_ck = hmac_sha256(chain_key, b"0x02");
    (mk, new_ck)
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn derive_nonce(message_key: &[u8]) -> [u8; 12] {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(message_key).expect("HMAC accepts any key length");
    mac.update(b"aes_gcm_nonce");
    let result = mac.finalize().into_bytes();
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&result[..12]);
    nonce
}

fn aesgcm_encrypt(message_key: &[u8], plaintext: &[u8], _aad: &[u8]) -> Vec<u8> {
    let nonce_bytes = derive_nonce(message_key);
    let nonce = aes_gcm::Nonce::from(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(message_key).expect("AES key length invalid");
    cipher.encrypt(&nonce, plaintext).expect("AES-GCM encryption failed")
}

fn aesgcm_decrypt(message_key: &[u8], ciphertext: &[u8], _aad: &[u8]) -> Result<Vec<u8>, String> {
    let nonce_bytes = derive_nonce(message_key);
    let nonce = aes_gcm::Nonce::from(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(message_key).expect("AES key length invalid");
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| format!("AES-GCM decryption failed: {}", e))
}

fn serialize_message_header(header: &MessageHeader) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&header.dh_pub_key);
    out.extend_from_slice(&header.n.to_le_bytes());
    out.extend_from_slice(&header.pn.to_le_bytes());
    if let Some(opk_id) = header.opk_id {
        out.extend_from_slice(&opk_id.to_le_bytes());
    }
    out
}

fn skipped_message_key_id(n: u32, dh_pub_key: &[u8]) -> u64 {
    let mut hasher = Sha256::new();
    hasher.update(dh_pub_key);
    hasher.update(&n.to_le_bytes());
    let hash = hasher.finalize();
    u64::from_le_bytes(hash[..8].try_into().unwrap_or(0u64.to_le_bytes()))
}

fn select_lowest_prekey_id(keys: &HashMap<u32, Vec<u8>>) -> Option<u32> {
    keys.keys().min().copied()
}

fn build_session_state(
    root_key: Vec<u8>,
    sending_chain_key: Option<Vec<u8>>,
    receiving_chain_key: Option<Vec<u8>>,
    dh_key_pair: KeyPair,
    remote_dh_pub_key: Vec<u8>,
    ns: u32,
    nr: u32,
    pn: u32,
    initial_opk_id: Option<u32>,
) -> SessionState {
    SessionState {
        internal_state: SessionInternalState {
            root_key,
            sending_chain_key,
            receiving_chain_key,
            dh_key_pair,
            remote_dh_pub_key,
            ns,
            nr,
            pn,
            skipped_message_keys: HashMap::new(),
            initial_opk_id,
        },
    }
}