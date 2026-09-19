# 更新日志

本文件记录 dsh-quota-badge 的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.6.0] - 2026-09-19

这一版的主题是**让插件在 Electron 桌面版里真正跑起来**：桌面组合从不提供 `webServer` 服务，旧版插件的 loader 行会永远停在 `pending`，界面上一片空白且没有任何报错。

### 修复

- **桌面版（Electron Desktop）里插件永久 pending、徽章完全不出现**：`lib/index.js` 的 `apply()` 过去要求 `webServer` cordis 服务，缺失时直接 `return`。桌面版复用浏览器组合，但 `@deepseek-ai/dsh-desktop-host/config/desktop.cordis.patch.yml` 覆盖层把 `webserver`、`web-startup` 等行 `disabled: true`，所以 `webServer` 服务永远不存在，`ctx.get('webServer')` 恒为 `undefined`，loader 行永远停在 `pending (waiting for service: webServer)`。现在新增 `createCarrier(ctx)`：存在真实 `webServer` 时行为不变（Web profile），否则启动**回环载体**——`node:http` 服务只绑定 `127.0.0.1`，在 `17871–17880` 里取第一个空闲端口，每次宿主启动生成一个进程级随机令牌（`randomBytes(24)`）。
- `cordis.patch.yml`：loader 行只注入 `credentials`，不再注入 `webServer`。宿主半边真正依赖的只有 `credentials`（解析 `DEEPSEEK_API_KEY`），等待 `webServer` 只会让整行卡住。
- `lib/client.js` 新增 `quotaFetch()` 宿主传输层：桌面版走注入的 `origin` + 令牌，Web 版继续用相对路径 `/quota/*`；只有令牌缺失时按顺序探测 `17871–17880` 的 `GET /quota/health`，并把失败原因写进状态而不是静默返回。原因是桌面宿主对 `dsh-app://` 下未知路径一律回 SPA 首页 HTML，相对路径永远到不了宿主的 HTTP 路由。
- `loadConfig()` 不再静默吞掉失败（旧注释是「host half unavailable → keep defaults」）：失败时把错误写进 store，徽章画红点，设置页显示传输诊断。这是过去最难排查的症状——徽章空白且毫无提示。
- 侧边栏折叠成窄栏（`props.wide !== true`）时徽章不再返回 `null`：改为**紧凑形态**（圆点 + 数字，省掉标签、时段与占位符），读取失败时用红点并在 hover `title` 里给出原因。
- 自更新（`applyUpdate()`）识别三种安装形态，不再对托管安装就地覆盖文件：
  - `node_modules` 路径（npm / pnpm / 任意包管理器，含桌面版插件管理器）→ 返回 `{ ok: false, reason: 'managed', command: 'pnpm add dsh-quota-badge@<latest>' }`。pnpm store 里是硬链接，宿主包事务拥有这些文件，就地覆盖会破坏 store；
  - git 检出 → `git fetch origin` + 快进 `origin/main`（工作区有未提交修改时拒绝更新）；
  - 普通拷贝（无 `.git`）→ 下载仓库 tarball 覆盖（1.5.x 已有路径，本版未改动）。
- Node 兼容：`zstdDecompressSync`（Node ≥ 22.15 才有）改为惰性解析，加载不到时跳过 `.zstd` 会话日志回填，而不是让整个插件 `import` 失败。`engines` 仍是 `>=18`。
- `package.json`：
  - `dsh.client` 去掉 `inject` 列表。`@deepseek-ai/dsh-client-runtime` 被写进客户端模块表，但没有任何东西注册它，bundle 只依赖平台 seed 提供的 `react`；
  - `dsh.client.immediately: true`（与官方 `@deepseek-ai/dsh-client-ui-theme` 一致，客户端启动即预取该 bundle）；
  - `peerDependencies` 改为 `@deepseek-ai/cordis: ^4.0.2`（运行时共享包），不再声明 `react` + `@deepseek-ai/dsh-client-runtime`——后两者解析到 profile 之外，会被桌面版 profile 校验器拒绝。

### 变更

- 新增宿主路由 `GET /quota/health`：**唯一免鉴权路由**，只返回诊断信息（`ok`、`version`、`transport`、`origin`、`port`、`uptimeMs`、`requests`、`lastRequest`、`lastError`、`zstdBackfill`、`node`），不含任何账户数据。
- 宿主通过 `webserver/index-inject` 钩子向渲染进程注入 `window.__QUOTA_BADGE_HOST__ = { origin, token, ports }`（桌面版资源处理器渲染 index 时也会发出该钩子）。令牌也可用 `Authorization: Bearer` 头传递，数据路由两者皆可，`/quota/health` 不需要。
- 设置 → 余额监控新增**「诊断」卡片**：宿主可达 / 传输方式 / 插件版本 / 宿主 Node / 会话日志回填 (zstd) / 宿主请求数 / 最近读取错误 / 宿主最近错误 / 页面传输错误，并有「复制诊断信息」按钮（含插件仓库地址与注入信息）。
- 宿主诊断日志写入 `$DSH_HOME/.quota-badge.log`（`$DSH_HOME` 默认 `~/.dsh`）：载体类型、监听地址、端口耗尽、路由异常。桌面宿主自己的 stderr 不会被应用持久化，所以插件自己留一份。
- 「关于与更新」卡片在托管安装更新失败时，给可复制文本改成真正的升级命令（`pnpm add dsh-quota-badge@<latest>`），而不是让人去 git pull。
- 新增 `CHANGELOG.md` 并加入 npm `files` 白名单。

### 兼容性

- 宿主 Node 仍声明 `engines: node >= 18`；`.zstd` 会话日志回填需要 Node ≥ 22.15，更老的 Node 上自动跳过（诊断卡片会显示「不可用（Node < 22.15）」）。
- `lib/index.js` 依旧只 `import` Node 内置模块（该文件会被软链/拷贝进 profile 的 `node_modules`，裸 `@deepseek-ai/*` 导入无法从 realpath 解析）。
- 无新增运行时依赖，`dependencies` 仍为空；无构建步骤，`lib/client.js` 仍是预构建浏览器 bundle。
- Web profile 行为不变：有 `webServer` 时仍注册在同一台真实 HTTP 服务上，客户端仍走相对路径。

## [1.5.2] - 2026-09-09

### 变更

- 价格面板记住用户勾选的模型与币种（localStorage 持久化），悬停重新打开不再重置。
