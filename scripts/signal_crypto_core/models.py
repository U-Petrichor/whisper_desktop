from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict


class KeyPairDict(TypedDict):
    """表示一个非对称密钥对。"""

    public: bytes
    private: bytes


class SignedPreKeyPairDict(TypedDict):
    """表示带签名的预密钥及其相关元数据。"""

    id: int
    public: bytes
    private: bytes
    signature: bytes


class SessionInternalState(TypedDict):
    """表示会话内部状态的强类型字典结构。

    该结构专门用于承载 Double Ratchet 的核心状态，并要求所有状态迁移
    通过“输入旧状态、输出新状态”的方式完成，而不是原地修改。

    预期键结构如下：
        root_key:
            bytes。当前根链密钥。每当发生 DH 棘轮切换时，需要基于新的
            DH 共享值派生出新的根链密钥。

        sending_chain_key:
            bytes。当前发送链密钥。每次执行 ratchet_encrypt() 时，
            该值向前推进一次，并派生出当前消息的消息密钥。

        receiving_chain_key:
            bytes。当前接收链密钥。每次执行 ratchet_decrypt() 时，
            该值向前推进一次，并派生出当前消息的消息密钥。

        dh_key_pair:
            一个包含 "public" 与 "private" 的字典，二者均为 bytes。
            表示本地当前 DH 棘轮密钥对。若方向切换导致 DH 棘轮前进，
            则返回的新 SessionState 必须携带更新后的密钥对。

        remote_dh_pub_key:
            bytes。当前记录的对端 DH 棘轮公钥。收到新消息头时，如果
            该值与消息头中的公钥不同，则意味着需要执行一次 DH 棘轮。

        ns:
            int。当前发送链中已经发送的消息数量。状态流向为：
            ratchet_encrypt() 消费旧状态，并在返回的新状态中写入推进
            后的发送计数器。

        nr:
            int。当前接收链中已经接收的消息数量。状态流向为：
            ratchet_decrypt() 消费旧状态，并在返回的新状态中写入推进
            后的接收计数器。

        pn:
            int。上一条发送链的总消息数。状态流向为：本地在发生 DH
            棘轮切换并准备进入新发送链时，需要把旧发送链的消息总数
            保存到该字段，供后续发送的消息头对外声明。

        skipped_message_keys:
            dict[int, bytes]。用于缓存乱序消息的消息密钥。键为实现定义
            的确定性整数索引，值为对应消息密钥。状态流向为：解密时若
            发现消息序号跳跃，会把中间缺失消息的消息密钥存入该映射；
            当迟到消息抵达后，再取出并删除对应记录。

    该结构刻意保持与传输层无关，仅承载密码学状态机所需的最小状态。
    """

    root_key: bytes
    sending_chain_key: bytes
    receiving_chain_key: bytes
    dh_key_pair: KeyPairDict
    remote_dh_pub_key: bytes
    ns: int
    nr: int
    pn: int
    skipped_message_keys: dict[int, bytes]


@dataclass(frozen=True, slots=True)
class LocalAccountState:
    """表示本地账户的私密长期状态与中期状态。

    该对象是本地账户状态的权威快照。所有会修改账户状态的引擎接口都必须
    返回一个新的 LocalAccountState，而不是原地修改调用方持有的对象。

    Attributes:
        identity_key_pair:
            长期身份密钥对，包含 "public" 与 "private"。

        signed_prekey_pair:
            当前生效的签名预密钥记录，包含：
            - "id"：整型标识符
            - "public"：签名预密钥公钥
            - "private"：签名预密钥私钥
            - "signature"：对签名预密钥公钥的签名

        opk_pool:
            本地一次性预密钥池。键为整型 ID，值为包含 "public" 与
            "private" 的密钥对字典。该池会随着会话初始化被逐步消耗，
            并通过返回新的 LocalAccountState 进行补充。
    """

    identity_key_pair: KeyPairDict
    signed_prekey_pair: SignedPreKeyPairDict
    opk_pool: dict[int, KeyPairDict]


@dataclass(frozen=True, slots=True)
class SessionState:
    """表示与单一对端的 Double Ratchet 会话状态。

    会话被建模为不可变快照。每一次加密或解密都会消费一个 SessionState，
    并返回一个新的 SessionState。新的返回值即成为后续状态流转中唯一
    有效的后继状态。

    Attributes:
        internal_state:
            结构化的内部棘轮状态字典。完整键结构与状态流语义见
            SessionInternalState。
    """

    internal_state: SessionInternalState


@dataclass(frozen=True, slots=True)
class PreKeyBundle:
    """表示可发布给远端发起者的公开预密钥包。

    该结构只包含公开值，适合由外部服务器或目录服务分发。之所以与
    LocalAccountState 分离，是为了确保私钥材料不会离开本地密码学边界。

    Attributes:
        identity_key_pub:
            长期身份公钥。

        signed_prekey_id:
            当前签名预密钥的整型标识符。

        signed_prekey_pub:
            当前签名预密钥公钥。

        signed_prekey_sig:
            对当前签名预密钥公钥的签名值。

        one_time_prekeys:
            一次性预密钥公开映射。键为预密钥 ID，值为对应公钥字节串。
    """

    identity_key_pub: bytes
    signed_prekey_id: int
    signed_prekey_pub: bytes
    signed_prekey_sig: bytes
    one_time_prekeys: dict[int, bytes]


@dataclass(frozen=True, slots=True)
class MessageHeader:
    """表示附着在密文上的公开 Double Ratchet 消息头。

    Attributes:
        dh_pub_key:
            发送方当前 DH 棘轮公钥。

        n:
            发送方当前发送链上的消息序号。

        pn:
            发送方上一条发送链中的总消息数。
    """

    dh_pub_key: bytes
    n: int
    pn: int
