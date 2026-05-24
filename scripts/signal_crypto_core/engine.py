from __future__ import annotations

import hashlib
import hmac
from typing import Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from .models import (
    KeyPairDict,
    LocalAccountState,
    MessageHeader,
    PreKeyBundle,
    SessionState,
    SignedPreKeyPairDict,
)


class SignalCryptoEngine:
    """Signal 风格纯密码学状态机的门面接口。

    该类只负责密码学状态流转本身，不涉及网络、数据库、文件或任何形式
    的 IO。所有公开方法均为静态方法，以确保调用方式保持无状态；所有
    状态推进都通过“输入旧状态、返回新状态”的方式表达。
    """

    _CURVE25519_FIELD_PRIME = (1 << 255) - 19
    _HKDF_INFO = b"signal_crypto_core:x3dh:root_key"
    _ROOT_RATCHET_INFO = b"signal_crypto_core:double_ratchet:root_chain"
    _ROOT_KEY_LENGTH = 32
    _CHAIN_KEY_LENGTH = 32
    _MESSAGE_KEY_LENGTH = 32
    _NONCE_LENGTH = 12
    _HEADER_COUNTER_LENGTH = 8

    @staticmethod
    def generate_initial_account(
        opk_count: int = 100,
    ) -> tuple[LocalAccountState, PreKeyBundle]:
        """生成全新的本地账户状态与可发布的预密钥包。

        该方法执行 X3DH 的账户初始化阶段：
            1. 生成 1 组 Ed25519 身份密钥对。
            2. 生成 1 组 X25519 签名预密钥对。
            3. 使用身份私钥对签名预密钥公钥进行签名。
            4. 生成指定数量的 X25519 一次性预密钥。
            5. 组装并返回私密账户状态与公开预密钥包。

        状态流向：
            无输入状态 -> (LocalAccountState, PreKeyBundle)

        Args:
            opk_count:
                需要生成的一次性预密钥数量。

        Returns:
            一个二元组，依次为：
                - 新生成的本地私密账户状态。
                - 可对外分发的公开预密钥包。

        Raises:
            ValueError: 当 ``opk_count`` 为负数时抛出。
        """
        if opk_count < 0:
            raise ValueError("opk_count 必须大于或等于 0")

        identity_private_key = ed25519.Ed25519PrivateKey.generate()
        identity_public_key = identity_private_key.public_key()

        signed_prekey_private = x25519.X25519PrivateKey.generate()
        signed_prekey_public_bytes = SignalCryptoEngine._public_key_bytes(
            signed_prekey_private.public_key()
        )
        signed_prekey_signature = identity_private_key.sign(
            signed_prekey_public_bytes
        )

        identity_key_pair: KeyPairDict = {
            "public": SignalCryptoEngine._public_key_bytes(identity_public_key),
            "private": SignalCryptoEngine._private_key_bytes(identity_private_key),
        }
        signed_prekey_pair: SignedPreKeyPairDict = {
            "id": 1,
            "public": signed_prekey_public_bytes,
            "private": SignalCryptoEngine._private_key_bytes(
                signed_prekey_private
            ),
            "signature": signed_prekey_signature,
        }

        opk_pool: dict[int, KeyPairDict] = {}
        one_time_prekeys: dict[int, bytes] = {}
        for prekey_id in range(1, opk_count + 1):
            prekey_pair = SignalCryptoEngine._generate_x25519_key_pair()
            opk_pool[prekey_id] = prekey_pair
            one_time_prekeys[prekey_id] = prekey_pair["public"]

        account_state = LocalAccountState(
            identity_key_pair=identity_key_pair,
            signed_prekey_pair=signed_prekey_pair,
            opk_pool=opk_pool,
        )
        prekey_bundle = PreKeyBundle(
            identity_key_pub=identity_key_pair["public"],
            signed_prekey_id=signed_prekey_pair["id"],
            signed_prekey_pub=signed_prekey_pair["public"],
            signed_prekey_sig=signed_prekey_pair["signature"],
            one_time_prekeys=one_time_prekeys,
        )
        return account_state, prekey_bundle

    @staticmethod
    def rotate_signed_prekey(
        current_state: LocalAccountState,
    ) -> tuple[LocalAccountState, int, bytes, bytes]:
        """轮换当前签名预密钥并返回新的公开元数据。

        该方法会：
            1. 生成新的 X25519 签名预密钥对。
            2. 使用当前身份私钥对新签名预密钥公钥进行 Ed25519 签名。
            3. 将新记录写入返回的 LocalAccountState。
            4. 额外返回需要上传的 ``(新 ID, 新公钥, 签名)``。

        状态流向：
            current_state -> (LocalAccountState, signed_prekey_id, public_key, signature)

        Args:
            current_state:
                当前本地账户状态快照。

        Returns:
            一个四元组，依次为：
                - 更新后的账户状态。
                - 新签名预密钥 ID。
                - 新签名预密钥公钥。
                - 新签名预密钥签名。
        """
        identity_private_key = ed25519.Ed25519PrivateKey.from_private_bytes(
            current_state.identity_key_pair["private"]
        )
        new_signed_prekey_pair = SignalCryptoEngine._generate_x25519_key_pair()
        new_signed_prekey_id = current_state.signed_prekey_pair["id"] + 1
        new_signed_prekey_signature = identity_private_key.sign(
            new_signed_prekey_pair["public"]
        )

        updated_signed_prekey_pair: SignedPreKeyPairDict = {
            "id": new_signed_prekey_id,
            "public": new_signed_prekey_pair["public"],
            "private": new_signed_prekey_pair["private"],
            "signature": new_signed_prekey_signature,
        }
        updated_state = LocalAccountState(
            identity_key_pair=dict(current_state.identity_key_pair),
            signed_prekey_pair=updated_signed_prekey_pair,
            opk_pool=dict(current_state.opk_pool),
        )
        return (
            updated_state,
            new_signed_prekey_id,
            new_signed_prekey_pair["public"],
            new_signed_prekey_signature,
        )

    @staticmethod
    def replenish_one_time_prekeys(
        current_state: LocalAccountState,
        count: int,
    ) -> tuple[LocalAccountState, dict[int, bytes]]:
        """补充一次性预密钥池并返回新增的公开预密钥映射。

        该方法会：
            1. 找出当前 OPK 池中最大的预密钥 ID。
            2. 顺序生成指定数量的新的 X25519 一次性预密钥对。
            3. 把新密钥写入返回的 OPK 池。
            4. 返回新的 LocalAccountState 与仅包含新增公钥的上传映射。

        状态流向：
            current_state -> (LocalAccountState, new_public_opks)

        Args:
            current_state:
                当前本地账户状态快照。

            count:
                需要新增的一次性预密钥数量。

        Returns:
            一个二元组，依次为：
                - 更新后的账户状态。
                - 新增 OPK 的公开映射。
        """
        if count < 0:
            raise ValueError("count 必须大于或等于 0")

        updated_opk_pool = dict(current_state.opk_pool)
        new_public_prekeys: dict[int, bytes] = {}
        next_prekey_id = max(updated_opk_pool, default=0)

        for _ in range(count):
            next_prekey_id += 1
            new_prekey_pair = SignalCryptoEngine._generate_x25519_key_pair()
            updated_opk_pool[next_prekey_id] = new_prekey_pair
            new_public_prekeys[next_prekey_id] = new_prekey_pair["public"]

        updated_state = LocalAccountState(
            identity_key_pair=dict(current_state.identity_key_pair),
            signed_prekey_pair=dict(current_state.signed_prekey_pair),
            opk_pool=updated_opk_pool,
        )
        return updated_state, new_public_prekeys

    @staticmethod
    def initiate_session_as_sender(
        our_state: LocalAccountState,
        bob_bundle: PreKeyBundle,
    ) -> SessionState:
        """以发送方视角初始化 X3DH 会话状态。

        该方法会：
            1. 校验 Bob 的签名预密钥签名。
            2. 为 Alice 生成临时 X25519 密钥对。
            3. 执行 X3DH 所需的 3~4 次 DH 计算。
            4. 通过 HKDF-SHA256 派生初始根链密钥。
            5. 基于 Alice EK 与 Bob SPK 再初始化首条发送链。

        状态流向：
            our_state + bob_bundle -> SessionState

        Args:
            our_state:
                本地发起方账户状态。

            bob_bundle:
                对端响应方公开预密钥包。

        Returns:
            初始化完成的发送方会话状态。

        Raises:
            ValueError: 当 Bob 的签名预密钥签名无效时抛出。
        """
        bob_identity_public = ed25519.Ed25519PublicKey.from_public_bytes(
            bob_bundle.identity_key_pub
        )
        try:
            bob_identity_public.verify(
                bob_bundle.signed_prekey_sig,
                bob_bundle.signed_prekey_pub,
            )
        except InvalidSignature as exc:
            raise ValueError("Bob 的签名预密钥签名校验失败") from exc

        alice_identity_private = (
            SignalCryptoEngine._ed25519_private_bytes_to_x25519_private_key(
                our_state.identity_key_pair["private"]
            )
        )
        bob_identity_public_x25519 = (
            SignalCryptoEngine._ed25519_public_bytes_to_x25519_public_key(
                bob_bundle.identity_key_pub
            )
        )
        bob_signed_prekey_public = x25519.X25519PublicKey.from_public_bytes(
            bob_bundle.signed_prekey_pub
        )

        ephemeral_key_pair = SignalCryptoEngine._generate_x25519_key_pair()
        ephemeral_private = x25519.X25519PrivateKey.from_private_bytes(
            ephemeral_key_pair["private"]
        )

        dh_values = [
            alice_identity_private.exchange(bob_signed_prekey_public),
            ephemeral_private.exchange(bob_identity_public_x25519),
            ephemeral_private.exchange(bob_signed_prekey_public),
        ]

        selected_opk_id = SignalCryptoEngine._select_lowest_prekey_id(
            bob_bundle.one_time_prekeys
        )
        if selected_opk_id is not None:
            bob_opk_public = x25519.X25519PublicKey.from_public_bytes(
                bob_bundle.one_time_prekeys[selected_opk_id]
            )
            dh_values.append(ephemeral_private.exchange(bob_opk_public))

        initial_root_key = SignalCryptoEngine._derive_root_key(dh_values)
        root_key, sending_chain_key = SignalCryptoEngine._kdf_root_chain(
            initial_root_key,
            ephemeral_private.exchange(bob_signed_prekey_public),
        )
        return SignalCryptoEngine._build_session_state(
            root_key=root_key,
            dh_key_pair=ephemeral_key_pair,
            remote_dh_pub_key=bob_bundle.signed_prekey_pub,
            sending_chain_key=sending_chain_key,
            receiving_chain_key=b"",
        )

    @staticmethod
    def initialize_session_as_receiver(
        our_state: LocalAccountState,
        initial_header: MessageHeader,
        alice_ik_pub: bytes,
    ) -> tuple[SessionState, LocalAccountState]:
        """以接收方视角初始化 X3DH 会话状态。

        该方法会：
            1. 从消息头读取 Alice 的临时 X25519 公钥。
            2. 结合本地 IK、SPK 与可选 OPK 对称重建 X3DH DH 结果。
            3. 通过 HKDF-SHA256 派生初始根链密钥。
            4. 基于 Bob SPK 与 Alice EK 初始化首条接收链。
            5. 从返回的新账户状态中删除已消耗的 OPK。

        状态流向：
            our_state + initial_header + alice_ik_pub
                -> (SessionState, LocalAccountState)

        Args:
            our_state:
                本地接收方账户状态。

            initial_header:
                首条入站消息的消息头，其中 ``dh_pub_key`` 视为 Alice 的
                临时 X25519 公钥。

            alice_ik_pub:
                Alice 的 Ed25519 身份公钥。

        Returns:
            一个二元组，依次为：
                - 初始化完成的接收方会话状态。
                - 删除已消耗 OPK 之后的新账户状态。
        """
        alice_identity_public = (
            SignalCryptoEngine._ed25519_public_bytes_to_x25519_public_key(
                alice_ik_pub
            )
        )
        alice_ephemeral_public = x25519.X25519PublicKey.from_public_bytes(
            initial_header.dh_pub_key
        )
        bob_signed_prekey_private = x25519.X25519PrivateKey.from_private_bytes(
            our_state.signed_prekey_pair["private"]
        )
        bob_identity_private = (
            SignalCryptoEngine._ed25519_private_bytes_to_x25519_private_key(
                our_state.identity_key_pair["private"]
            )
        )

        dh_values = [
            bob_signed_prekey_private.exchange(alice_identity_public),
            bob_identity_private.exchange(alice_ephemeral_public),
            bob_signed_prekey_private.exchange(alice_ephemeral_public),
        ]

        updated_opk_pool = dict(our_state.opk_pool)
        selected_opk_id = SignalCryptoEngine._select_lowest_prekey_id(
            updated_opk_pool
        )
        if selected_opk_id is not None:
            selected_opk_private = x25519.X25519PrivateKey.from_private_bytes(
                updated_opk_pool[selected_opk_id]["private"]
            )
            dh_values.append(selected_opk_private.exchange(alice_ephemeral_public))
            del updated_opk_pool[selected_opk_id]

        initial_root_key = SignalCryptoEngine._derive_root_key(dh_values)
        root_key, receiving_chain_key = SignalCryptoEngine._kdf_root_chain(
            initial_root_key,
            bob_signed_prekey_private.exchange(alice_ephemeral_public),
        )
        next_local_dh_key_pair = SignalCryptoEngine._generate_x25519_key_pair()
        next_local_private_key = x25519.X25519PrivateKey.from_private_bytes(
            next_local_dh_key_pair["private"]
        )
        root_key, sending_chain_key = SignalCryptoEngine._kdf_root_chain(
            root_key,
            next_local_private_key.exchange(alice_ephemeral_public),
        )
        session_state = SignalCryptoEngine._build_session_state(
            root_key=root_key,
            dh_key_pair=next_local_dh_key_pair,
            remote_dh_pub_key=initial_header.dh_pub_key,
            sending_chain_key=sending_chain_key,
            receiving_chain_key=receiving_chain_key,
        )
        updated_account_state = LocalAccountState(
            identity_key_pair=dict(our_state.identity_key_pair),
            signed_prekey_pair=dict(our_state.signed_prekey_pair),
            opk_pool=updated_opk_pool,
        )
        return session_state, updated_account_state

    @staticmethod
    def ratchet_encrypt(
        session: SessionState,
        plaintext: bytes,
    ) -> tuple[MessageHeader, bytes, SessionState]:
        """使用当前发送链执行一次 Double Ratchet 加密。

        该方法会：
            1. 推进发送链密钥，派生新的发送链密钥与消息密钥。
            2. 使用当前 DH 公钥、Ns、Pn 构造消息头。
            3. 将序列化后的消息头作为 AAD。
            4. 使用 AESGCM 对明文执行认证加密。
            5. 返回密文与推进后的全新 SessionState。

        状态流向：
            session + plaintext -> (MessageHeader, ciphertext, SessionState)

        Args:
            session:
                当前会话状态快照。

            plaintext:
                待加密的明文字节串。

        Returns:
            一个三元组，依次为：
                - 当前消息头。
                - 认证加密后的密文。
                - 更新后的会话状态。

        Raises:
            ValueError: 当当前会话尚未具备可用发送链时抛出。
        """
        internal_state = session.internal_state
        sending_chain_key = internal_state["sending_chain_key"]
        if not sending_chain_key:
            raise ValueError("当前会话没有可用的发送链密钥")

        next_sending_chain_key, message_key = SignalCryptoEngine._kdf_chain(
            sending_chain_key
        )
        header = MessageHeader(
            dh_pub_key=internal_state["dh_key_pair"]["public"],
            n=internal_state["ns"],
            pn=internal_state["pn"],
        )
        aad = SignalCryptoEngine._serialize_message_header(header)
        ciphertext = SignalCryptoEngine._aesgcm_encrypt(message_key, plaintext, aad)

        new_state = SignalCryptoEngine._build_session_state(
            root_key=internal_state["root_key"],
            dh_key_pair=internal_state["dh_key_pair"],
            remote_dh_pub_key=internal_state["remote_dh_pub_key"],
            sending_chain_key=next_sending_chain_key,
            receiving_chain_key=internal_state["receiving_chain_key"],
            ns=internal_state["ns"] + 1,
            nr=internal_state["nr"],
            pn=internal_state["pn"],
            skipped_message_keys=dict(internal_state["skipped_message_keys"]),
        )
        return header, ciphertext, new_state

    @staticmethod
    def ratchet_decrypt(
        session: SessionState,
        header: MessageHeader,
        ciphertext: bytes,
    ) -> tuple[bytes, SessionState]:
        """使用当前接收链与消息头执行一次 Double Ratchet 解密。

        该方法会：
            1. 优先检查乱序消息缓存中是否已保存目标消息密钥。
            2. 如检测到新的对端 DH 公钥，则执行一次完整的 DH 棘轮：
               先导出新的接收链，再生成新的本地 DH 密钥对并导出新的发送链。
            3. 若消息序号领先于当前 Nr，则把中间跳过消息的消息密钥写入
               乱序缓存。
            4. 推进当前接收链得到目标消息密钥。
            5. 使用消息头序列化结果作为 AAD，调用 AESGCM 解密并验证。

        状态流向：
            session + header + ciphertext -> (plaintext, SessionState)

        Args:
            session:
                当前会话状态快照。

            header:
                入站消息头。

            ciphertext:
                待解密的密文字节串。

        Returns:
            一个二元组，依次为：
                - 解密得到的明文字节串。
                - 更新后的会话状态。

        Raises:
            ValueError: 当消息头与当前状态不一致，或缺少可用接收链时抛出。
        """
        internal_state = session.internal_state
        skipped_message_keys = dict(internal_state["skipped_message_keys"])
        skipped_key_id = SignalCryptoEngine._skipped_message_key_id(
            header.dh_pub_key,
            header.n,
        )
        if skipped_key_id in skipped_message_keys:
            message_key = skipped_message_keys.pop(skipped_key_id)
            plaintext = SignalCryptoEngine._aesgcm_decrypt(
                message_key,
                ciphertext,
                SignalCryptoEngine._serialize_message_header(header),
            )
            return plaintext, SignalCryptoEngine._build_session_state(
                root_key=internal_state["root_key"],
                dh_key_pair=internal_state["dh_key_pair"],
                remote_dh_pub_key=internal_state["remote_dh_pub_key"],
                sending_chain_key=internal_state["sending_chain_key"],
                receiving_chain_key=internal_state["receiving_chain_key"],
                ns=internal_state["ns"],
                nr=internal_state["nr"],
                pn=internal_state["pn"],
                skipped_message_keys=skipped_message_keys,
            )

        root_key = internal_state["root_key"]
        sending_chain_key = internal_state["sending_chain_key"]
        receiving_chain_key = internal_state["receiving_chain_key"]
        local_dh_key_pair = dict(internal_state["dh_key_pair"])
        remote_dh_pub_key = internal_state["remote_dh_pub_key"]
        ns = internal_state["ns"]
        nr = internal_state["nr"]
        pn = internal_state["pn"]

        if header.dh_pub_key != remote_dh_pub_key:
            previous_sending_count = ns
            ns = 0
            nr = 0
            current_private_key = x25519.X25519PrivateKey.from_private_bytes(
                local_dh_key_pair["private"]
            )
            new_remote_public_key = x25519.X25519PublicKey.from_public_bytes(
                header.dh_pub_key
            )
            root_key, receiving_chain_key = SignalCryptoEngine._kdf_root_chain(
                root_key,
                current_private_key.exchange(new_remote_public_key),
            )

            new_local_dh_key_pair = SignalCryptoEngine._generate_x25519_key_pair()
            new_local_private_key = x25519.X25519PrivateKey.from_private_bytes(
                new_local_dh_key_pair["private"]
            )
            root_key, sending_chain_key = SignalCryptoEngine._kdf_root_chain(
                root_key,
                new_local_private_key.exchange(new_remote_public_key),
            )

            local_dh_key_pair = new_local_dh_key_pair
            remote_dh_pub_key = header.dh_pub_key
            pn = previous_sending_count

        if header.n < nr:
            raise ValueError("目标消息已被处理且未命中乱序消息缓存")

        while nr < header.n:
            if not receiving_chain_key:
                raise ValueError("当前会话没有可用的接收链密钥")
            receiving_chain_key, skipped_message_key = (
                SignalCryptoEngine._kdf_chain(receiving_chain_key)
            )
            skipped_message_keys[
                SignalCryptoEngine._skipped_message_key_id(
                    remote_dh_pub_key,
                    nr,
                )
            ] = skipped_message_key
            nr += 1

        if not receiving_chain_key:
            raise ValueError("当前会话没有可用的接收链密钥")

        next_receiving_chain_key, message_key = SignalCryptoEngine._kdf_chain(
            receiving_chain_key
        )
        plaintext = SignalCryptoEngine._aesgcm_decrypt(
            message_key,
            ciphertext,
            SignalCryptoEngine._serialize_message_header(header),
        )
        nr += 1

        new_state = SignalCryptoEngine._build_session_state(
            root_key=root_key,
            dh_key_pair=local_dh_key_pair,
            remote_dh_pub_key=remote_dh_pub_key,
            sending_chain_key=sending_chain_key,
            receiving_chain_key=next_receiving_chain_key,
            ns=ns,
            nr=nr,
            pn=pn,
            skipped_message_keys=skipped_message_keys,
        )
        return plaintext, new_state

    @staticmethod
    def _build_session_state(
        root_key: bytes,
        dh_key_pair: KeyPairDict,
        remote_dh_pub_key: bytes,
        sending_chain_key: bytes,
        receiving_chain_key: bytes,
        ns: int = 0,
        nr: int = 0,
        pn: int = 0,
        skipped_message_keys: dict[int, bytes] | None = None,
    ) -> SessionState:
        """基于给定材料构造新的不可变会话状态快照。"""
        return SessionState(
            internal_state={
                "root_key": root_key,
                "sending_chain_key": sending_chain_key,
                "receiving_chain_key": receiving_chain_key,
                "dh_key_pair": {
                    "public": dh_key_pair["public"],
                    "private": dh_key_pair["private"],
                },
                "remote_dh_pub_key": remote_dh_pub_key,
                "ns": ns,
                "nr": nr,
                "pn": pn,
                "skipped_message_keys": skipped_message_keys or {},
            }
        )

    @staticmethod
    def _derive_root_key(dh_values: list[bytes]) -> bytes:
        """把 X3DH 的 DH 输出拼接后派生为初始根链密钥。"""
        key_material = b"".join(dh_values)
        return HKDF(
            algorithm=hashes.SHA256(),
            length=SignalCryptoEngine._ROOT_KEY_LENGTH,
            salt=None,
            info=SignalCryptoEngine._HKDF_INFO,
        ).derive(key_material)

    @staticmethod
    def _kdf_root_chain(
        root_key: bytes,
        dh_output: bytes,
    ) -> tuple[bytes, bytes]:
        """基于当前根链密钥与 DH 输出派生新的根链密钥和链密钥。"""
        derived_bytes = HKDF(
            algorithm=hashes.SHA256(),
            length=SignalCryptoEngine._ROOT_KEY_LENGTH
            + SignalCryptoEngine._CHAIN_KEY_LENGTH,
            salt=root_key,
            info=SignalCryptoEngine._ROOT_RATCHET_INFO,
        ).derive(dh_output)
        return (
            derived_bytes[: SignalCryptoEngine._ROOT_KEY_LENGTH],
            derived_bytes[SignalCryptoEngine._ROOT_KEY_LENGTH :],
        )

    @staticmethod
    def _kdf_chain(chain_key: bytes) -> tuple[bytes, bytes]:
        """基于当前链密钥派生下一轮链密钥与当前消息密钥。"""
        next_chain_key = SignalCryptoEngine._hmac_sha256(
            chain_key,
            b"chain_step",
        )
        message_key = SignalCryptoEngine._hmac_sha256(
            chain_key,
            b"message_key",
        )
        return next_chain_key, message_key[: SignalCryptoEngine._MESSAGE_KEY_LENGTH]

    @staticmethod
    def _aesgcm_encrypt(message_key: bytes, plaintext: bytes, aad: bytes) -> bytes:
        """使用消息密钥和 AAD 执行 AES-GCM 加密。"""
        nonce = SignalCryptoEngine._derive_nonce(message_key)
        return AESGCM(message_key).encrypt(nonce, plaintext, aad)

    @staticmethod
    def _aesgcm_decrypt(message_key: bytes, ciphertext: bytes, aad: bytes) -> bytes:
        """使用消息密钥和 AAD 执行 AES-GCM 解密。"""
        nonce = SignalCryptoEngine._derive_nonce(message_key)
        return AESGCM(message_key).decrypt(nonce, ciphertext, aad)

    @staticmethod
    def _derive_nonce(message_key: bytes) -> bytes:
        """从消息密钥确定性派生 AES-GCM 的随机数。"""
        return SignalCryptoEngine._hmac_sha256(
            message_key,
            b"aes_gcm_nonce",
        )[: SignalCryptoEngine._NONCE_LENGTH]

    @staticmethod
    def _serialize_message_header(header: MessageHeader) -> bytes:
        """将消息头稳定序列化为 AAD 字节串。"""
        return (
            header.dh_pub_key
            + header.n.to_bytes(
                SignalCryptoEngine._HEADER_COUNTER_LENGTH,
                byteorder="big",
                signed=False,
            )
            + header.pn.to_bytes(
                SignalCryptoEngine._HEADER_COUNTER_LENGTH,
                byteorder="big",
                signed=False,
            )
        )

    @staticmethod
    def _skipped_message_key_id(dh_pub_key: bytes, message_index: int) -> int:
        """为乱序消息密钥生成确定性的整型索引。"""
        digest = hashlib.sha256(
            dh_pub_key
            + message_index.to_bytes(
                SignalCryptoEngine._HEADER_COUNTER_LENGTH,
                byteorder="big",
                signed=False,
            )
        ).digest()
        return int.from_bytes(digest[:8], byteorder="big", signed=False)

    @staticmethod
    def _hmac_sha256(key: bytes, data: bytes) -> bytes:
        """执行一次 HMAC-SHA256 计算。"""
        return hmac.new(key, data, hashlib.sha256).digest()

    @staticmethod
    def _generate_x25519_key_pair() -> KeyPairDict:
        """生成原始序列化格式的 X25519 密钥对。"""
        private_key = x25519.X25519PrivateKey.generate()
        return {
            "public": SignalCryptoEngine._public_key_bytes(private_key.public_key()),
            "private": SignalCryptoEngine._private_key_bytes(private_key),
        }

    @staticmethod
    def _select_lowest_prekey_id(
        prekeys: Mapping[int, object],
    ) -> int | None:
        """选择当前阶段约定的确定性最小 OPK 标识符。"""
        if not prekeys:
            return None
        return min(prekeys)

    @staticmethod
    def _public_key_bytes(
        public_key: ed25519.Ed25519PublicKey | x25519.X25519PublicKey,
    ) -> bytes:
        """把 Ed25519 或 X25519 公钥序列化为原始字节串。"""
        return public_key.public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )

    @staticmethod
    def _private_key_bytes(
        private_key: ed25519.Ed25519PrivateKey | x25519.X25519PrivateKey,
    ) -> bytes:
        """把 Ed25519 或 X25519 私钥序列化为原始字节串。"""
        return private_key.private_bytes(
            encoding=Encoding.Raw,
            format=PrivateFormat.Raw,
            encryption_algorithm=NoEncryption(),
        )

    @staticmethod
    def _ed25519_private_bytes_to_x25519_private_key(
        private_key_bytes: bytes,
    ) -> x25519.X25519PrivateKey:
        """把 Ed25519 私钥原始字节转换为对应的 X25519 私钥。"""
        digest = hashlib.sha512(private_key_bytes).digest()
        scalar = bytearray(digest[:32])
        scalar[0] &= 248
        scalar[31] &= 127
        scalar[31] |= 64
        return x25519.X25519PrivateKey.from_private_bytes(bytes(scalar))

    @staticmethod
    def _ed25519_public_bytes_to_x25519_public_key(
        public_key_bytes: bytes,
    ) -> x25519.X25519PublicKey:
        """把 Ed25519 公钥原始字节转换为对应的 X25519 公钥。"""
        if len(public_key_bytes) != 32:
            raise ValueError("Ed25519 公钥长度必须为 32 字节")

        y_coordinate = int.from_bytes(public_key_bytes, "little") & (
            (1 << 255) - 1
        )
        prime = SignalCryptoEngine._CURVE25519_FIELD_PRIME
        if y_coordinate >= prime:
            raise ValueError("Ed25519 公钥编码非法")

        denominator = (1 - y_coordinate) % prime
        if denominator == 0:
            raise ValueError("当前 Ed25519 公钥无法转换为 X25519 公钥")

        u_coordinate = (
            (1 + y_coordinate) * pow(denominator, prime - 2, prime)
        ) % prime
        return x25519.X25519PublicKey.from_public_bytes(
            u_coordinate.to_bytes(32, "little")
        )
