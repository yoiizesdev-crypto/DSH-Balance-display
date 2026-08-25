# dsh-quota-badge · DeepSeek Harness 余额徽章插件

在 DeepSeek Harness 侧边栏底部（设置按钮上方）实时显示你的 **DeepSeek 账户余额**，并可在 **设置 → 余额监控** 页面查看趋势、调整参数。**支持账户内全部币种（CNY / USD / 其他）**，自动识别并列出：

```
余额 ● 20.99¥ ⟳
     │   │    └─ 手动刷新（点击旋转）
     │   └────── 数字滚轮动画：上升滚绿 / 下降滚红，滚动后渐回原色
     └────────── 指示圆点：平时暗灰，每次刷新闪银光，上升闪绿 / 下降闪红
```

- **数据源**：DeepSeek 官方余额 API（`GET https://api.deepseek.com/user/balance`）
- **多币种**：返回账户内**全部币种**余额；徽章显示所选币种（默认自动 = CNY 优先，否则第一个可用币种），设置页列出每个币种明细
- **刷新**：自动刷新（间隔可调）+ 手动刷新按钮
- **无边框、无悬停提示**，风格跟随主题
- 余额变化时每位数字以**滚轮方式**滚动到新值，方向色（绿升 / 红降）在动画末段渐变为主题原色

### 设置 → 余额监控

设置面板新增「余额监控」页面：

- **余额卡片**：所选币种的实时大数字 + 币种标签 + 状态圆点 + 手动刷新；下方**明细列表**展示账户内每个币种的余额（如 `CNY ¥21.00`、`USD $12.35`），CNY 恒在首位
- **余额趋势**：Sparkline 曲线（数据由 Host 端按次采样持久化，每个币种独立记录），跟随所选币种，支持近 30 分钟 / 近 1 小时 / 全部 三个区间，附区间最低 / 最高 / 当前值；**鼠标悬停显示股票式十字光标与实时数值提示**
- **徽章刷新行为**：自动刷新时数字**静默更新**（不滚动）；**手动点击刷新**才播放滚轮动画
- **用量统计**（比官网多：不限 30 天，含安装前的历史）：

  - **历史回填**：DeepSeek 官方没有用量历史 API，但 Harness 本地持久化了全部会话日志（含每次调用的 tokens）——插件启动时扫描这些日志，把**安装插件之前的调用**也回填进账本（增量扫描 + 事件指纹去重，重复扫描不会重复记账）
  - **分 Key 统计**：按 API Key 分组显示（Key 以指纹 `sk-a…0XYZ` 形式展示，不泄露明文），可切换「全部」或单个 Key
  - **汇总卡片**：累计消费金额、请求次数、输入 / 输出 / 缓存 Tokens
  - **每日消费折线**：昨天 / 近 7 天 / 近 30 天 / 全部 四个范围，悬停显示每日数值
  - **模型明细表**：按模型（V4-Flash / V4-Pro）列出请求数、输入 / 输出 / 缓存 Tokens 与金额
  - 数据来源：订阅 Harness 自身每次真实 LLM 调用（`session/event` 的 usage 字段）+ 历史会话日志回填，按 DeepSeek 官方峰谷定价（元/百万 tokens，工作日 9:00–12:00 / 14:00–18:00 高峰，周末全天低谷价）估算费用，持久化在本地
- **关于与更新**：显示当前版本（v1.3.1），「自动检查更新」开关（默认开，启动后及每 6 小时自动检查）+「检查更新」按钮手动检测。点击「检查更新」后会给出明确反馈：已是最新显示「检查完成：已是最新版本」，发现新版本显示「检查完成：发现新版本」并出现**「更新」按钮**，点击后一键拉取仓库最新代码（git 快进合并），成功后提示重启应用生效；**更新失败时提供可复制提示框**（内容为「更新余额插件 + 仓库地址」，点「复制」即可复制给别人/交给 AI 代为更新）。版本来源为 GitHub 仓库 `main` 分支的 `package.json`（发布者更新版本号并 `git push` 即可，无需打 tag）
- **参数**（修改立即保存、立即生效）：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 徽章显示币种 | 自动 | 自动 = CNY 优先，否则第一个可用币种；也可固定为 USD 等具体币种 |
| 显示侧边栏余额徽章 | 开 | 隐藏时恢复默认的插件管理按钮 |
| 自动刷新余额 | 开 | 关闭后不再定时查询 |
| 刷新间隔（秒） | 5 | 范围 3–600 秒；每次刷新数字滚动、圆点呼吸一次 |
| 数字滚动时长（秒） | 1.5 | 余额数字滚轮动画时长，范围 1–3 秒 |
| 显示「高峰/空闲」时段标签 | 开 | 徽章上标注当前时段 |
| 悬停显示峰谷价格面板 | 开 | 悬停徽章 3 秒展开价格曲线 |
| 自动检查更新 | 开 | 启动后及每 6 小时自动检查 GitHub 新版本 |

参数、历史与用量数据保存在 `~/.dsh/.quota-badge.json`（历史最多保留 720 条采样，约 1 小时 @5 秒；旧版单币种数据自动迁移为 CNY；用量统计按 Key × 天 永久保留）。

### 悬停价格坐标系

**鼠标悬停余额徽章 3 秒**，黑色面板向上展开，显示 DeepSeek 峰谷定价坐标系：

- **X 轴**：0–24 点时段（北京时间）
- **Y 轴**：元 / 百万 tokens
- 工作日高峰时段（9:00–12:00、14:00–18:00）背景淡橙高亮，其余空闲半价；**周末（周六/周日）全天低谷价，无高峰带**（2026-08-23 起生效）
- 两条阶梯曲线：V4-Flash（青）与 V4-Pro（紫）的输出价
- 红色虚线标记**本机当前时刻**，与曲线交点标圆点，底部显示「现在 HH:MM · 高峰/空闲/周末低谷 · 当前输出价」

定价数据来源：[DeepSeek 官方定价文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（峰谷方案，2026-08-17 起生效；周末全天低谷价，2026-08-23 起生效）。

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
| Host | `lib/index.js` | Cordis 插件：注册 `GET /quota/balance`（经 `credentials` 解析 `DEEPSEEK_API_KEY`，用全局 fetch 查询官方余额 API，返回**全部币种** `{ balances, balance, currency, error }`，成功后记录多币种历史采样）、`GET/POST /quota/config`（读写参数，持久化到 `~/.dsh/.quota-badge.json`） |
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
