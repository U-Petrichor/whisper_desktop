export interface SignalPreKey {
  keyId: number;
  publicKey: string;
}

export interface SignalSignedPreKey {
  keyId: number;
  publicKey: string;
  signature: string;
}

export interface SignalKeyBundle {
  userId?: number;
  identityPublicKey: string;
  identityKeyFingerprint?: string;
  signedPreKey: SignalSignedPreKey;
  oneTimePreKeys?: SignalPreKey[];
  oneTimePreKey?: SignalPreKey | null;
}

export interface SignalAccountResult {
  userId: number;
  keyBundle: SignalKeyBundle & { oneTimePreKeys: SignalPreKey[] };
}

export interface SignalEnvelope {
  version: number;
  type: 'signal_message';
  algorithm: string;
  senderUserId: number;
  recipientUserId: number;
  senderIdentityPublicKey: string;
  header: {
    dhPubKey: string;
    n: number;
    pn: number;
    opkId?: number | null;
  };
  ciphertext: string;
}

export interface SignalRuntimeOptions {
  baseUrl?: string;
  userId: number | string;
}

export interface CreateAccountOptions {
  opkCount?: number;
}

export interface SignalKeyStatusResult {
  userId: number;
  hasIdentity: boolean;
  fingerprint: string | null;
}

export interface SignalLoadKeysOptions {
  opkCount?: number;
}

export interface EncryptMessageInput {
  toUserId: number | string;
  plaintext: string;
  recipientBundle: SignalKeyBundle;
}

export interface DecryptMessageInput {
  fromUserId: number | string;
  envelope: SignalEnvelope;
}

function normalizeUserId(userId: number | string): number {
  const normalized = Number(userId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`Invalid Signal user id: ${userId}`);
  }
  return normalized;
}

function defaultSignalRuntimeUrl(): string {
  const envUrl = import.meta.env?.VITE_SIGNAL_RUNTIME_URL;
  if (envUrl) return envUrl;
  return 'http://127.0.0.1:8765';
}

async function postJson<TResponse>(baseUrl: string, path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Signal runtime request failed: ${response.status}`);
  }
  if (payload?.ok === false) {
    throw new Error(payload.error || 'Signal runtime request failed');
  }
  return payload as TResponse;
}

export class SignalHttpRuntime {
  readonly baseUrl: string;
  readonly userId: number;

  constructor(options: SignalRuntimeOptions) {
    this.baseUrl = (options.baseUrl || defaultSignalRuntimeUrl()).replace(/\/$/, '');
    this.userId = normalizeUserId(options.userId);
  }

  createAccount(options: CreateAccountOptions = {}): Promise<SignalAccountResult> {
    return postJson<SignalAccountResult>(this.baseUrl, '/accounts', {
      userId: this.userId,
      opkCount: options.opkCount ?? 50,
    });
  }

  getKeyStatus(): Promise<SignalKeyStatusResult> {
    return postJson<SignalKeyStatusResult>(this.baseUrl, '/keys/status', {
      userId: this.userId,
    });
  }

  loadKeys(options: SignalLoadKeysOptions = {}): Promise<SignalAccountResult> {
    return postJson<SignalAccountResult>(this.baseUrl, '/keys/load', {
      userId: this.userId,
      opkCount: options.opkCount ?? 20,
    });
  }

  encryptMessage(input: EncryptMessageInput): Promise<SignalEnvelope> {
    return postJson<SignalEnvelope>(this.baseUrl, '/messages/encrypt', {
      fromUserId: this.userId,
      toUserId: normalizeUserId(input.toUserId),
      plaintext: input.plaintext,
      recipientBundle: input.recipientBundle,
    });
  }

  async decryptMessage(input: DecryptMessageInput): Promise<string> {
    const result = await postJson<{ plaintext: string }>(this.baseUrl, '/messages/decrypt', {
      userId: this.userId,
      fromUserId: normalizeUserId(input.fromUserId),
      envelope: input.envelope,
    });
    return result.plaintext;
  }
}

// ── SignalTauriRuntime: calls Rust engine via Tauri commands ──────────

import { invoke } from '@tauri-apps/api/core';

function bundleToTauriFormat(bundle: SignalKeyBundle): {
  identityPublicKey: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  oneTimePreKeys: Record<number, string>;
} {
  const otpMap: Record<number, string> = {};
  if (bundle.oneTimePreKeys) {
    for (const prekey of bundle.oneTimePreKeys) {
      otpMap[prekey.keyId] = prekey.publicKey;
    }
  }
  if (bundle.oneTimePreKey) {
    otpMap[bundle.oneTimePreKey.keyId] = bundle.oneTimePreKey.publicKey;
  }

  return {
    identityPublicKey: bundle.identityPublicKey,
    signedPreKeyId: bundle.signedPreKey.keyId,
    signedPreKeyPublic: bundle.signedPreKey.publicKey,
    signedPreKeySignature: bundle.signedPreKey.signature,
    oneTimePreKeys: otpMap,
  };
}

function tauriBundleToKeyBundle(
  result: { keyBundle: TauriKeyBundleRaw }
): SignalKeyBundle & { oneTimePreKeys: SignalPreKey[] } {
  const raw = result.keyBundle;
  const otps: SignalPreKey[] = Object.entries(raw.oneTimePreKeys).map(([id, pub]) => ({
    keyId: Number(id),
    publicKey: pub as string,
  }));

  return {
    identityPublicKey: raw.identityKeyPub,
    signedPreKey: {
      keyId: raw.signedPreKeyId,
      publicKey: raw.signedPreKeyPub,
      signature: raw.signedPreKeySig,
    },
    oneTimePreKeys: otps,
  };
}

interface TauriKeyBundleRaw {
  identityKeyPub: string;
  signedPreKeyId: number;
  signedPreKeyPub: string;
  signedPreKeySig: string;
  oneTimePreKeys: Record<string, string>;
}

interface TauriEnvelopeRaw {
  senderIdentityPublicKey: string;
  header: { dhPubKey: string; n: number; pn: number; opkId?: number | null };
  ciphertext: string;
}

export class SignalTauriRuntime {
  readonly userId: number;

  constructor(options: SignalRuntimeOptions) {
    this.userId = normalizeUserId(options.userId);
  }

  async createAccount(options: CreateAccountOptions = {}): Promise<SignalAccountResult> {
    const result = await invoke<{ keyBundle: TauriKeyBundleRaw }>('signal_create_account', {
      userId: this.userId,
      opkCount: options.opkCount ?? 50,
    });
    return {
      userId: this.userId,
      keyBundle: tauriBundleToKeyBundle(result),
    };
  }

  async getKeyStatus(): Promise<SignalKeyStatusResult> {
    const result = await invoke<{ hasIdentity: boolean; fingerprint: string | null }>('signal_get_key_status', {
      userId: this.userId,
    });
    return {
      userId: this.userId,
      hasIdentity: result.hasIdentity,
      fingerprint: result.fingerprint,
    };
  }

  async loadKeys(options: SignalLoadKeysOptions = {}): Promise<SignalAccountResult> {
    const result = await invoke<{ keyBundle: TauriKeyBundleRaw }>('signal_load_keys', {
      userId: this.userId,
      opkCount: options.opkCount ?? 20,
    });
    return {
      userId: this.userId,
      keyBundle: tauriBundleToKeyBundle(result),
    };
  }

  async encryptMessage(input: EncryptMessageInput): Promise<SignalEnvelope> {
    const raw = await invoke<TauriEnvelopeRaw>('signal_encrypt_message', {
      fromUserId: this.userId,
      toUserId: normalizeUserId(input.toUserId),
      plaintext: input.plaintext,
      recipientBundle: bundleToTauriFormat(input.recipientBundle),
    });
    return {
      version: 1,
      type: 'signal_message',
      algorithm: 'signal',
      senderUserId: this.userId,
      recipientUserId: normalizeUserId(input.toUserId),
      senderIdentityPublicKey: raw.senderIdentityPublicKey,
      header: {
        dhPubKey: raw.header.dhPubKey,
        n: raw.header.n,
        pn: raw.header.pn,
        opkId: raw.header.opkId ?? null,
      },
      ciphertext: raw.ciphertext,
    };
  }

  async decryptMessage(input: DecryptMessageInput): Promise<string> {
    const result = await invoke<{ plaintext: string }>('signal_decrypt_message', {
      userId: this.userId,
      fromUserId: normalizeUserId(input.fromUserId),
      envelope: {
        senderIdentityPublicKey: input.envelope.senderIdentityPublicKey,
        header: {
          dhPubKey: input.envelope.header.dhPubKey,
          n: input.envelope.header.n,
          pn: input.envelope.header.pn,
          opkId: input.envelope.header.opkId ?? undefined,
        },
        ciphertext: input.envelope.ciphertext,
      },
    });
    return result.plaintext;
  }
}

export function isSignalEnvelope(value: unknown): value is SignalEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SignalEnvelope>;
  return candidate.type === 'signal_message'
    && typeof candidate.ciphertext === 'string'
    && typeof candidate.senderIdentityPublicKey === 'string'
    && !!candidate.header
    && typeof candidate.header.dhPubKey === 'string'
    && typeof candidate.header.n === 'number'
    && typeof candidate.header.pn === 'number';
}

export function serializeSignalEnvelope(envelope: SignalEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseSignalEnvelope(content: string): SignalEnvelope | null {
  try {
    const parsed = JSON.parse(content);
    return isSignalEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
