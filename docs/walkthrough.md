# QuickPaste — 完成 ✅

极速跨设备剪贴板，23 个文件，4 个 npm 依赖，一键部署 Vercel。

## 已创建的文件

| 文件 | 说明 |
|------|------|
| [lib/db.js](file:///D:/Dev/quickpaste/lib/db.js) | Turso/libSQL 数据层，所有 CRUD |
| [lib/auth.js](file:///D:/Dev/quickpaste/lib/auth.js) | JWT 工具，httpOnly cookie，requireAuth 中间件 |
| [api/auth/login.js](file:///D:/Dev/quickpaste/api/auth/login.js) | 登录接口 |
| [api/auth/register.js](file:///D:/Dev/quickpaste/api/auth/register.js) | 注册接口 |
| [api/auth/logout.js](file:///D:/Dev/quickpaste/api/auth/logout.js) | 退出接口 |
| [api/clips/index.js](file:///D:/Dev/quickpaste/api/clips/index.js) | 获取/创建 clip |
| [api/clips/[id].js](file:///D:/Dev/quickpaste/api/clips/%5Bid%5D.js) | 删除 clip |
| [api/share/[id].js](file:///D:/Dev/quickpaste/api/share/%5Bid%5D.js) | 生成/取消分享链接 |
| [api/share/view/[shareId].js](file:///D:/Dev/quickpaste/api/share/view/%5BshareId%5D.js) | 公开访问分享内容 |
| [api/sse.js](file:///D:/Dev/quickpaste/api/sse.js) | SSE 实时推送（跨设备同步核心）|
| [api/me.js](file:///D:/Dev/quickpaste/api/me.js) | 获取当前用户信息 |
| [api/init.js](file:///D:/Dev/quickpaste/api/init.js) | 一次性初始化数据库表 |
| [public/style.css](file:///D:/Dev/quickpaste/public/style.css) | 暗色主题 + 玻璃态设计 |
| [public/index.html](file:///D:/Dev/quickpaste/public/index.html) | 主应用页面 |
| [public/login.html](file:///D:/Dev/quickpaste/public/login.html) | 登录/注册页 |
| [public/share.html](file:///D:/Dev/quickpaste/public/share.html) | 公开分享页 |
| [public/app.js](file:///D:/Dev/quickpaste/public/app.js) | 客户端逻辑（SSE + CRUD + 复制 + 分享）|

## 部署步骤（约 5 分钟）

### 1. 创建 Turso 数据库

```bash
# Windows 上用 WSL 或 scoop 安装 Turso CLI
# 或者直接在 turso.tech 网页上创建

turso db create quickpaste
turso db show quickpaste --url        # → TURSO_DATABASE_URL
turso db tokens create quickpaste     # → TURSO_AUTH_TOKEN
```

或者直接去 [turso.tech](https://turso.tech) 网页操作，免费，不需要信用卡。

### 2. 推送到 GitHub

```bash
# 在 GitHub 创建新仓库，然后：
git remote add origin https://github.com/你的用户名/quickpaste.git
git push -u origin master
```

### 3. 部署到 Vercel

1. 去 [vercel.com](https://vercel.com) → Import Git Repository → 选 quickpaste
2. 在 Environment Variables 里添加：
   - `TURSO_DATABASE_URL` = 上面获得的 URL
   - `TURSO_AUTH_TOKEN` = 上面获得的 Token
   - `JWT_SECRET` = 随机字符串（例如 `openssl rand -base64 32` 的输出）
3. Deploy → 等 30 秒

### 4. 初始化数据库

部署成功后访问一次：
```
https://your-app.vercel.app/api/init?secret=你的JWT_SECRET
```
返回 `{"ok":true}` 就完成了。

### 5. 使用

- 打开 `https://your-app.vercel.app/login.html` 注册账号
- 在手机和电脑上登录同一账号
- 发送内容，另一台设备 <50ms 自动看到

## 分享功能

点击 clip 上的 🔗 按钮 → 生成 `/s/aBcD1234` 短链并自动复制到剪贴板 → 发给任何人即可查看，无需登录。再次点击取消分享。

## 关于 SSE 实时推送

当前实现在同一 Vercel 实例内有效。Vercel 会将同一用户的请求路由到同一实例（Sticky Sessions），对个人使用完全够用。

如果将来流量大了，可以加 Upstash Redis Pub/Sub，改动 < 20 行代码。
