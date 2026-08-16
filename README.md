# dsh-quota-badge · DeepSeek Harness 余额徽章插件

在 DeepSeek Harness 侧边栏底部（设置按钮上方）实时显示你的 **DeepSeek 账户余额**：

```
余额 ● 20.99¥ ⟳
     │   │    └─ 手动刷新（点击旋转）
     │   └────── 数字滚轮动画：上升滚绿 / 下降滚红，滚动后渐回原色
     └────────── 指示圆点：平时暗灰，每次刷新闪银光，上升闪绿 / 下降闪红
```

- **数据源**：DeepSeek 官方余额 API（`GET https://api.deepseek.com/user/balance`，CNY）
- **刷新**：每 5 秒自动 + 手动刷新按钮
- **无边框、无悬停提示**，风格跟随主题
- 余额变化时每位数字以**滚轮方式**滚动到新值，方向色（绿升 / 红降）在动画末段渐变为主题原色

## 安装

要求：DeepSeek Harness 桌面版（或 Web 版），Node.js ≥ 18。

### 1. 安装插件包

```bash
cd ~/.dsh/profiles/desktop
npm install <git仓库地址>
# 或 pnpm add <git仓库地址>
```

> 也可以把整个仓库目录复制到 `~/.dsh/profiles/desktop/node_modules/` 下（保持目录名 `dsh-quota-badge`）。

### 2. 在 profile 中启用

编辑 `~/.dsh/profiles/desktop/package.json`，把 `dsh.profile.bundles` 数组加上包名：

```jsonc
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-quota-badge"          // ← 加上这一行
    ]
  }
}
```

### 3. 配置 API Key

确保 `~/.dsh/.credentials.yaml` 里有你的 DeepSeek API Key（模型本身在用就会自动有）：

```yaml
DEEPSEEK_API_KEY: sk-xxxxxxxxxxxxxxxx
```

### 4. 重启

**完全退出并重新打开 DeepSeek Harness**（插件集合变更需要重启生效）。侧边栏底部设置按钮上方就会出现余额徽章。

## 卸载

```bash
cd ~/.dsh/profiles/desktop
npm uninstall dsh-quota-badge
# 并从 package.json 的 dsh.profile.bundles 移除 "dsh-quota-badge"
```

重启后生效。另外，插件运行期间会隐藏默认的 cordis 插件管理按钮（替换其插槽 cell）；卸载后自动恢复。

## 工作原理

| 端 | 文件 | 说明 |
| --- | --- | --- |
| Host | `lib/index.js` | Cordis 插件：注册 `GET /quota/balance` 路由，经 `credentials` 解析 `DEEPSEEK_API_KEY`，用 `shell`(curl) 查询官方余额 API，返回 `{ balance, currency, error }` |
| Client | `lib/client.js` | 浏览器插件 bundle（`window.__ModuleLoader__.load` 格式）：`sidebar.footer.action` 插槽注册徽章 UI，每 5 秒 `fetch('/quota/balance')`，滚轮动画 + 闪烁指示 |
| 组合 | `cordis.patch.yml` | 声明 host 加载入口（`dsh.bundle.patch` 机制） |

## 开发与发布

```bash
git init
git add -A
git commit -m "dsh-quota-badge: DeepSeek 余额徽章插件"
git remote add origin <你的仓库地址>
git push -u origin main
```

其他用户即可用 `npm install git+<你的仓库地址>` 安装（见上文）。

## License

MIT
