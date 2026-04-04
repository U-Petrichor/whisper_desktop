# Whisper Desktop

Whisper Desktop 是一个基于 Tauri + Vue 3 + TypeScript 的桌面端项目。

这份文档用于告诉组员：从 GitHub 克隆项目后，需要完成哪些准备工作，才能和当前开发环境保持一致，顺利进行本地调试、构建桌面应用和配置环境变量。

## 开发环境要求

- Node.js 18 及以上
- npm
- Rust 工具链
- Tauri 开发环境
- 建议使用 VS Code

推荐安装的 VS Code 插件：

- Vue - Official
- Tauri
- rust-analyzer

## 克隆项目后第一步

先进入项目目录并安装依赖：

```bash
npm install
```

如果你是第一次在本机开发 Tauri 项目，还需要确认本机已经装好 Rust 和 Tauri 所需的系统依赖。

## 配置 .env

项目依赖 `.env` 文件来指定后端 HTTP API 和 WebSocket 地址。

先复制示例文件：

```bash
copy .env.example .env
```

或者手动新建 `.env`，内容如下：

```env
VITE_API_BASE_URL=http://你的后端地址:8000
VITE_WS_BASE_URL=ws://你的后端地址:8000
```

例如，如果你的后端部署在本机：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000
```

例如，如果你要连接测试服务器：

```env
VITE_API_BASE_URL=http://服务器IP:8000
VITE_WS_BASE_URL=ws://服务器IP:8000
```

注意事项：

- `VITE_API_BASE_URL` 是 HTTP 接口地址
- `VITE_WS_BASE_URL` 是 WebSocket 地址
- 如果后端启用了 HTTPS/WSS，需要把地址改成 `https://` 和 `wss://`
- `.env` 是本地调试配置，不要把你自己的私有环境直接提交到仓库

## 常用命令

### 启动前端调试

```bash
npm run dev
```

这个命令会启动 Vite 开发服务器，适合纯前端页面调试。

### 启动 Tauri 桌面端调试

```bash
npm run tauri dev
```

这个命令会：

- 启动前端开发服务
- 编译并启动 Tauri 桌面应用
- 适合完整联调桌面端功能，例如本地 SQLite、Tauri API、桌面窗口行为等

### 构建前端资源

```bash
npm run build
```

这个命令会先执行 TypeScript 检查，再构建前端静态资源。

### 构建桌面应用

```bash
npm run tauri build
```

这个命令会生成桌面端安装包或可执行产物，适合发布前验证。

## 推荐调试流程

如果你想得到和当前主开发环境接近的体验，建议按下面顺序操作：

- 克隆仓库
- 执行 `npm install`
- 配置 `.env`
- 确保后端服务已经启动，并且 `.env` 指向正确地址
- 执行 `npm run tauri dev`

如果只是想快速看页面样式或排查普通前端逻辑，也可以只执行：

```bash
npm run dev
```

## 本地数据库说明

当前桌面端本地数据库使用的是 Tauri 官方 SQLite 插件。

这意味着：

- 浏览器存储方案已经被移除
- 需要在 Tauri 环境下调试数据库相关功能
- 涉及本地消息、密钥、会话缓存时，优先使用 `npm run tauri dev` 进行联调

## 联调前自检

如果启动后出现接口或登录异常，请优先检查以下内容：

- `.env` 是否存在
- `VITE_API_BASE_URL` 是否能访问
- `VITE_WS_BASE_URL` 是否正确
- 后端服务是否已经启动
- 本机是否已安装 Rust
- 是否使用 `npm run tauri dev` 启动桌面端而不是仅使用浏览器访问

## 当前脚本

项目当前可用脚本如下：

```bash
npm run dev
npm run build
npm run preview
npm run tauri dev
npm run tauri build
```
