# dsh-quota-badge · DeepSeek Harness 余额徽章插件

在 DeepSeek Harness 侧边栏底部（设置按钮上方）实时显示你的 **DeepSeek 账户余额**，并可在 **设置 → 余额监控** 页面查看趋势、调整参数。**支持账户内全部币种（CNY / USD / 其他）**，自动识别并列出：

```
余额 ● 20.99¥ ⟳
     │   │    └─ 手动刷新（点击旋转）
     │   └────── 数字滚轮动画：上升滚绿 / 下降滚红，滚动后渐回原色
     └────────── 指示圆点：平时暗灰，每次刷新闪银光，上升闪绿 / 下降闪红
```

**桌面版（Electron）与 Web 版都支持**（1.6.0 起桌面版使用插件自带的回环载体，见下文「桌面版支持与回环载体」一节）。

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
- **关于与更新**：显示当前版本（v1.6.0），「自动检查更新」开关（默认开，启动后及每 6 小时自动检查）+「检查更新」按钮手动检测。点击「检查更新」后会给出明确反馈：已是最新显示「检查完成：已是最新版本」，发现新版本显示「检查完成：发现新版本」并出现**「更新」按钮**。版本来源为 GitHub 仓库 `main` 分支的 `package.json`（发布者更新版本号并 `git push` 即可，无需打 tag）。点「更新」后按安装形态分流：

  - **包管理器安装**（npm / pnpm / 桌面版插件管理器，即插件路径里含 `node_modules`）：**不会就地覆盖文件**（pnpm store 里是硬链接，由宿主的包事务拥有），而是返回 `{ ok: false, reason: 'managed', command: 'pnpm add dsh-quota-badge@<最新版>' }`，卡片把这条升级命令放进可复制提示框；
  - **git 检出**：`git fetch origin` 后快进 `origin/main`，工作区有未提交修改时拒绝更新；
  - **普通拷贝**（没有 `.git`）：下载仓库 tarball 覆盖插件文件。

  更新成功后提示重启应用生效；**更新失败时提供可复制提示框**（托管安装给升级命令，其余给「更新余额插件 + 仓库地址」，点「复制」即可复制给别人/交给 AI 代为更新）。
- **诊断**（设置页最后一张卡片）：宿主可达 / 传输方式 / 插件版本 / 宿主 Node / 会话日志回填 (zstd) / 宿主请求数 / 最近读取错误 / 宿主最近错误 / 页面传输错误，「刷新」重新探测、「复制诊断信息」一键复制整份报告（含插件仓库地址与页面收到的注入信息）。徽章空白、圆点变红时先看这里。
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

## 桌面版支持与回环载体（1.6.0）

桌面版（Electron）的宿主组合和 Web 版完全不同：应用复用浏览器组合，但用 `@deepseek-ai/dsh-desktop-host/config/desktop.cordis.patch.yml` 覆盖层禁用了 `web-startup`、`webserver` 等行，所以 **`webServer` 服务不存在**，宿主也不监听任何端口（前端经 `dsh-app://` 与分帧字节管道送到窗口）。1.5.x 的插件要求这个服务，loader 行会永远停在 `pending (waiting for service: webServer)`，界面上什么都不出现、也没有报错。

1.6.0 的载体（`lib/index.js` 的 `createCarrier(ctx)`）：

- **有真实 `webServer` 就用它**——Web profile 行为与 1.5.x 完全一致（同源相对路径 `/quota/*`）；
- **否则起一个回环载体**：`node:http` 服务只绑定 `127.0.0.1`，在 `17871–17880` 里取第一个空闲端口，每次宿主启动生成一次性令牌（`randomBytes(24)`）。所有数据路由都要令牌（`?token=` 或 `Authorization: Bearer`），`GET /quota/health` 免鉴权、只返回诊断信息；
- 宿主通过 `webserver/index-inject` 钩子把 `window.__QUOTA_BADGE_HOST__ = { origin, token, ports }` 注入渲染页面（桌面版资源处理器渲染 index 时也会发出这个钩子），浏览器半边据此把请求发到回环 origin；只缺令牌时会探测 `17871–17880` 的 `/quota/health`，并把失败原因写进状态而不是静默失败；
- 宿主诊断写入 `~/.dsh/.quota-badge.log`（可用 `DSH_HOME` 改目录）：载体类型、监听地址、端口耗尽、路由异常。桌面宿主自己的 stderr 不会被应用持久化，排查时先看这个文件；
- 插件只需要两样东西：`~/.dsh/.credentials.yaml` 里的 `DEEPSEEK_API_KEY`，以及能访问 `https://api.deepseek.com/user/balance` 的网络。不需要 shell、不需要 `webServer`、不需要任何其他服务。

两种宿主面的完整对照、安全模型（本机其他进程能读到什么）和症状排查表见 [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md)；想在不启动应用的情况下验证桌面兼容性，用 [`tools/probe-desktop-host.mjs`](tools/probe-desktop-host.mjs)（见该文档第五节）。

## 安装

要求：DeepSeek Harness 桌面版（或 Web 版），Node.js ≥ 18。

### 1. 安装插件包

| 场景 | 做法 | 说明 |
| --- | --- | --- |
| Web profile（git 检出，现在就能用） | `git clone https://github.com/yoiizesdev-crypto/DSH-Balance-display.git ~/.dsh/profiles/web/node_modules/dsh-quota-badge` | Web profile 由你本人管理，可以直接改；之后「更新」按钮走 git 快进 |
| Web profile（目录拷贝，现在就能用） | 把仓库目录整个复制成 `~/.dsh/profiles/web/node_modules/dsh-quota-badge`（目录名必须保持一致） | 没有 git 时的兜底；之后「更新」按钮走 tarball 覆盖 |
| Web profile（包管理器从 git 装，现在就能用） | `cd ~/.dsh/profiles/web && pnpm add github:yoiizesdev-crypto/DSH-Balance-display`（或 `npm install github:yoiizesdev-crypto/DSH-Balance-display`） | 与 npm registry 无关；会把 `dsh-quota-badge` 写进 `dependencies`，之后「更新」按钮按托管安装处理（给升级命令） |
| Web profile（npm / pnpm registry） | `cd ~/.dsh/profiles/web && npm install dsh-quota-badge@1.6.0`（或 `pnpm add dsh-quota-badge@1.6.0`） | 需要插件已发布到 npm，见下方提示 |
| 桌面版（应用内插件管理器） | 在应用的插件管理窗口里安装 `dsh-quota-badge@1.6.0` | 只接受 npm registry 规格 + **精确版本**，由应用自带的 pnpm 装进桌面 profile 的 `node_modules`；同样需要已发布到 npm |
| 桌面版（其他任何方式） | **不支持** | 桌面 profile 由 Electron 应用独占管理：`dsh plugin --profile desktop …` 会被拒绝（`profile desktop is managed exclusively by the Electron application`），手工复制进去的文件也会被应用的包事务清理/重写 |

> **尚未发布到 npm**：`https://registry.npmjs.org/dsh-quota-badge` 目前返回 404，所以上面的 registry 行与桌面版插件管理器那一行要等发布后才可用。发布之前：Web profile 用 git 检出、目录拷贝或「包管理器从 git 装」；桌面版要么先用 Web profile，要么等发布后用应用内插件管理器安装。

### 2. 在 profile 中启用

Web profile：编辑 `~/.dsh/profiles/web/package.json`，把 `dsh.profile.bundles` 数组加上包名（桌面版不要手改，应用的包事务会重写这个文件）：

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

确保 `~/.dsh/.credentials.yaml` 里有你的 DeepSeek API Key（模型本身在用就会自动有）——这是插件唯一需要的凭据：

```yaml
DEEPSEEK_API_KEY: sk-xxxxxxxxxxxxxxxx
```

### 4. 重启

**完全退出并重新打开 DeepSeek Harness**（插件集合变更需要重启生效）。侧边栏底部设置按钮上方就会出现余额徽章；如果没出现，先看 **设置 → 余额监控 → 诊断**（见 [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) 第六节的症状排查表）。

## 卸载

Web profile（插件由你安装时）：

```bash
cd ~/.dsh/profiles/web
npm uninstall dsh-quota-badge      # 或 pnpm remove dsh-quota-badge
# 并从 package.json 的 dsh.profile.bundles 移除 "dsh-quota-badge"
# 目录拷贝安装的，直接删掉 node_modules/dsh-quota-badge
```

桌面版：在应用自己的插件管理窗口里卸载/停用（profile 由应用独占管理，不要手改）；手工复制进去的副本要手工删掉。

重启后生效。另外，插件运行期间会隐藏默认的 cordis 插件管理按钮（替换其插槽 cell）；卸载后自动恢复。

## 工作原理

| 端 | 文件 | 说明 |
| --- | --- | --- |
| Host | `lib/index.js` | Cordis 插件：注册 `GET /quota/balance`（经 `credentials` 解析 `DEEPSEEK_API_KEY`，用全局 fetch 查询官方余额 API，返回**全部币种** `{ balances, balance, currency, error }`，成功后记录多币种历史采样）、`GET/POST /quota/config`（读写参数，持久化到 `~/.dsh/.quota-badge.json`）、`GET /quota/usage`、`POST /quota/reset`、`GET|POST /quota/update/check`、`POST /quota/update/apply`、`GET /quota/health`（诊断，回环载体下唯一免鉴权路由） |
| 载体 | `lib/index.js` | `createCarrier(ctx)`：Web profile 用真实 `webServer` 注册路由；桌面版起 `127.0.0.1` 回环 HTTP 服务（`17871–17880` 第一个空闲端口 + 每次启动的随机令牌），并把 `window.__QUOTA_BADGE_HOST__` 注入页面 |
| Client | `lib/client.js` | 浏览器插件 bundle（`window.__ModuleLoader__.load` 格式）：`sidebar.footer.action` 插槽注册徽章 UI（侧边栏折叠时渲染紧凑形态），`settings.section` 插槽注册「余额监控」设置页（含「诊断」卡片）；`quotaFetch()` 统一处理宿主传输，共享 store 驱动滚轮动画、闪烁指示、趋势图与参数联动 |
| 组合 | `cordis.patch.yml` | 声明 host 加载入口（`dsh.bundle.patch` 机制），loader 行只注入 `credentials`；`package.json` 的 `dsh.client` 声明浏览器半边（`platform: web`、`immediately: true`，与内置 `dsh-client-ui-theme` 一致） |

## 开发与发布

```bash
git init
git add -A
git commit -m "dsh-quota-badge: DeepSeek 余额徽章插件"
git remote add origin <你的仓库地址>
git push -u origin main
```

发布方式就是推送 `main`：插件的「检查更新」比对的是仓库 `main` 分支 `package.json` 的 `version`，所以升级时改 `package.json` + `CHANGELOG.md` 再推送即可，无需打 tag。其他用户可用 `pnpm add github:<你的仓库地址>`（Web profile，见上文安装矩阵）或把仓库目录拷进 profile 的 `node_modules` 安装；要发布到 npm 时，`files` 白名单已包含 `lib`、`cordis.patch.yml`、`README.md`、`CHANGELOG.md`、`LICENSE`。

## License

MIT
