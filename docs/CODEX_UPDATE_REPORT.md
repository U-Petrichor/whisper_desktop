# Codex 接手更新报告

日期：2026-05-23

本文记录 Codex 接手 Whisper 项目后完成的主要修复、实现和验证结果。内容覆盖 `whisper_server`、`whisper_desktop` 和 `whisper_encryption` 三个仓库。

## 接手时的主要问题

- 桌面端残留多个旧 API 路径，例如 `/v1/keys/public`、`/v1/encryption/my-keys`、`/v1/messages/send`。
- 前端对后端响应结构的解析不一致，部分页面直接读取旧字段。
- 好友申请的“已发送”本地状态可能和后端真实状态不一致。
- 后端 `/api/v1/user-status/me`、`/api/v1/user-status/stats` 被动态路由 `/user-status/{user_id}` 误匹配，返回 422。
- 后端已有 E2EE 数据模型和 CRUD 雏形，但缺少正式 HTTP 路由。
- 桌面端消息加密主要是本地占位逻辑，没有真实接入 Signal 流程。
- 后端缺少 pytest/httpx 接口测试环境。
- 桌面端存在 npm audit 告警。
- Rust/Cargo 和 Tauri 开发环境未完全验证。
- 文档不足，成员部署时容易误以为每台电脑各跑一个 localhost 后端也能互通。

## 已完成的后端工作

- 新增真实 E2EE key bundle HTTP API：
  - `POST /api/v1/e2ee/key-bundle`
  - `GET /api/v1/e2ee/key-bundle/me`
  - `GET /api/v1/e2ee/key-bundle/{user_id:int}`
- 支持上传：
  - identity public key
  - identity key fingerprint
  - signed pre-key
  - one-time pre-keys
- 支持获取对方 pre-key bundle，并默认消费一个 one-time pre-key。
- 优化 one-time pre-key 消费逻辑，避免重复返回同一个 OPK。
- 修复 user-status 静态路由被动态路由遮蔽的问题。
- 添加 E2EE Pydantic schema。
- 添加 pytest/httpx 测试依赖。
- 新增后端 E2EE 接口测试。
- 补充服务端 README、E2EE API 文档和部署文档。

## 已完成的桌面端工作

- 新增 API contract 工具，兼容 wrapped response 和旧 flat response。
- 修复登录、注册、联系人、WebSocket payload 的响应解析。
- 移除旧 API 路径残留。
- 好友申请“已发送”状态改为从后端 pending sent requests 同步。
- 修复注册/登录后加密初始化使用错误 user id 的问题。
- 桌面端 key API 改为调用新的 `/v1/e2ee/key-bundle` 路由。
- 新增 contract tests，防止旧接口路径回流。
- 新增 Signal runtime 原型：
  - `scripts/signal_bridge.py`
  - `src/services/signal-runtime.ts`
  - `npm run test:signal`
- `HybridMessaging` 初始化时生成并上传 key bundle。
- 发送文本消息前获取对方 pre-key bundle 并加密成 Signal envelope。
- 接收服务端消息时识别 Signal envelope 并调用本地 bridge 解密。
- `.env.example` 补充本机、局域网、远程部署示例。
- `.gitignore` 增加 `.signal_state/`，避免提交本地私钥/session 状态。
- 补充桌面端 README、部署拓扑和 Signal runtime 文档。
- 运行 `npm audit fix`，清除 audit vulnerabilities。

## 已完成的加密库相关工作

- 验证 `SignalCryptoCore` 最小闭环：
  - 生成账号
  - 发送方初始化 session
  - ratchet encrypt
  - 接收方初始化 session
  - ratchet decrypt
- 通过桌面端 Signal bridge 实际调用加密库，完成 Alice/Bob 双方加密解密测试。
- 重写 README，说明库的边界、核心模型、API 和集成方法。
- 新增集成说明文档。

## 验证结果

已通过：

```powershell
npm run test:signal
npm run test:contract
npm run build
npm audit --json
.\.venv\Scripts\python.exe -m pytest tests\test_e2ee_routes.py -q
.\.venv\Scripts\python.exe -m compileall app
```

真实后端烟测也已通过：

- 注册临时 Alice/Bob。
- 双方上传 E2EE key bundle。
- Alice 从后端获取 Bob pre-key bundle。
- Alice 用 Signal bridge 加密消息。
- 消息通过 `/api/v1/messages` 写入后端。
- Bob 从历史消息读取密文。
- Bob 用 Signal bridge 解密得到原文 `backend signal smoke`。

## 当前架构结论

Whisper 当前是 C/S 架构：

```text
客户端 A  -->  同一个后端服务器  <--  客户端 B
```

两台电脑可以登录不同账号交流，但必须连接同一个后端。如果每个人都启动自己的 `127.0.0.1:8000`，那就是多个独立服务，互相无法通信。

Signal bridge 是每个客户端本地各跑一个，因为它保存私钥和 session state。共享后端只保存账号、好友、密文消息、WebSocket 连接和 E2EE 公钥材料。

## 仍需注意的边界

- 当前 Signal bridge 是可跑通原型，不是生产级 Tauri-native/WASM 方案。
- `.signal_state` 不是加密存储，生产必须替换为安全存储。
- key rotation 和 OPK 自动补充还没有产品化。
- Tauri dev 仍需要安装 Visual Studio Build Tools 的 MSVC + Windows SDK。
- 本地 SQLite 只适合开发和小规模测试，生产应换正式数据库。
- 公网部署必须使用 HTTPS/WSS 和真实 `SECRET_KEY`。

## 建议的下一步

1. 让成员按部署拓扑文档做一次两台电脑局域网联调。
2. 安装 VS Build Tools 后验证 `npm run tauri dev`。
3. 把 Signal bridge 收敛为 Tauri sidecar 或 native command。
4. 给 OPK 低水位补充和 signed pre-key rotation 加定时/启动时检查。
5. 增加更多端到端测试：好友申请、在线投递、离线历史拉取、Signal 解密失败提示。
