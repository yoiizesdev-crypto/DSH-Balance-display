#!/usr/bin/env node
/**
 * probe-desktop-host.mjs —— 用「真实的 Desktop Host」启动一次桌面组合，验证
 * dsh-quota-badge 在 Electron 桌面版里到底活没活。
 *
 * 背景（为什么要复刻启动方式）
 * ---------------------------------------------------------------------------
 * 桌面应用由 Electron 外壳拉起宿主进程，参数与环境都不是普通的 `node x.js`：
 *
 *   exe <entry> <runtimeDir> <profileDir>
 *     entry      = <runtimeDir>/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js
 *     runtimeDir = <安装目录>/resources/app.asar/dsh
 *     profileDir = 桌面 profile（Electron 应用独占管理）
 *   cwd   = profileDir
 *   env   = 当前环境去掉 NODE_OPTIONS、NODE_PATH、DSH_DESKTOP_*、(npm|pnpm|corepack)_*
 *           再加上 ELECTRON_RUN_AS_NODE=1（让 Electron 可执行文件以纯 Node 方式跑）
 *   stdio = ['ignore','pipe','pipe','pipe','pipe','ipc']
 *            fd1=stdout fd2=stderr fd3=宿主读的请求管道 fd4=宿主写的响应管道
 *
 * 宿主跑完整套组合后，会经 IPC 通道发出 { type: 'ready', protocolVersion, dshVersion }；
 * 组合里有行没激活时，stderr 会出现 @deepseek-ai/dsh-app-boot 的启动审计输出，例如：
 *
 *   dsh desktop: warning: 1 entry did not activate
 *   quota-badge (dsh-quota-badge): pending (waiting for service: webServer)
 *
 * 桌面宿主自己的 stderr 不会被应用持久化，组合一变（例如插件又去等 webServer）
 * 就只能靠「重启一次、盯住启动瞬间」才发现。本脚本把这一过程完整复刻出来：
 * 启动宿主、转发全部输出、按需轮询 /quota/health，最后给出 PASS / FAIL 判定。
 *
 * 用法
 * ---------------------------------------------------------------------------
 *   node tools/probe-desktop-host.mjs <profileDir> [选项]
 *
 * 选项：
 *   --entry <path>    宿主入口，默认 <安装目录>/resources/app.asar/dsh/node_modules/
 *                     @deepseek-ai/dsh-desktop-host/lib/index.js
 *   --runtime <path>  运行目录（宿主 argv[2]），默认 <安装目录>/resources/app.asar/dsh
 *   --exe <path>      Electron 可执行文件，默认 D:\DSH\DeepSeek Harness\DeepSeek Harness.exe
 *   --seconds <n>     观察时长（秒），默认 25
 *   --port <n>        每秒轮询 http://127.0.0.1:<n>/quota/health 并打印返回的 JSON
 *   -h, --help        显示帮助
 *
 * 环境变量：
 *   DSH_DESKTOP_INSTALL_ROOT  覆盖默认安装目录（默认 D:\DSH\DeepSeek Harness）
 *
 * 退出码：PASS = 0，FAIL = 1。
 *
 * 只用 Node 内置模块；不依赖任何第三方包。
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 默认路径：本机安装位置；用 path.join 拼，换机器时用 --exe/--entry/--runtime 覆盖。
// 注意 app.asar 是归档文件而不是目录，脚本本身（普通 Node）无法用 existsSync 校验
// 归档内的 entry，只有 Electron 的 fs 才认得 —— 所以这里不预检 entry。
// ---------------------------------------------------------------------------

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_INSTALL_ROOT = process.env.DSH_DESKTOP_INSTALL_ROOT ?? join('D:', 'DSH', 'DeepSeek Harness')
const DEFAULT_EXE = join(DEFAULT_INSTALL_ROOT, 'DeepSeek Harness.exe')
const DEFAULT_RUNTIME = join(DEFAULT_INSTALL_ROOT, 'resources', 'app.asar', 'dsh')
const DEFAULT_ENTRY = join(DEFAULT_RUNTIME, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js')

/** 插件回环载体使用的端口列表（与 lib/index.js、lib/client.js 一致）。 */
const LOOPBACK_PORTS = [17871, 17872, 17873, 17874, 17875, 17876, 17877, 17878, 17879, 17880]

/** 启动审计里代表「有问题」的 stderr 标记。 */
const AUDIT_MARKERS = ['did not activate', 'failed to import', 'pending (waiting for service']

/** 与插件相关的 loader 行名（审计输出里的 `id (name)`）。 */
const PLUGIN_ROW_HINTS = ['quota-badge', 'dsh-quota-badge']

const HELP = `用法：node tools/probe-desktop-host.mjs <profileDir> [选项]

用真实 Desktop Host 启动一次桌面组合并打印诊断，结束时给出 PASS / FAIL。

参数：
  <profileDir>      桌面 profile 目录（必填），例如 %USERPROFILE%\\.dsh\\profiles\\desktop

选项：
  --entry <path>    宿主入口（默认：<安装目录>/resources/app.asar/dsh/node_modules/
                    @deepseek-ai/dsh-desktop-host/lib/index.js）
  --runtime <path>  运行目录，作为宿主 argv[2]（默认：<安装目录>/resources/app.asar/dsh）
  --exe <path>      Electron 可执行文件（默认：${DEFAULT_EXE}）
  --seconds <n>     观察时长，秒（默认 25）
  --port <n>        每秒轮询 http://127.0.0.1:<n>/quota/health 并打印 JSON
  -h, --help        显示本帮助

环境变量：
  DSH_DESKTOP_INSTALL_ROOT  覆盖默认安装目录（当前默认 ${DEFAULT_INSTALL_ROOT}）
`

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`[probe] ${message}`)
  process.exitCode = 1
}

function parseArgs(argv) {
  const options = {
    profileDir: null,
    entry: DEFAULT_ENTRY,
    runtime: DEFAULT_RUNTIME,
    exe: DEFAULT_EXE,
    seconds: 25,
    port: null,
    help: false,
  }
  const takesValue = new Set(['--entry', '--runtime', '--exe', '--seconds', '--port'])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }
    if (takesValue.has(arg)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`选项 ${arg} 缺少取值`)
      }
      if (arg === '--entry') options.entry = value
      else if (arg === '--runtime') options.runtime = value
      else if (arg === '--exe') options.exe = value
      else if (arg === '--seconds') {
        const n = Number(value)
        if (!Number.isFinite(n) || n <= 0) throw new Error(`--seconds 需要正数，收到 ${value}`)
        options.seconds = Math.min(3600, Math.round(n))
      } else if (arg === '--port') {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`--port 需要 1-65535 的整数，收到 ${value}`)
        options.port = n
      }
      continue
    }
    if (arg.startsWith('-')) throw new Error(`未知选项 ${arg}`)
    if (options.profileDir !== null) throw new Error(`只接受一个 <profileDir>，多出来的是 ${arg}`)
    options.profileDir = arg
  }
  return options
}

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
  console.error('')
  console.error(HELP)
  process.exit(1)
}

if (options.help) {
  console.log(HELP)
  process.exit(0)
}
if (options.profileDir === null) {
  fail('缺少必填参数 <profileDir>')
  console.error('')
  console.error(HELP)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 预检
// ---------------------------------------------------------------------------

const profileDir = resolve(options.profileDir)
const entry = resolve(options.entry)
const runtimeDir = resolve(options.runtime)
const exe = resolve(options.exe)

// 宿主会以 profileDir 为 cwd 启动，cwd 不存在 spawn 会直接 ENOENT，所以先建出来
// （宿主自己也会 mkdir -p，这里只是把 cwd 准备好）。
if (!existsSync(profileDir)) {
  try {
    mkdirSync(profileDir, { recursive: true })
    console.log(`[preflight] profile 目录不存在，已创建：${profileDir}`)
  } catch (err) {
    fail(`无法创建 profile 目录 ${profileDir}：${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

if (!existsSync(exe)) {
  fail(`找不到 Electron 可执行文件：${exe}（用 --exe 覆盖）`)
  process.exit(1)
}

/** profile 里装的是哪个版本的插件（读不到就返回 null）。 */
function installedPluginVersion() {
  const manifest = join(profileDir, 'node_modules', 'dsh-quota-badge', 'package.json')
  if (!existsSync(manifest)) return null
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unreadable'
  }
}

const pluginVersion = installedPluginVersion()

console.log('================ Desktop Host 探针 ================')
console.log(`[preflight] 脚本          ：${fileURLToPath(import.meta.url)}`)
console.log(`[preflight] 仓库根        ：${REPO_ROOT}`)
console.log(`[preflight] profile       ：${profileDir}`)
console.log(`[preflight] 插件版本      ：${pluginVersion === null ? '未安装（profile/node_modules/dsh-quota-badge 不存在）' : `v${pluginVersion}`}`)
console.log(`[preflight] runtimeDir    ：${runtimeDir}`)
console.log(`[preflight] entry         ：${entry}`)
console.log(`[preflight] Electron      ：${exe}`)
console.log(`[preflight] 观察时长      ：${options.seconds}s`)
console.log(`[preflight] 健康检查      ：${options.port === null ? '关闭（--port <n> 开启）' : `每秒 GET http://127.0.0.1:${options.port}/quota/health`}`)
console.log(`[preflight] 宿主 Node     ：${process.version}（本脚本；宿主的版本由 /quota/health 的 node 字段给出）`)
console.log('')

// ---------------------------------------------------------------------------
// 启动宿主：完全复刻 Electron 外壳的 spawn 参数
// ---------------------------------------------------------------------------

/** 按应用的做法过滤环境变量，并让 Electron 以纯 Node 方式运行。 */
function childEnvironment() {
  const env = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    // Windows 环境变量名不区分大小写，这里对两个 Node 变量也用 /i，避免漏掉。
    if (/^NODE_OPTIONS$/i.test(name) || /^NODE_PATH$/i.test(name)) continue
    if (/^DSH_DESKTOP_/u.test(name)) continue
    if (/^(?:npm|pnpm|corepack)_/iu.test(name)) continue
    env[name] = value
  }
  env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

console.log(`[probe] 启动：${exe} \n        ${entry} ${runtimeDir} ${profileDir}`)
console.log('[probe] cwd = profileDir，env 去掉 NODE_OPTIONS / NODE_PATH / DSH_DESKTOP_* / (npm|pnpm|corepack)_*')
console.log('')

const child = spawn(exe, [entry, runtimeDir, profileDir], {
  cwd: profileDir,
  env: childEnvironment(),
  // fd3 = 宿主读的请求管道，fd4 = 宿主写的响应管道；探针不发送请求，只保持它们开着。
  stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
})

if (child.pid === undefined) {
  fail('spawn 未返回 pid，宿主没有起来')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 输出转发与审计
// ---------------------------------------------------------------------------

/** 宿主经 IPC 发来的 ready 事件（{ type: 'ready', protocolVersion, dshVersion }）。 */
let readyEvent = null
/** 宿主经 IPC 发来的 fatal 事件。 */
let fatalEvent = null
/** stderr 里命中的启动审计标记行。 */
const auditLines = []
/** stdout/stderr 里所有出现过的行（判定块只打印命中的那些，其余已实时转发）。 */
let stderrTail = []
let spawnError = null
let exitInfo = null
let finished = false

const stdoutReader = createInterface({ input: child.stdout, crlfDelay: Infinity })
stdoutReader.on('line', (line) => {
  console.log(`[stdout] ${line}`)
})

const stderrReader = createInterface({ input: child.stderr, crlfDelay: Infinity })
stderrReader.on('line', (line) => {
  console.log(`[stderr] ${line}`)
  stderrTail.push(line)
  if (stderrTail.length > 200) stderrTail = stderrTail.slice(-200)
  if (AUDIT_MARKERS.some((marker) => line.includes(marker))) auditLines.push(line)
})

child.on('message', (message) => {
  let text
  try {
    text = JSON.stringify(message)
  } catch {
    text = String(message)
  }
  console.log(`[ipc] ${text}`)
  if (message !== null && typeof message === 'object') {
    if (message.type === 'ready' && readyEvent === null) readyEvent = message
    if (message.type === 'fatal') fatalEvent = message
  }
})

child.on('error', (err) => {
  spawnError = err
  console.error(`[probe] 子进程错误：${err instanceof Error ? err.message : String(err)}`)
  finish('子进程错误')
})

child.on('close', (code, signal) => {
  exitInfo = { code, signal }
  console.log(`[probe] 宿主进程已退出（code=${String(code)}, signal=${String(signal)}）`)
  finish('宿主提前退出')
})

// ---------------------------------------------------------------------------
// 健康检查轮询（可选）：/quota/health 是唯一免鉴权路由，正好当探针用
// ---------------------------------------------------------------------------

let healthTimer = null
let healthPolls = 0

async function pollHealth() {
  const url = `http://127.0.0.1:${options.port}/quota/health`
  healthPolls += 1
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    const body = await response.text()
    console.log(`[health] #${healthPolls} HTTP ${response.status} ${body}`)
  } catch (err) {
    console.log(`[health] #${healthPolls} 无响应（${err instanceof Error ? err.message : String(err)}）`)
  }
}

if (options.port !== null) {
  void pollHealth()
  healthTimer = setInterval(() => void pollHealth(), 1000)
}

// ---------------------------------------------------------------------------
// 判定与收尾
// ---------------------------------------------------------------------------

/** 命中的审计行里，哪些是在等 webServer（也就是旧版卡住的那一行）。 */
function pendingWebServerLines() {
  return auditLines.filter((line) => line.includes('pending (waiting for service') && line.includes('webServer'))
}

function pluginRelatedLines() {
  return auditLines.filter((line) => PLUGIN_ROW_HINTS.some((hint) => line.includes(hint)))
}

function finish(reason) {
  if (finished) return
  finished = true
  if (healthTimer !== null) clearInterval(healthTimer)
  if (deadline !== null) clearTimeout(deadline)

  const pending = pendingWebServerLines()
  const pass = readyEvent !== null && pending.length === 0

  console.log('')
  console.log('============================ 判定 ============================')
  console.log(`结束原因          ：${reason}`)
  console.log(`ready 事件        ：${readyEvent === null ? '未收到' : `收到（protocolVersion=${String(readyEvent.protocolVersion)}, dshVersion=${String(readyEvent.dshVersion)}）`}`)
  console.log(`fatal 事件        ：${fatalEvent === null ? '无' : `有：${String(fatalEvent.message)}`}`)
  console.log(`宿主退出          ：${exitInfo === null ? '未退出（探针主动结束）' : `code=${String(exitInfo.code)} signal=${String(exitInfo.signal)}`}`)
  console.log(`启动审计标记行    ：${auditLines.length} 行`)
  console.log(`等 webServer 的行 ：${pending.length} 行`)
  console.log(`插件相关审计行    ：${pluginRelatedLines().length} 行`)
  if (pluginVersion === null) {
    console.log('WARN              ：profile 里没有 node_modules/dsh-quota-badge —— 本次启动根本没有加载本插件，PASS 只能说明宿主自身起来了')
  }
  if (auditLines.length > 0) {
    console.log('')
    console.log('命中的 stderr 行（原样）：')
    for (const line of auditLines) console.log(`  ${line}`)
  }
  if (spawnError !== null) {
    console.log('')
    console.log(`spawn 错误        ：${spawnError.message}`)
  }
  console.log('')
  if (pass) {
    console.log('结论              ：PASS —— 宿主组合已就绪，且没有 loader 行卡在 webServer 上。')
    console.log('下一步            ：GET /quota/health 应返回 transport=loopback（桌面版）或 webServer（Web profile）。')
  } else {
    console.log('结论              ：FAIL')
    if (readyEvent === null) console.log('  - 没有收到 ready 事件：宿主组合没跑通，或它在就绪前就退出了。')
    for (const line of pending) console.log(`  - 有行卡在 webServer：${line}`)
    if (auditLines.length > 0) console.log('  - 看上面列出的审计行（pending = 服务缺失，failed to import = 包解析/加载失败）。')
    console.log('  - 常见修复：把 profile 里的 dsh-quota-badge 换成 1.6.0（其 loader 行只注入 credentials），然后完全退出并重启应用。')
  }
  console.log('==============================================================')

  const code = pass ? 0 : 1
  const leave = () => process.exit(code)

  // 宿主已经退出了：不用再等停机握手，直接收工。
  if (exitInfo !== null) {
    setTimeout(leave, 50)
    return
  }

  // 收尾：先走 IPC 正常停机（宿主处理 { type: 'shutdown' }），再兜底 kill。
  try {
    if (child.connected) child.send({ type: 'shutdown' })
  } catch {
    // IPC 已断开，下面的 kill 兜底
  }
  try {
    if (child.stdio[3] !== null && child.stdio[3] !== undefined) child.stdio[3].end()
  } catch {
    // 忽略
  }
  try {
    if (child.stdio[4] !== null && child.stdio[4] !== undefined) child.stdio[4].destroy()
  } catch {
    // 忽略
  }
  const hardKill = setTimeout(() => {
    try {
      child.kill()
    } catch {
      // 已经退出
    }
  }, 1200)
  hardKill.unref()
  // 宿主乖乖退出就立刻结束，否则最多再等 3 秒。
  child.once('close', () => {
    clearTimeout(hardKill)
    leave()
  })
  setTimeout(leave, 3000)
}

const deadline = setTimeout(() => finish(`观察 ${options.seconds}s 结束`), options.seconds * 1000)

if (pluginVersion === null) {
  console.log('[preflight] 提示：把插件装进 profile 的 node_modules/dsh-quota-badge 后再跑，判定才有意义。')
  console.log('')
}
console.log(`[probe] 等待最长 ${options.seconds}s（Ctrl+C 可提前结束）…`)
console.log('')
