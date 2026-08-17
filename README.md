# dsh-quota-badge · DeepSeek Harness 余额徽章插件

在 DeepSeek Harness 侧边栏底部（设置按钮上方）实时显示你的 **DeepSeek 账户余额**，并可在 **设置 → 余额监控** 页面查看趋势、调整参数：

```
余额 ● 20.99¥ ⟳
     │   │    └─ 手动刷新（点击旋转）
     │   └────── 数字滚轮动画：上升滚绿 / 下降滚红，滚动后渐回原色
     └────────── 指示圆点：平时暗灰，每次刷新闪银光，上升闪绿 / 下降闪红
```

- **数据源**：DeepSeek 官方余额 API（`GET https://api.deepseek.com/user/balance`，CNY）
- **刷新**：自动刷新（间隔可调）+ 手动刷新按钮
- **无边框、无悬停提示**，风格跟随主题
- 余额变化时每位数字以**滚轮方式**滚动到新值，方向色（绿升 / 红降）在动画末段渐变为主题原色

### 设置 → 余额监控

设置面板新增「余额监控」页面：

- **余额卡片**：实时余额大数字 + 状态圆点 + 手动刷新 + 最后更新时间 + 查询状态
- **余额趋势**：Sparkline 曲线（数据由 Host 端按次采样持久化），支持近 30 分钟 / 近 1 小时 / 全部 三个区间，附区间最低 / 最高 / 当前值
- **参数**（修改立即保存、立即生效）：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 显示侧边栏余额徽章 | 开 | 隐藏时恢复默认的插件管理按钮 |
| 自动刷新余额 | 开 | 关闭后不再定时查询 |
| 自动刷新间隔（秒） | 5 | 范围 3–600 秒 |
| 显示「高峰/空闲」时段标签 | 开 | 徽章上标注当前时段 |
| 悬停显示峰谷价格面板 | 开 | 悬停徽章 3 秒展开价格曲线 |

参数与历史数据保存在 `~/.dsh/.quota-badge.json`（历史最多保留 720 条采样，约 1 小时 @5 秒）。

### 悬停价格坐标系

**鼠标悬停余额徽章 3 秒**，黑色面板向上展开，显示 DeepSeek 峰谷定价坐标系：

- **X 轴**：0–24 点时段（北京时间）
- **Y 轴**：元 / 百万 tokens
- 高峰时段（9:00–12:00、14:00–18:00）背景淡橙高亮，其余空闲半价
- 两条阶梯曲线：V4-Flash（青）与 V4-Pro（紫）的输出价
- 红色虚线标记**本机当前时刻**，与曲线交点标圆点，底部显示「现在 HH:MM · 高峰/空闲 · 当前输出价」

定价数据来源：[DeepSeek 官方定价文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（峰谷方案，2026-08-17 起生效）。

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
| Host | `lib/index.js` | Cordis 插件：注册 `GET /quota/balance`（经 `credentials` 解析 `DEEPSEEK_API_KEY`，用全局 fetch 查询官方余额 API，返回 `{ balance, currency, error }`，成功后记录历史采样）、`GET/POST /quota/config`（读写参数，持久化到 `~/.dsh/.quota-badge.json`） |
| Client | `lib/client.js` | 浏览器插件 bundle（`window.__ModuleLoader__.load` 格式）：`sidebar.footer.action` 插槽注册徽章 UI，`settings.section` 插槽注册「余额监控」设置页；共享 store 驱动滚轮动画、闪烁指示、趋势图与参数联动 |
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
