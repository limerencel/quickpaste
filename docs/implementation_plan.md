# QuickPaste — 极速在线剪贴板

你已经有一个功能丰富的 CloudPaste，但它太重了。这个项目的目标是做一个**极致轻量、极致快速**的剪贴板工具，从技术栈选择到部署，一切以"快"为核心。

## 核心设计理念

> [!IMPORTANT]
> **"快"体现在三个层面：**
> 1. **开发快** — 整个项目 ~5 个文件，无需编译、无需打包
> 2. **加载快** — 前端零框架，纯 HTML/CSS/JS，gzip 后 < 15KB，首屏 < 100ms
> 3. **部署快** — `npm install && node server.js` 一行命令跑起来，或一键部署到 Railway/Render/Fly.io

## 技术栈选择及理由

| 层级 | 选择 | 理由 |
|------|------|------|
| **运行时** | Node.js (你已有 v24.10.0) | 零额外安装 |
| **HTTP 框架** | **Fastify** | 比 Express 快 ~3x，内置 JSON schema 验证，插件生态好 |
| **数据库** | **better-sqlite3** | 同步 API 无 async 开销，单文件零配置，读性能极高 |
| **前端** | **纯 HTML + CSS + Vanilla JS** | 零框架 = 零打包 = 零编译 = 极速加载 |
| **实时同步** | **SSE (Server-Sent Events)** | 比 WebSocket 轻，浏览器原生支持，单向推送足够 |
| **认证** | **bcrypt + httpOnly JWT Cookie** | 安全且无需前端存 token |
| **分享 ID** | **nanoid (短 ID)** | 比 UUID 短得多，URL 友好 |

## User Review Required

> [!IMPORTANT]
> **项目目录名**：我计划创建在 `D:\Dev\quickpaste`。你已有 `CloudPaste`，这个是完全独立的新项目。

> [!IMPORTANT]  
> **部署方案**：计划支持以下部署方式，你倾向哪种？
> - **VPS 直接跑** — `node server.js`，用 PM2 守护，Nginx/Caddy 反代
> - **Railway / Render** — 绑定 Git 仓库自动部署，免费额度够用
> - **Docker** — 提供 Dockerfile，一键 `docker run`
> 
> 代码层面我会让三种方式都能直接用，但 README 里会着重写你选的方式。

## Open Questions

> [!IMPORTANT]
> 1. **数据库选择**：better-sqlite3 意味着数据在服务器本地磁盘，单机部署。如果你需要边缘/全球分布，需要换成 Cloudflare D1 或 Turso。你的使用场景应该是个人/小团队，SQLite 足够吗？
> 2. **是否需要文件上传**：这个版本只做文本/链接剪贴板，不做文件上传（你的 CloudPaste 已经有了）。确认？
> 3. **保留时间**：剪贴板内容是永久保留，还是自动过期清理（比如 7 天）？

## Proposed Changes

### 项目结构

```
D:\Dev\quickpaste\
├── server.js           # 主服务器 (Fastify + 所有路由)
├── db.js               # SQLite 初始化 + 数据操作层
├── package.json
├── .env.example        # 环境变量模板
├── Dockerfile          # 可选 Docker 部署
└── public/             # 静态前端文件
    ├── index.html      # 主应用 (登录后的剪贴板界面)
    ├── login.html      # 登录/注册页
    ├── share.html      # 公开分享页 (无需登录)
    ├── style.css        # 全局样式
    └── app.js          # 客户端逻辑
```

---

### 后端 — server.js + db.js

#### [NEW] [server.js](file:///D:/Dev/quickpaste/server.js)

主服务器文件，所有逻辑集中在一个文件中：
- **Fastify 实例**：注册 `@fastify/static`（静态文件）、`@fastify/cookie`（cookie 解析）、`@fastify/cors`
- **Auth 路由**：
  - `POST /api/register` — 注册（bcrypt hash 密码）
  - `POST /api/login` — 登录（返回 httpOnly JWT cookie）
  - `POST /api/logout` — 登出（清除 cookie）
- **Clip 路由**（需认证）：
  - `GET /api/clips` — 获取当前用户所有 clips，按时间倒序
  - `POST /api/clips` — 创建新 clip
  - `DELETE /api/clips/:id` — 删除 clip
  - `POST /api/clips/:id/share` — 生成/获取分享链接
  - `DELETE /api/clips/:id/share` — 取消分享
- **分享路由**（公开）：
  - `GET /api/share/:shareId` — 获取分享内容
- **SSE 路由**（需认证）：
  - `GET /api/sse` — SSE 连接，推送该用户的 clip 变更事件
- **认证中间件**：验证 JWT cookie，提取 userId

#### [NEW] [db.js](file:///D:/Dev/quickpaste/db.js)

SQLite 数据层：
```sql
-- 用户表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_username ON users(username);

-- 剪贴板表
CREATE TABLE clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  share_id TEXT UNIQUE,        -- 分享短 ID (nanoid)，null 表示未分享
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_clips_user_id ON clips(user_id);
CREATE INDEX idx_clips_share_id ON clips(share_id);
```

导出函数：
- `createUser(username, passwordHash)` → user
- `findUserByUsername(username)` → user | null
- `getClipsByUserId(userId)` → clips[]
- `createClip(userId, content)` → clip
- `deleteClip(clipId, userId)` → boolean
- `setShareId(clipId, userId, shareId)` → clip
- `removeShareId(clipId, userId)` → boolean
- `getClipByShareId(shareId)` → clip | null

所有查询都是 **better-sqlite3 的同步调用**，无 async 开销，微秒级响应。

---

### 前端 — public/

#### [NEW] [style.css](file:///D:/Dev/quickpaste/public/style.css)

设计风格：**暗色主题 + 玻璃态 + 极简**

- CSS 变量定义色彩系统（暗色为主，明亮强调色）
- 移动优先响应式（手机是主要输入端）
- 毛玻璃卡片效果（`backdrop-filter: blur`）
- 流畅的微动画（fade-in、slide-up、按钮反馈）
- 大号输入区域，粗手指也好点
- 单条 clip 卡片设计：内容 + 复制按钮 + 分享按钮 + 删除按钮 + 时间戳

#### [NEW] [index.html](file:///D:/Dev/quickpaste/public/index.html)

主界面，登录后使用：
- 顶部：大号 `<textarea>`，按回车或点按钮发送
- 下方：clip 列表，最新在最上面
- 每个 clip 卡片上：一键复制、分享、删除
- 标记链接类型的 clip 为可点击
- 底部：登出按钮

#### [NEW] [login.html](file:///D:/Dev/quickpaste/public/login.html)

登录/注册二合一页面：
- 用户名 + 密码表单
- 切换登录/注册模式的 toggle
- 错误提示

#### [NEW] [share.html](file:///D:/Dev/quickpaste/public/share.html)

公开分享页（无需登录）：
- 显示分享的 clip 内容
- 一键复制按钮
- 如果是 URL，显示可点击链接
- QuickPaste 品牌 + "创建自己的剪贴板" 引导

#### [NEW] [app.js](file:///D:/Dev/quickpaste/public/app.js)

客户端逻辑：
- **SSE 连接管理**：连接 `/api/sse`，收到事件自动刷新列表（实现跨设备实时同步）
- **API 调用封装**：login/register/createClip/deleteClip/share/unshare
- **剪贴板操作**：`navigator.clipboard.writeText()` 一键复制
- **URL 检测**：自动识别内容中的链接并渲染为可点击
- **离线提示**：网络断开时显示重连状态
- **快捷键**：Ctrl+Enter 快速发送

---

### 部署配置

#### [NEW] [package.json](file:///D:/Dev/quickpaste/package.json)

```json
{
  "name": "quickpaste",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "fastify": "^5",
    "@fastify/static": "^8",
    "@fastify/cookie": "^11",
    "better-sqlite3": "^11",
    "bcryptjs": "^3",
    "jsonwebtoken": "^9",
    "nanoid": "^5"
  }
}
```

> [!NOTE]
> 总共只有 **7 个依赖**，`node_modules` 很小，安装快。

#### [NEW] [.env.example](file:///D:/Dev/quickpaste/.env.example)

```env
PORT=3000
JWT_SECRET=change-me-to-a-random-string
DB_PATH=./data/quickpaste.db
```

#### [NEW] [Dockerfile](file:///D:/Dev/quickpaste/Dockerfile)

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
```

## 关键优化点

### 为什么这个方案极快

1. **前端零打包**：HTML/CSS/JS 直接由 Fastify 的静态文件插件提供，gzip 后 < 15KB
2. **SSE 而非轮询**：页面打开后建立 SSE 连接，新 clip 由服务器推送，延迟 < 50ms
3. **同步 SQLite**：better-sqlite3 用 C++ 绑定同步执行 SQL，查询耗时 < 1ms
4. **Fastify 性能**：比 Express 快 3 倍，内置 JSON 序列化优化
5. **Cookie 认证**：httpOnly cookie 自动发送，前端零 token 管理逻辑
6. **nanoid 短链**：分享链接短小，好输入好分享

### 实时同步原理

```
手机打开页面 → POST /api/clips "https://example.com"
                    ↓
              server 存入 SQLite
                    ↓
              server 向该用户所有 SSE 连接推送 "new_clip" 事件
                    ↓
电脑页面收到 SSE 事件 → 自动插入新 clip 到列表顶部（无需刷新）
```

## Verification Plan

### Automated Tests
- 启动服务器后手动测试所有 API 端点
- 验证 SSE 实时推送功能

### Manual Verification
1. 在两个浏览器标签页登录同一账号
2. 在一个标签页粘贴内容，另一个标签页应立即看到
3. 点击分享按钮，在隐私窗口打开分享链接确认可访问
4. 在手机浏览器上测试响应式布局和操作体验
5. 测试注册 → 登录 → 发送 → 复制 → 分享 → 删除完整流程
