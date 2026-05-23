# Signal Runtime Prototype

This desktop prototype uses the Python `SignalCryptoCore` library through a small local HTTP bridge. It is intentionally minimal: the goal is to prove that Whisper can send and receive messages through a Signal-style X3DH + Double Ratchet flow.

## What Runs Where

- `scripts/signal_bridge.py`
  - Runs locally beside the desktop app.
  - Imports `signal_crypto_core` from `../whisper_encryption`.
  - Stores local account state and per-peer session state as JSON files.
  - Exposes account generation, encryption, and decryption over HTTP.
- `src/services/signal-runtime.ts`
  - Browser-safe desktop client for the local bridge.
  - Does not import Node APIs, so Vite/Tauri frontend builds still work.
- `src/services/hybridmessaging.ts`
  - Creates a Signal account during messaging initialization.
  - Uploads the public key bundle to the backend E2EE route.
  - Encrypts text messages into Signal envelopes before server relay.
  - Decrypts Signal envelopes received from server relay.

The backend still only stores and relays encrypted strings. It never receives private keys or plaintext from the Signal runtime.

## Start The Bridge

From `whisper_desktop`:

```powershell
$env:PYTHONPATH="..\whisper_encryption"
python scripts\signal_bridge.py serve --host 127.0.0.1 --port 8765 --state-dir .signal_state
```

If the Python package is already installed into the active environment, `PYTHONPATH` is optional.

The desktop client defaults to `http://127.0.0.1:8765`. Override it with:

```env
VITE_SIGNAL_RUNTIME_URL=http://127.0.0.1:8765
```

## Verify

```powershell
npm run test:signal
npm run test:contract
npm run build
```

`npm run test:signal` starts a temporary bridge, creates Alice and Bob accounts, encrypts two messages from Alice to Bob, and verifies that Bob can decrypt them after session state has been persisted.

## Prototype Limits

- This is not a production key store.
- State JSON is not encrypted at rest.
- Key rotation and OPK replenishment UX are not implemented.
- The bridge is local development infrastructure; a production Tauri app should move this behind native commands, a sidecar, or WASM.
