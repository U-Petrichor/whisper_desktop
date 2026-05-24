from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from signal_crypto_core import (
    LocalAccountState,
    MessageHeader,
    PreKeyBundle,
    SessionState,
    SignalCryptoEngine,
)


ALGORITHM = "SignalCryptoCore-X3DH-DoubleRatchet"


def b64encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def b64decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"))


def encode_bytes(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"__bytes__": b64encode(value)}
    if isinstance(value, dict):
        return {str(key): encode_bytes(item) for key, item in value.items()}
    if isinstance(value, list):
        return [encode_bytes(item) for item in value]
    return value


def decode_bytes(value: Any) -> Any:
    if isinstance(value, dict):
        if set(value.keys()) == {"__bytes__"}:
            return b64decode(value["__bytes__"])
        return {
            int(key) if isinstance(key, str) and key.isdigit() else key: decode_bytes(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [decode_bytes(item) for item in value]
    return value


def account_to_json(state: LocalAccountState) -> dict[str, Any]:
    return encode_bytes(asdict(state))


def account_from_json(payload: dict[str, Any]) -> LocalAccountState:
    decoded = decode_bytes(payload)
    return LocalAccountState(
        identity_key_pair=decoded["identity_key_pair"],
        signed_prekey_pair=decoded["signed_prekey_pair"],
        opk_pool=decoded["opk_pool"],
    )


def session_to_json(state: SessionState) -> dict[str, Any]:
    return encode_bytes(asdict(state))


def session_from_json(payload: dict[str, Any]) -> SessionState:
    decoded = decode_bytes(payload)
    return SessionState(internal_state=decoded["internal_state"])


def bundle_to_upload_json(user_id: int, bundle: PreKeyBundle) -> dict[str, Any]:
    identity_public_key = b64encode(bundle.identity_key_pub)
    return {
        "userId": user_id,
        "identityPublicKey": identity_public_key,
        "identityKeyFingerprint": hashlib.sha256(bundle.identity_key_pub).hexdigest(),
        "signedPreKey": {
            "keyId": bundle.signed_prekey_id,
            "publicKey": b64encode(bundle.signed_prekey_pub),
            "signature": b64encode(bundle.signed_prekey_sig),
        },
        "oneTimePreKeys": [
            {"keyId": key_id, "publicKey": b64encode(public_key)}
            for key_id, public_key in sorted(bundle.one_time_prekeys.items())
        ],
    }


def bundle_from_json(payload: dict[str, Any]) -> PreKeyBundle:
    signed_prekey = payload["signedPreKey"]
    one_time_prekeys: dict[int, bytes] = {}

    one_time_prekey = payload.get("oneTimePreKey")
    if one_time_prekey:
        one_time_prekeys[int(one_time_prekey["keyId"])] = b64decode(one_time_prekey["publicKey"])
    else:
        for key in payload.get("oneTimePreKeys") or []:
            one_time_prekeys[int(key["keyId"])] = b64decode(key["publicKey"])

    return PreKeyBundle(
        identity_key_pub=b64decode(payload["identityPublicKey"]),
        signed_prekey_id=int(signed_prekey["keyId"]),
        signed_prekey_pub=b64decode(signed_prekey["publicKey"]),
        signed_prekey_sig=b64decode(signed_prekey["signature"]),
        one_time_prekeys=one_time_prekeys,
    )


def header_to_json(header: MessageHeader) -> dict[str, Any]:
    return {
        "dhPubKey": b64encode(header.dh_pub_key),
        "n": header.n,
        "pn": header.pn,
    }


def header_from_json(payload: dict[str, Any]) -> MessageHeader:
    return MessageHeader(
        dh_pub_key=b64decode(payload["dhPubKey"]),
        n=int(payload["n"]),
        pn=int(payload["pn"]),
    )


class SignalStateStore:
    def __init__(self, state_dir: Path):
        self.state_dir = state_dir
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def account_path(self, user_id: int) -> Path:
        return self.state_dir / f"user-{user_id}-account.json"

    def session_path(self, user_id: int, peer_user_id: int) -> Path:
        return self.state_dir / f"user-{user_id}-peer-{peer_user_id}-session.json"

    def save_account(self, user_id: int, state: LocalAccountState) -> None:
        self.account_path(user_id).write_text(
            json.dumps(account_to_json(state), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load_account(self, user_id: int) -> LocalAccountState:
        path = self.account_path(user_id)
        if not path.exists():
            raise ValueError(f"Signal account state not found for user {user_id}")
        return account_from_json(json.loads(path.read_text(encoding="utf-8")))

    def save_session(self, user_id: int, peer_user_id: int, state: SessionState) -> None:
        self.session_path(user_id, peer_user_id).write_text(
            json.dumps(session_to_json(state), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load_session(self, user_id: int, peer_user_id: int) -> SessionState | None:
        path = self.session_path(user_id, peer_user_id)
        if not path.exists():
            return None
        return session_from_json(json.loads(path.read_text(encoding="utf-8")))

    def reset(self) -> None:
        for path in self.state_dir.glob("*.json"):
            path.unlink()


class SignalBridge:
    def __init__(self, state_dir: Path):
        self.store = SignalStateStore(state_dir)

    def get_keys_status(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = int(payload["userId"])
        account_path = self.store.account_path(user_id)
        has_identity = account_path.exists()
        fingerprint = None
        if has_identity:
            account = self.store.load_account(user_id)
            fingerprint = hashlib.sha256(account.identity_key_pair["public"]).hexdigest()
        return {"userId": user_id, "hasIdentity": has_identity, "fingerprint": fingerprint}

    def load_keys(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = int(payload["userId"])
        opk_count = int(payload.get("opkCount", 20))

        account = self.store.load_account(user_id)

        # 轮换签名预密钥（身份密钥不变）
        account, new_spk_id, new_spk_pub, new_spk_sig = SignalCryptoEngine.rotate_signed_prekey(account)
        self.store.save_account(user_id, account)

        # 补充一次性预密钥
        account, _new_opks = SignalCryptoEngine.replenish_one_time_prekeys(account, opk_count)
        self.store.save_account(user_id, account)

        # 构造完整 bundle（包含 identity + 新 SPK + 所有现存 OPK）
        bundle = PreKeyBundle(
            identity_key_pub=account.identity_key_pair["public"],
            signed_prekey_id=new_spk_id,
            signed_prekey_pub=new_spk_pub,
            signed_prekey_sig=new_spk_sig,
            one_time_prekeys={
                key_id: pair["public"]
                for key_id, pair in account.opk_pool.items()
            },
        )
        return {"userId": user_id, "keyBundle": bundle_to_upload_json(user_id, bundle)}

    def create_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = int(payload["userId"])
        opk_count = int(payload.get("opkCount", 50))

        # 防线：如果已有身份密钥，加载而非重新生成
        account_path = self.store.account_path(user_id)
        if account_path.exists():
            return self.load_keys(payload)

        account, bundle = SignalCryptoEngine.generate_initial_account(opk_count=opk_count)
        self.store.save_account(user_id, account)
        return {
            "userId": user_id,
            "keyBundle": bundle_to_upload_json(user_id, bundle),
        }

    def encrypt_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        from_user_id = int(payload["fromUserId"])
        to_user_id = int(payload["toUserId"])
        plaintext = str(payload["plaintext"]).encode("utf-8")

        account = self.store.load_account(from_user_id)
        session = self.store.load_session(from_user_id, to_user_id)
        if session is None:
            session = SignalCryptoEngine.initiate_session_as_sender(
                our_state=account,
                bob_bundle=bundle_from_json(payload["recipientBundle"]),
            )

        header, ciphertext, updated_session = SignalCryptoEngine.ratchet_encrypt(
            session=session,
            plaintext=plaintext,
        )
        self.store.save_session(from_user_id, to_user_id, updated_session)

        return {
            "version": 1,
            "type": "signal_message",
            "algorithm": ALGORITHM,
            "senderUserId": from_user_id,
            "recipientUserId": to_user_id,
            "senderIdentityPublicKey": b64encode(account.identity_key_pair["public"]),
            "header": header_to_json(header),
            "ciphertext": b64encode(ciphertext),
        }

    def decrypt_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = int(payload["userId"])
        from_user_id = int(payload["fromUserId"])
        envelope = payload["envelope"]

        if envelope.get("type") != "signal_message":
            raise ValueError("Unsupported Signal envelope type")

        account = self.store.load_account(user_id)
        session = self.store.load_session(user_id, from_user_id)
        header = header_from_json(envelope["header"])

        if session is None:
            session, updated_account = SignalCryptoEngine.initialize_session_as_receiver(
                our_state=account,
                initial_header=header,
                alice_ik_pub=b64decode(envelope["senderIdentityPublicKey"]),
            )
            self.store.save_account(user_id, updated_account)

        plaintext, updated_session = SignalCryptoEngine.ratchet_decrypt(
            session=session,
            header=header,
            ciphertext=b64decode(envelope["ciphertext"]),
        )
        self.store.save_session(user_id, from_user_id, updated_session)

        return {
            "plaintext": plaintext.decode("utf-8"),
            "envelope": envelope,
        }


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def make_handler(bridge: SignalBridge):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            return

        def send_json(self, status: int, payload: dict[str, Any]) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_OPTIONS(self) -> None:
            self.send_json(200, {"ok": True})

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/health":
                self.send_json(200, {"ok": True, "algorithm": ALGORITHM})
                return
            self.send_json(404, {"ok": False, "error": "not found"})

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            try:
                body = read_json_body(self)
                if path == "/accounts":
                    self.send_json(200, bridge.create_account(body))
                elif path == "/keys/status":
                    self.send_json(200, bridge.get_keys_status(body))
                elif path == "/keys/load":
                    self.send_json(200, bridge.load_keys(body))
                elif path == "/messages/encrypt":
                    self.send_json(200, bridge.encrypt_message(body))
                elif path == "/messages/decrypt":
                    self.send_json(200, bridge.decrypt_message(body))
                elif path == "/reset":
                    bridge.store.reset()
                    self.send_json(200, {"ok": True})
                else:
                    self.send_json(404, {"ok": False, "error": "not found"})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})

    return Handler


def serve(args: argparse.Namespace) -> None:
    bridge = SignalBridge(Path(args.state_dir))
    server = ThreadingHTTPServer((args.host, args.port), make_handler(bridge))
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Whisper desktop Signal bridge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8765)
    serve_parser.add_argument(
        "--state-dir",
        default=os.environ.get("WHISPER_SIGNAL_STATE_DIR", ".signal_state"),
    )
    serve_parser.set_defaults(func=serve)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
