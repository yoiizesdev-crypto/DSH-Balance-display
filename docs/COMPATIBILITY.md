# 桌面版 / Web 版宿主差异与兼容性

本插件（`dsh-quota-badge`）的两半分别跑在两个宿主面上：宿主半边 `lib/index.js`（cordis 插件）和浏览器半边 `lib/client.js`（预构建 bundle）。两者之间原本只有一条约定——宿主注册 `/quota/*` HTTP 路由，浏览器半边用**相对路径**请求它们。这条约定在 Web profile 下成立，在 Electron 桌面版下不成立。

本文说明两个宿主面的差别、旧版为什么在桌面版里静默失效、1.6.0 的回环载体怎么解决，以及怎么在本机验证。

## 一、两个宿主面

| | Web profile | Electron 桌面版 |
| --- | --- | --- |
| 组合入口 | `@deepseek-ai/dsh-web-app`，其中 `cordis.patch.yml` 注册 `webserver` 行（`@deepseek-ai/dsh-host-webserver`，`inject: [webStartup]`），端口默认 3080 | 同一套浏览器组合 + `@deepseek-ai/dsh-desktop-host/config/desktop.cordis.patch.yml` 覆盖层；入口是 `resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js` |
| `webServer` 服务 | 有（真实 HTTP 服务器） | **没有**。覆盖层把 `web-startup`、`webserver`、`web-runtime`、`client-hmr` 等行 `disabled: true`：`webserver` 注入的 `webStartup` 只有 Web 启动器提供，桌面版连提供者 `web-startup` 都禁用了，所以 `webServer` 服务永远不存在（宿主实测日志：`webServer service is absent (Electron Desktop composition)`） |
| 前端怎么送达 | 同一台 HTTP 服务器的静态资源 + `/quota/*` 路由 | `dsh-app://` 协议，Electron 外壳与宿主进程之间走**分帧字节管道**（fd3 请求、fd4 响应，另有 Node IPC 通道），宿主本身不监听任何端口 |
| 宿主认得的路径 | 全部 HTTP 路径（静态资源、各插件路由） | 只有三类：`/api/*`（typert 网关）、`/.dsh/remote-stream`（远程流）、`/plugins/*` 与静态前端资源；其余路径回 SPA 首页 HTML |
| 相对路径 `/quota/balance` | 命中插件注册的路由 | 落到「静态资源处理器」，未知路径返回 index.html，浏览器拿到一坨 HTML |
| 浏览器半边 | 同源，`fetch('/quota/...')` 即可 | 必须知道宿主的**回环 origin + 令牌** |

桌面版资源处理器的行为（`dsh-desktop-host` 的 `assetHandler`）：`/plugins/*` 交给 clientModules 取 bundle；`/`、`/index.html` 渲染 index（同时发出 `webserver/index-inject` 钩子，把注入行写进 HTML）；其余路径先当作 `dist` 下的静态文件，**找不到就渲染 index**。所以任何插件自定的 HTTP 路径都不可能从 `dsh-app://` 到达。

## 二、旧版为什么在桌面版里“什么都没发生”

两个互相独立的原因，任一个都足以让界面空白：

1. **宿主行根本没激活**。`cordis.patch.yml` 旧版写的是 `inject: [webServer, credentials]`，而桌面组合把 `webserver` 行整个禁用了（见上表），`webServer` 服务不存在。cordis 的 loader 行会一直停在 `pending (waiting for service: webServer)` —— `apply()` 一次都没执行，路由自然没注册，日志里也没有「插件报错」，只有启动审计的一行 stderr：

   ```text
   dsh desktop: warning: 1 entry did not activate
   quota-badge (dsh-quota-badge): pending (waiting for service: webServer)
   ```

   （这一行来自 `@deepseek-ai/dsh-app-boot` 的 `auditStartupEntries()`，写进宿主 stderr；桌面宿主自己的 stderr 不会被应用持久化，只能在启动瞬间看到。）

2. **即使 `apply()` 跑了，浏览器半边也到不了宿主**。桌面版的页面在 `dsh-app://` 下，相对路径 `/quota/*` 会被资源处理器当成未知路径，返回 SPA 首页 HTML；`fetch` 成功（HTTP 200）但 `r.json()` 直接抛错，旧版 `loadConfig()` 又把异常吞掉（注释是「host half unavailable → keep defaults」），于是徽章既不显示也不报错。

1.6.0 对第 1 点修的是 `cordis.patch.yml`（只注入 `credentials`）；对第 2 点修的是新增回环载体 + 客户端传输层。

## 三、1.6.0 的载体方案

`lib/index.js` 里的 `createCarrier(ctx)`：

- 如果 `ctx.get('webServer')` 存在且可 `register`，用真实 web server（**Web profile 行为完全不变**）。
- 否则启动**回环载体**（Electron 桌面版）：
  - `node:http` 服务器只 `listen(port, '127.0.0.1')`，端口按 `17871, 17872, …, 17880` 顺序取第一个空闲的；
  - 每次宿主进程启动生成一个随机令牌 `randomBytes(24).toString('hex')`（48 位十六进制，不落盘）；
  - 所有数据路由都要求令牌：`?token=<令牌>` 查询串或 `Authorization: Bearer <令牌>`；
  - `GET /quota/health` 是唯一免鉴权路由；
  - 所有响应带宽松 CORS 头（`access-control-allow-origin: *`、允许 `content-type, authorization`、允许 `GET,POST,OPTIONS`、`access-control-allow-private-network: true`、`cache-control: no-store`），`OPTIONS` 直接 204；
  - 通过 `ctx.on('webserver/index-inject', …)` 往注入表里推一行内联脚本：

    ```js
    window.__QUOTA_BADGE_HOST__ = { origin: 'http://127.0.0.1:17871', token: '<每次启动随机>', ports: [17871, …, 17880] }
    ```

    桌面版资源处理器渲染 index 时会发出同一个钩子，所以这条脚本和其他平台注入一样出现在页面 `<head>` 里；
  - 诊断写 `$DSH_HOME/.quota-badge.log`：载体类型（`webServer service is absent …`）、监听地址（`loopback carrier listening on http://127.0.0.1:<port>`）、端口耗尽、路由异常。桌面宿主自己的 stderr 不被应用保存，所以插件自己记一份。

浏览器半边（`lib/client.js`）的 `quotaFetch(path)`：

| 页面情况 | 行为 |
| --- | --- |
| 收到 `window.__QUOTA_BADGE_HOST__` 且带 `origin` | 直接请求该 origin，附 `?token=…` |
| 收到注入但没有 `origin`（宿主还没监听上） | 按 `ports`（缺省 `17871–17880`）逐个探 `GET /quota/health`，拿到 `ok: true` 后作为 origin |
| 没有注入，且页面是 `http:` / `https:`（Web profile） | 用相对路径 / 同源，行为与 1.5.x 一致 |
| 没有注入，且页面是 `dsh-app://`（桌面版） | 探测本机 `17871–17880`；探到宿主但页面没有令牌时报「宿主已找到（…）但页面缺少注入的访问令牌」，一个都没探到时报「未收到宿主注入信息，且本机没有响应 17871-17880 的桥接端口」——两种情况都会写进 store 与诊断卡片 |

宿主路由一览（两条宿主面共用同一份注册代码）：

| 路由 | 方法 | 鉴权（回环载体） | 说明 |
| --- | --- | --- | --- |
| `/quota/health` | GET | 免鉴权 | 诊断信息，无账户数据 |
| `/quota/balance` | GET | 需要令牌 | 经 `credentials` 解析 `DEEPSEEK_API_KEY`，查询官方余额 API |
| `/quota/config` | GET / POST | 需要令牌 | 参数读写（POST 为 JSON 补丁） |
| `/quota/usage` | GET | 需要令牌 | 本地用量账本 |
| `/quota/reset` | POST | 需要令牌 | 清空本地账本（保留参数） |
| `/quota/update/check` | GET / POST | 需要令牌 | POST = 强制联网检查 |
| `/quota/update/apply` | POST | 需要令牌 | 按安装形态分流（见 README 设置章节「关于与更新」） |

## 四、安全模型

回环载体的信任边界是「本机 + 本进程随机令牌」，不是「同机所有进程」。

服务本身：

- 只绑定 `127.0.0.1`，不对局域网/外部网卡开放；宿主进程不监听任何其他地址。
- 令牌每次宿主启动重新生成，只存在于宿主进程内存与渲染页面的内联脚本里，不写进 `.quota-badge.json`、不写进 `.quota-badge.log`。
- 数据路由缺少/写错令牌时返回 `403 {"error":"forbidden"}`；未知路径返回 `404`；`OPTIONS` 预检不需要令牌。

本机其他进程**能**读到的（`GET /quota/health`，无需令牌）：

- 插件版本、传输方式（`loopback` / `webServer`）、回环 origin 与端口、宿主启动至今的时长、累计请求数、最近一次请求的 `METHOD 路径`（只记 pathname，**不含查询串，因此不含令牌**）、最近一条错误文本、宿主 Node 版本、zstd 回填是否可用。

本机其他进程**不能**读到的（没有令牌时）：

- 账户余额（`/quota/balance`）、插件参数（`/quota/config`）、用量账本（`/quota/usage`）、历史采样，以及任何会改状态的操作（`POST /quota/config`、`/quota/reset`、`/quota/update/*`）。

需要说清楚的边界：

- 同一个用户下的任意进程若能读取宿主进程内存、或往渲染页面里注入脚本，就能拿到令牌并使用全部数据路由。本机同用户进程不在本插件的防护范围内。
- `access-control-allow-origin: *` 是刻意放宽的：真正的门禁是令牌，而端口只在回环上。普通浏览器里的网页因此也能读到 `/quota/health`（无账户数据），但读不到余额。
- 令牌会出现在回环请求的查询串里；这只走本机回环、不落盘、不出现在诊断信息中。需要更强的形态时可换 `Authorization: Bearer` 头（宿主两种都接受）。
- 余额读取本身需要 `~/.dsh/.credentials.yaml` 里的 `DEEPSEEK_API_KEY`，并访问 `https://api.deepseek.com/user/balance`；除此之外没有别的凭据或权限要求。

## 五、怎么在本机验证

前提：Node ≥ 18，并且**不需要**改动正在运行的桌面应用。本机默认没有把 `node` 加进 PATH，直接用安装目录自带的运行时最稳：

```powershell
cd D:\DSHWORK\DSH-Balance-display        # 仓库 checkout 所在目录（按实际填）
$node = "D:\DSH\DeepSeek Harness\resources\runtime\node\node.exe"
```

1. 启动真实桌面宿主，观察它到底激活了哪些行：

   ```powershell
   # profile 目录按你的实际安装填；下面这台机器是 ~\.dsh\profiles\desktop
   & $node tools\probe-desktop-host.mjs "$env:USERPROFILE\.dsh\profiles\desktop" --seconds 30 --port 17871
   ```

   这个脚本复刻 Electron 外壳的启动方式（`ELECTRON_RUN_AS_NODE=1`、`exe <entry> <runtimeDir> <profileDir>`、`cwd = profileDir`、滤波后的环境变量、4 条管道 + IPC），把宿主 stdout/stderr/IPC 全部打出来，并在结束时给出 `PASS` / `FAIL` 判定。

   - `PASS`：收到 `{ type: 'ready' }`，且 stderr 里没有任何行停在 `pending (waiting for service…)`。
   - `FAIL`：没收到 ready，或出现 `did not activate` / `failed to import` / `pending (waiting for service: …)` 行；判定块会把这些行原样列出来。

   > 本机当前这版应用里，判定块正常也会列出一行与插件无关的 `ui-update (@deepseek-ai/dsh-client-ui-update): failed to import`。判定只关心 ready 事件和 webServer 相关的行；`quota-badge` 行激活时不会出现在审计输出里。

2. 直接问宿主本人（回环载体的健康路由不需要令牌；端口要和探针实际用的那个一致 —— 看判定块上方最后一条 `[health]` 行，应用自己占着 17871 时探针宿主会拿 17872）：

   ```powershell
   Invoke-RestMethod http://127.0.0.1:17871/quota/health | ConvertTo-Json
   ```

   期望形如：

   ```json
   {
     "ok": true,
     "version": "1.6.0",
     "transport": "loopback",
     "origin": "http://127.0.0.1:17871",
     "port": 17871,
     "uptimeMs": 12345,
     "requests": 3,
     "lastRequest": "GET /quota/balance",
     "lastError": null,
     "zstdBackfill": true,
     "node": "24.18.1"
   }
   ```

   `transport` 为 `loopback` 才是桌面版 1.6.0 的正常形态；为 `webServer` 说明这次组合里有别的 `webServer` 提供者（Web profile，或桌面版里手工装的旧桥接层），此时插件按 Web 语义工作、不注入 `window.__QUOTA_BADGE_HOST__`。

3. 在应用内确认：**设置 → 余额监控 → 诊断**卡片。它显示同一批信息（宿主可达 / 传输方式 / 插件版本 / 宿主 Node / zstd 回填 / 请求数 / 最近错误 / 页面传输错误），「复制诊断信息」按钮可以把整份报告贴给别人。

4. 宿主侧日志：`$DSH_HOME\.quota-badge.log`（默认 `%USERPROFILE%\.dsh\.quota-badge.log`）。启动时应能看到一行 `loopback carrier listening on http://127.0.0.1:<port>`；只有 `webServer service is absent …` 而没有 listening 行，说明 17871–17880 全被占用或回环绑定失败。

> 注意：脚本会以 `<profileDir>` 为工作目录再启动一个宿主进程，并（像应用一样）把 `desktop.cordis.yml` 写成固定内容；它不会触碰正在运行的窗口。若同时运行多个宿主，回环端口会依次往后排（应用自己占着 17871 时，探针宿主会拿 17872），`--port` 要跟着改。profile 目录里没有装插件时，判定块会额外给出 WARN。想完全不碰现有 DSH 状态，可以在跑之前把 `$env:DSH_HOME` 指到一个空目录：宿主的会话/存储文件，以及插件自己的 `.quota-badge.log`、`.quota-badge.json` 都会写到那里。

## 六、症状 → 原因 → 修复

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| loader 行停在 `pending (waiting for service: webServer)` | `cordis.patch.yml` 仍注入 `webServer`，而当前组合没有该服务 | 本插件 1.6.0 只注入 `credentials`。确认 profile 里装的是 1.6.0（诊断卡片「插件版本」/ `package.json`），替换文件后**完全退出并重启应用** |
| 徽章不出现，也没有任何报错 | 旧版客户端把 `loadConfig()` 的失败静默吞掉；折叠侧边栏时旧版直接 `return null` | 1.6.0 会把失败写进状态（红点 + hover 提示）并渲染紧凑徽章。确认 `lib/client.js` 已是 1.6.0 并重启应用 |
| 徽章不出现，指示圆点是**红色**（hover 显示「余额读取失败：…」） | 浏览器半边到不了宿主：没有收到注入、端口全被占、或页面拿到 origin 却没有令牌 | 打开「设置 → 余额监控 → 诊断」，看「宿主可达」「传输方式」与「页面传输错误」；同时看 `$DSH_HOME\.quota-badge.log` 是否打印了监听地址 |
| 诊断卡片显示「宿主可达=否」 | 宿主行没激活（pending / failed to import），或 17871–17880 全被占用，或页面没拿到注入脚本 | 用 `& $node tools\probe-desktop-host.mjs <profileDir> --port 17871` 起一次真实宿主，看判定块列出的 stderr 行；确认端口空闲；确认 `lib/index.js` 是 1.6.0 |
| 诊断卡片「传输方式」显示 `webServer`，但桌面版仍没有徽章 | 组合里有别的 `webServer` 提供者（例如手工装的回环桥接层）。此时插件走 Web 语义：`origin` 为 null、不注入 `window.__QUOTA_BADGE_HOST__`，客户端回到相对路径 `/quota/*`，而 `dsh-app://` 下这些路径拿到的是 SPA 首页 HTML | 1.6.0 不再需要任何桥接层：移除旧桥接行与包、以及客户端 `fetch` shim，用原版 `lib/` 重启；确认诊断的「传输方式」变回 `loopback` |
| 用量统计里「会话日志回填 (zstd)」显示「不可用」 | 宿主 Node < 22.15，没有 `zstdDecompressSync` | 无功能损坏：回填被跳过，实时计量照常。用安装目录自带的 Node 运行宿主即可恢复 |
