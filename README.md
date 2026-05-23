# Whisper Desktop

Whisper Desktop 是 Whisper 的桌面客户端，基于 Vue 3、TypeScript、Vite 和 Tauri。它负责用户界面、本地消息缓存、WebSocket 长连接、调用后端 API，以及通过本地 Signal bridge 完成端到端加密原型。

## 功能总览

- 登录/注册。
- 联系人列表和好友申请。
- 服务端中转聊天消息。
- WebSocket 实时收消息和在线状态同步。
- 本地消息缓存。
- Signal E2EE 原型：
  - 本地生成 Signal account state。
  - 上传 public key bundle 到后端。
  - 发送文本消息前加密成 Signal envelope。
  - 接收 Signal envelope 后本地解密。
- 头像、图片、文件、音视频通话相关界面和基础调用。

## 目录结构

```text
src/
  api/                 HTTP API 封装
  client_db/           本地 SQLite 数据访问
  components/          Vue 组件
  config/              API 和 WebSocket 地址配置
  services/            消息、Signal runtime、本地消息服务
  store/               全局状态
  utils/               API 契约、时间、key storage 等工具
src-tauri/             Tauri 壳
scripts/               本地辅助脚本，包含 Signal bridge
test/                  Node 内置 test runner 测试
docs/                  部署、Signal runtime 和更新说明
```

## 安装依赖

```powershell
cd E:\Code\python\whisper\whisper_desktop
npm install
```

## 配置 `.env`

复制示例：

```powershell
copy .env.example .env
```

本机单人调试：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000
VITE_SIGNAL_RUNTIME_URL=http://127.0.0.1:8765
```

局域网两台电脑聊天时，两台客户端必须指向同一个后端：

```env
VITE_API_BASE_URL=http://192.168.1.10:8000
VITE_WS_BASE_URL=ws://192.168.1.10:8000
VITE_SIGNAL_RUNTIME_URL=http://127.0.0.1:8765
```

`VITE_SIGNAL_RUNTIME_URL` 仍然是本机地址，因为每台客户端都应该运行自己的本地 Signal bridge。

## 启动前端开发服务器

```powershell
npm run dev -- --host 127.0.0.1
```

默认端口：

```text
http://127.0.0.1:1420
```

## 启动 Signal bridge

Signal bridge 是当前原型阶段让桌面端调用 Python `SignalCryptoCore` 的本地服务。它保存本机私钥和 session state。

```powershell
cd E:\Code\python\whisper\whisper_desktop
$env:PYTHONPATH="..\whisper_encryption"
python scripts\signal_bridge.py serve --host 127.0.0.1 --port 8765 --state-dir .signal_state
```

不要提交 `.signal_state/`。它包含本地账号和会话状态。

详见 [Signal runtime 文档](docs/SIGNAL_RUNTIME.md)。

## 启动完整桌面端

Tauri 需要 Rust/Cargo、WebView2，以及 Windows 上的 Visual Studio Build Tools MSVC + Windows SDK。

```powershell
npm run tauri dev
```

当前已验证 Rust/Cargo 可用，但如果本机没有 VS Build Tools，`tauri dev` 会失败。先安装：

```text
https://aka.ms/vs/17/release/vs_BuildTools.exe
```

安装组件：

- MSVC C++ build tools
- Windows SDK

## 常用脚本

```powershell
npm run dev
npm run build
npm run test:contract
npm run test:signal
npm run tauri dev
npm run tauri build
```

说明：

- `test:contract` 检查前端 API 契约和旧接口残留。
- `test:signal` 启动临时 Signal bridge，验证 Alice/Bob 可以真实加密解密。
- `build` 执行 TypeScript 检查和 Vite 生产构建。

## 两台电脑如何聊天

Whisper 是 C/S 架构：

```text
客户端 A  -->  同一个后端服务器  <--  客户端 B
```

如果两台电脑各自启动自己的 `127.0.0.1:8000` 后端，它们不会互通。正确方式是部署一个共享后端，然后两台客户端都连接它。

详见 [部署拓扑文档](docs/DEPLOYMENT_TOPOLOGY.md)。

## E2EE 当前状态

当前已经跑通真实 Signal 加密闭环：

- 客户端本地 bridge 调用 Python `SignalCryptoEngine`。
- 后端保存 public key bundle。
- 发送方从后端获取接收方 pre-key bundle。
- 发送方生成 Signal envelope。
- 后端只保存/转发密文字符串。
- 接收方本地 bridge 解密。

原型限制：

- `.signal_state` 目前不是加密存储。
- Signal bridge 是本地 HTTP 原型，不是最终 Tauri-native 或 WASM 方案。
- key rotation 和 one-time pre-key 自动补充还没有完整产品化。

## 验证清单

```powershell
npm run test:signal
npm run test:contract
npm run build
npm audit --json
```

预期：

- Signal 测试通过。
- 契约测试通过。
- 前端构建通过。
- audit vulnerabilities 为 0。

## 更多文档

- [部署拓扑](docs/DEPLOYMENT_TOPOLOGY.md)
- [Signal runtime 原型](docs/SIGNAL_RUNTIME.md)
- [Codex 接手更新报告](docs/CODEX_UPDATE_REPORT.md)
