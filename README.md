# QuickPaste

极速跨设备剪贴板。从手机发到电脑，从电脑发到手机，打开页面即看到。

**技术栈**: Vercel Serverless Functions + Turso (边缘 SQLite) + 纯 HTML/CSS/JS

---

## 部署到 Vercel（推荐）

### 第一步：创建 Turso 数据库

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 登录
turso auth login

# 创建数据库
turso db create quickpaste

# 获取连接信息
turso db show quickpaste --url    # TURSO_DATABASE_URL
turso db tokens create quickpaste  # TURSO_AUTH_TOKEN
```

### 第二步：部署到 Vercel

```bash
# 安装 Vercel CLI（如果没有）
npm i -g vercel

# 部署
vercel

# 按提示操作，然后设置环境变量：
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add JWT_SECRET   # 随机字符串，例如用 openssl rand -base64 32 生成
```

### 第三步：初始化数据库表

部署完成后，访问一次：

```
https://your-app.vercel.app/api/init?secret=你的JWT_SECRET
```

返回 `{"ok":true}` 即成功。

---

## 本地开发

```bash
# 创建 .env 文件
cp .env.example .env
# 填入 Turso 连接信息和 JWT_SECRET

# 安装 Vercel CLI 开发服务器
npm i -g vercel

# 启动本地开发
vercel dev
```

访问 http://localhost:3000

---

## 项目结构

```
quickpaste/
├── api/                    # Vercel Serverless Functions
│   ├── auth/login.js       # POST /api/auth/login
│   ├── auth/register.js    # POST /api/auth/register
│   ├── auth/logout.js      # POST /api/auth/logout
│   ├── clips/index.js      # GET/POST /api/clips
│   ├── clips/[id].js       # DELETE /api/clips/:id
│   ├── share/[id].js       # POST/DELETE /api/share/:id
│   ├── share/view/[shareId].js  # GET /api/share/view/:shareId (公开)
│   ├── sse.js              # GET /api/sse (实时推送)
│   ├── me.js               # GET /api/me
│   └── init.js             # GET /api/init (初始化数据库)
├── lib/
│   ├── db.js               # Turso 数据层
│   └── auth.js             # JWT 工具
├── public/                 # 静态前端
│   ├── index.html          # 主应用
│   ├── login.html          # 登录/注册
│   ├── share.html          # 公开分享页
│   ├── style.css
│   └── app.js
└── vercel.json
```

---

## 分享功能

点击 clip 上的分享按钮 → 生成 `/s/:shareId` 短链 → 自动复制到剪贴板 → 发给任何人即可访问，无需登录。

取消分享：再次点击分享按钮（🔗图标）即可撤销。

---

## 实时同步原理

```
手机发送 clip → POST /api/clips → Turso 存储
                                → SSE 推送给所有打开的页面
电脑上的浏览器收到 SSE 事件 → 自动插入到列表顶部（无需刷新）
```

---

## 升级到真正的多实例实时推送

当前 SSE 在同一 Vercel 实例内有效（个人使用足够）。如需跨实例推送，可集成 Upstash Redis Pub/Sub：

```bash
npm install @upstash/redis
```

在 `api/sse.js` 中订阅 Redis channel，在 `api/clips/index.js` 中发布事件。整体改动 < 20 行。
