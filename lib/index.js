/**
 * dsh-quota-badge — host half.
 *
 * Serves three exact routes used by the browser half:
 *
 *   GET  /quota/balance  — resolve the DEEPSEEK_API_KEY credential (the same
 *                          seam the model provider uses), query the official
 *                          DeepSeek balance API with Node's global fetch, and
 *                          return `{ balances, balance, currency, error }`:
 *                          `balances` carries EVERY currency the account has
 *                          (e.g. CNY + USD), `balance`/`currency` name the
 *                          primary one (CNY preferred, else the first).
 *                          Every successful read also appends a history
 *                          sample `{ t, balances }` for the monitoring chart.
 *   GET  /quota/config   — return the plugin's persisted parameters and the
 *                          balance history: `{ config, history }`.
 *   POST /quota/config   — accept a JSON patch of parameters (e.g.
 *                          `{ "refreshInterval": 10 }`), validate + clamp,
 *                          persist to `<dsh home>/.quota-badge.json`, and
 *                          return the updated `{ config, history }`.
 *
 * Persistence deliberately does NOT use the DSH settings seam: the browser
 * settings wire only exposes an allowlisted set of namespaces
 * (dsh-host-apiproxy WEB_SETTINGS_NAMESPACES), and a third-party namespace
 * answers `settings-not-exposed`. A private JSON file keeps the plugin
 * self-contained and survives app upgrades.
 *
 * IMPORTANT (2026-08-16): the previous version used `ctx.get('shell')` to
 * curl the API. In the Web/desktop composition `tool-bash` is DISABLED, so
 * the shell executor is a per-session service and `ctx.shell` is undefined
 * in the host plane — apply() silently returned and the route never
 * registered. Plain fetch needs no shell and keeps the API key out of any
 * command line.
 *
 * IMPORTANT (resolution): this file is symlinked into the profile's
 * node_modules (real path under the user's Desktop), so bare imports of
 * `@deepseek-ai/*` packages would NOT resolve from the realpath — only Node
 * builtins are imported here.
 */

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

// ---------------------------------------------------------------------------
// Parameters & persistence
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  showBadge: true, // 显示侧边栏余额徽章
  autoRefresh: true, // 自动按间隔刷新余额
  refreshInterval: 5, // 自动刷新间隔（秒）
  rollDuration: 1.5, // 数字滚轮动画时长（秒）
  showPhaseTag: true, // 徽章显示「高峰/空闲」时段标签
  showPricePanel: true, // 悬停徽章显示峰谷价格面板
  displayCurrency: 'auto', // 徽章显示币种：'auto'（CNY 优先，否则第一个）或具体货币码（如 'USD'）
  autoUpdateCheck: true, // 自动检查插件新版本
})

const REFRESH_MIN = 3
const REFRESH_MAX = 600
const ROLL_MIN = 1
const ROLL_MAX = 3
const HISTORY_LIMIT = 720
/** Currency code shape: 2-8 uppercase letters (ISO 4217 style). */
const CURRENCY_PATTERN = /^[A-Z]{2,8}$/

// ---------------------------------------------------------------------------
// Usage metering: per-request tokens + cost, recorded from the harness's own
// LLM calls (session/event → assistant/message usage). DeepSeek has NO public
// usage-history API (the console only shows 30 days), so recording every call
// the harness makes is the only way to keep data "since creation" forever.
// ---------------------------------------------------------------------------

/** Official CNY pricing per 1M tokens (peak windows 9-12h, 14-18h Beijing). */
const PRICING = {
  'deepseek-v4-flash': { label: 'V4-Flash', idle: { hit: 0.05, in: 1.5, out: 4.5 }, peak: { hit: 0.10, in: 3.0, out: 9.0 } },
  'deepseek-v4-pro': { label: 'V4-Pro', idle: { hit: 0.15, in: 4.5, out: 13.5 }, peak: { hit: 0.30, in: 9.0, out: 27.0 } },
}
/** Peak windows in minutes: 9:00-12:00, 14:00-18:00 (Beijing time). */
const PEAK_MIN = [[540, 720], [840, 1080]]

// Weekend-all-day-off-peak rule, effective 2026-08-23 00:00 Beijing
// (= 2026-08-22T16:00:00Z): Saturdays and Sundays charge the off-peak price
// all day; weekdays keep the 9-12 / 14-18 peak windows.
const WEEKEND_IDLE_SINCE = Date.parse('2026-08-22T16:00:00Z')

/** Beijing-time weekday of a ms timestamp: 0 = Sunday, 6 = Saturday. */
function bjDay(t) {
  return new Date(t + 8 * 3600000).getUTCDay()
}

/** Whether a ms timestamp falls in a peak window (Beijing time, UTC+8). */
function isPeakTime(t) {
  if (t >= WEEKEND_IDLE_SINCE && (bjDay(t) === 0 || bjDay(t) === 6)) return false
  const d = new Date(t + 8 * 3600000)
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes()
  return PEAK_MIN.some((r) => minutes >= r[0] && minutes < r[1])
}

/** Per-1M-token price of one model at one instant; unknown models price like Flash. */
function priceOf(model, t, field) {
  const table = PRICING[model] || PRICING['deepseek-v4-flash']
  const tier = isPeakTime(t) ? table.peak : table.idle
  return tier[field]
}

/** CNY cost of one request from its disjoint token counts. */
function costOfRequest(model, t, usage) {
  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
  const cacheTokens = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
  return (
    inputTokens / 1e6 * priceOf(model, t, 'in')
    + outputTokens / 1e6 * priceOf(model, t, 'out')
    + cacheTokens / 1e6 * priceOf(model, t, 'hit')
  )
}

/** Opaque key label — never persists the key itself. */
function keyFingerprint(value) {
  if (typeof value !== 'string' || value.length === 0) return 'unknown'
  if (value.length <= 12) return value
  return value.slice(0, 4) + '…' + value.slice(-4)
}

/** Beijing-time day key like 2026-08-17. */
function dayKey(t) {
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = ('0' + (d.getUTCMonth() + 1)).slice(-2)
  const day = ('0' + d.getUTCDate()).slice(-2)
  return `${y}-${m}-${day}`
}

/** In-memory { config, history, usage } once loaded from disk. */
let cached = null
/** In-flight first load, so concurrent callers share one state object. */
let statePromise = null
/** Debounced persist timer. */
let writeTimer = null

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')
}

function statePath() {
  return join(dshHome(), '.quota-badge.json')
}

/** Validate + normalize one config patch. Returns { ok, value?, error? }. */
function sanitizeConfig(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'config must be a JSON object' }
  }
  const next = {}
  for (const key of Object.keys(input)) {
    if (!(key in DEFAULTS)) return { ok: false, error: `unknown field "${key}"` }
    const raw = input[key]
    if (key === 'refreshInterval') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return { ok: false, error: 'refreshInterval must be a number' }
      next[key] = Math.round(Math.min(REFRESH_MAX, Math.max(REFRESH_MIN, n)))
      continue
    }
    if (key === 'rollDuration') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return { ok: false, error: 'rollDuration must be a number' }
      next[key] = Math.round(Math.min(ROLL_MAX, Math.max(ROLL_MIN, n)) * 10) / 10
      continue
    }
    if (key === 'displayCurrency') {
      if (typeof raw !== 'string') return { ok: false, error: 'displayCurrency must be a string' }
      const upper = raw.trim().toUpperCase()
      if (upper !== 'AUTO' && !CURRENCY_PATTERN.test(upper)) {
        return { ok: false, error: 'displayCurrency must be "auto" or a currency code like "USD"' }
      }
      next[key] = upper === 'AUTO' ? 'auto' : upper
      continue
    }
    if (typeof raw !== 'boolean') return { ok: false, error: `field "${key}" must be a boolean` }
    next[key] = raw
  }
  return { ok: true, value: next }
}

/**
 * Normalize one persisted history sample. Two shapes are accepted:
 * the current `{ t, balances: { CNY: 1.2, USD: 3.4 } }` and the legacy
 * `{ t, balance: 1.2 }` (pre-multi-currency), which migrates as CNY.
 * Returns null for unusable entries.
 */
function normalizeSample(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
  if (typeof item.t !== 'number' || !Number.isFinite(item.t)) return null
  if (item.balances !== null && typeof item.balances === 'object' && !Array.isArray(item.balances)) {
    const balances = {}
    for (const [currency, value] of Object.entries(item.balances)) {
      if (typeof currency === 'string' && currency.length > 0 && typeof value === 'number' && Number.isFinite(value)) {
        balances[currency] = value
      }
    }
    if (Object.keys(balances).length === 0) return null
    return { t: item.t, balances }
  }
  if (typeof item.balance === 'number' && Number.isFinite(item.balance)) {
    // legacy single-currency sample; the old host recorded CNY or the first
    // available currency, so treat it as CNY.
    return { t: item.t, balances: { CNY: item.balance } }
  }
  return null
}

/** Load the persisted state once; a missing or corrupt file falls back to defaults. */
async function loadState() {
  if (cached !== null) return cached
  if (statePromise === null) {
    statePromise = (async () => {
      const state = { config: { ...DEFAULTS }, history: [], usage: {}, usageSeen: {}, scan: {} }
      try {
        const text = await readFile(statePath(), 'utf8')
        const parsed = JSON.parse(text)
        if (parsed !== null && typeof parsed === 'object') {
          if (parsed.config !== null && typeof parsed.config === 'object') {
            const clean = sanitizeConfig(parsed.config)
            if (clean.ok) state.config = { ...DEFAULTS, ...clean.value }
          }
          if (Array.isArray(parsed.history)) {
            state.history = parsed.history
              .map(normalizeSample)
              .filter((item) => item !== null)
              .slice(-HISTORY_LIMIT)
          }
          if (parsed.usage !== null && typeof parsed.usage === 'object' && !Array.isArray(parsed.usage)) {
            state.usage = parsed.usage
          }
          if (parsed.usageSeen !== null && typeof parsed.usageSeen === 'object' && !Array.isArray(parsed.usageSeen)) {
            state.usageSeen = parsed.usageSeen
          }
          if (parsed.scan !== null && typeof parsed.scan === 'object' && !Array.isArray(parsed.scan)) {
            state.scan = parsed.scan
          }
        }
      } catch {
        // missing or unreadable file → defaults
      }
      cached = state
      return state
    })()
  }
  return statePromise
}

/** Debounced persist of the in-memory state. */
function persistSoon() {
  if (writeTimer !== null) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    void flushState()
  }, 2000)
}

async function flushState() {
  if (cached === null) return
  try {
    await mkdir(dshHome(), { recursive: true })
    const tmp = statePath() + '.tmp'
    await writeFile(tmp, JSON.stringify(cached), 'utf8')
    await rename(tmp, statePath())
  } catch {
    // non-fatal: the in-memory state keeps serving
  }
}

// ---------------------------------------------------------------------------
// Historical backfill: DeepSeek has no usage-history API, but the harness
// persists EVERY session event (with usage) in its own compressed JSONL logs
// under the harness home. Scanning those logs lets the plugin account for
// calls made BEFORE it was installed — older than the official 30-day window.
//
// Logs are append-only multi-frame Zstandard files; each flush appends one
// compressed frame of JSON lines. We track the processed byte offset per file
// and only decode newly appended bytes, deduping events by a stable
// fingerprint in case a file is rewritten (compaction) and rescanned.
// ---------------------------------------------------------------------------

/** Zstandard frame magic (little-endian bytes 28 B5 2F FD). */
const ZSTD_MAGIC = 0xfd2fb528

/** Scan a buffer for Zstandard frame ranges; the trailing frame extends to EOF. */
function zstdFrameRanges(buf) {
  const starts = []
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf.readUInt32LE(i) === ZSTD_MAGIC) starts.push(i)
  }
  const frames = []
  for (let k = 0; k < starts.length; k++) {
    frames.push([starts[k], k + 1 < starts.length ? starts[k + 1] : buf.length])
  }
  return frames
}

/** Decompress every complete frame of a session log into one string. */
function decodeSessionLog(buf) {
  const frames = zstdFrameRanges(buf)
  if (frames.length === 0) return ''
  const chunks = []
  for (const [start, end] of frames) {
    try {
      chunks.push(zstdDecompressSync(buf.subarray(start, end)))
    } catch {
      // corrupt frame — skip it
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Stable identity of one completed call, used to dedupe backfilled events. */
function usageFingerprint(event) {
  const usage = event.data.usage
  return `${event.time}|${event.data.message && event.data.message.source ? event.data.message.source.model : '?'}|${usage.inputTokens}|${usage.outputTokens}|${usage.cacheReadTokens || 0}`
}

/** Walk the harness sessions directory collecting log paths. */
function collectSessionLogs() {
  const root = join(dshHome(), 'sessions')
  const found = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.jsonl.zstd') || entry.name.endsWith('.jsonl')) found.push(p)
    }
  }
  walk(root)
  return found
}

/**
 * Incrementally backfill usage from session logs. Never throws: failures just
 * stop the pass; the next trigger retries.
 */
async function scanSessions() {
  const state = await loadState()
  const fp = await currentKeyFingerprintRef()
  let changed = false
  for (const path of collectSessionLogs()) {
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    let processed = typeof state.scan[path] === 'number' ? state.scan[path] : 0
    if (processed > stat.size) {
      // file was rewritten (compaction) — rescan from the start
      processed = 0
    }
    let buf
    try {
      buf = readFileSync(path)
    } catch {
      continue
    }
    if (buf.length <= processed) continue
    const text = decodeSessionLog(buf.subarray(processed))
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') continue
      const data = event.data
      if (data === null || typeof data !== 'object' || data.usage === null || typeof data.usage !== 'object') continue
      const usage = data.usage
      if (typeof usage.inputTokens !== 'number' && typeof usage.outputTokens !== 'number') continue
      const key = usageFingerprint(event)
      if (state.usageSeen[key]) continue
      state.usageSeen[key] = 1
      const source = data.message !== null && typeof data.message === 'object' ? data.message.source : undefined
      const model = source !== null && typeof source === 'object' && typeof source.model === 'string' ? source.model : 'unknown'
      const t = typeof event.time === 'number' ? event.time : Date.now()
      recordUsage(state, fp, model, t, usage)
      changed = true
    }
    // advance the processed offset even when the appended bytes carried no
    // recordable events, so a second pass never re-decodes them
    state.scan[path] = buf.length
  }
  if (changed) persistSoon()
}

/** Shared key-fingerprint cache, module-level so scanSessions can use it. */
let cachedKeyFp = null
let cachedKeyAt = 0
async function currentKeyFingerprintRef() {
  const now = Date.now()
  if (cachedKeyFp !== null && now - cachedKeyAt < 5 * 60 * 1000) return cachedKeyFp
  try {
    const cred = await credentialsRef.resolve('DEEPSEEK_API_KEY')
    cachedKeyFp = keyFingerprint(cred !== undefined && cred !== null ? cred.value : undefined)
  } catch {
    cachedKeyFp = 'unknown'
  }
  cachedKeyAt = now
  return cachedKeyFp
}
/** The credentials service, captured at apply time (module-level fallback). */
let credentialsRef = null

// ---------------------------------------------------------------------------
// Update check: compare the installed package version against the newest tag
// of the GitHub repository (published by `git tag vX.Y.Z && git push --tags`).
// api.github.com is used because it is reachable on networks where
// github.com/raw.githubusercontent.com are not.
// ---------------------------------------------------------------------------

const GITHUB_REPO = 'yoiizesdev-crypto/DSH-Balance-display'
const CHECK_CACHE_MS = 10 * 60 * 1000 // a non-forced check reuses a 10-min-old result

/** Local installed version, read from this package's package.json. */
let cachedVersion = null
function localVersion() {
  if (cachedVersion !== null) return cachedVersion
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    cachedVersion = typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0'
  } catch {
    cachedVersion = '0.0.0'
  }
  return cachedVersion
}

/** Split a version string into numeric parts; unknown text sorts lowest. */
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value))
  if (match === null) return [0, 0, 0]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Compare two version strings; 1 = a newer, -1 = b newer, 0 = equal. */
function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1
  }
  return 0
}

/** In-memory check result (module-level so routes and timers share it). */
let updateCache = { current: null, latest: null, hasUpdate: false, error: null, checkedAt: 0 }

/** Fetch the newest repository tag name (e.g. "v1.1.0"), or null when untagged. */
async function fetchLatestTag() {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`, {
    headers: {
      'User-Agent': 'dsh-quota-badge',
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`github api http ${response.status}`)
  const tags = await response.json()
  if (!Array.isArray(tags) || tags.length === 0) return null
  const match = /^v?(\d+\.\d+\.\d+)/.exec(String(tags[0].name || ''))
  return match === null ? null : match[1]
}

/**
 * Run (or reuse) an update check.
 * @param force - true for a manual check: always hits the network.
 * @returns the check result snapshot.
 */
async function checkUpdate(force) {
  const now = Date.now()
  const current = localVersion()
  if (!force && updateCache.checkedAt > 0 && now - updateCache.checkedAt < CHECK_CACHE_MS) {
    return { ...updateCache, current }
  }
  try {
    const latest = await fetchLatestTag()
    updateCache = {
      current,
      latest,
      hasUpdate: latest !== null && compareVersions(latest, current) > 0,
      error: null,
      checkedAt: now,
    }
  } catch (err) {
    updateCache = {
      current,
      latest: null,
      hasUpdate: false,
      error: err !== null && typeof err === 'object' && typeof err.message === 'string' ? err.message : 'check failed',
      checkedAt: now,
    }
  }
  return { ...updateCache }
}

/**
 * Append one successful multi-currency sample, capped; at most one sample
 * per second.
 * @param list - normalized `{ currency, balance }` entries from the API.
 */
function recordHistory(list) {
  const t = Date.now()
  const history = cached.history
  const last = history[history.length - 1]
  if (last !== undefined && t - last.t < 1000) return
  const balances = {}
  for (const item of list) {
    if (item !== null && typeof item === 'object'
      && typeof item.currency === 'string' && item.currency.length > 0
      && typeof item.balance === 'number' && Number.isFinite(item.balance)) {
      balances[item.currency] = item.balance
    }
  }
  if (Object.keys(balances).length === 0) return
  history.push({ t, balances })
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT)
  persistSoon()
}

/**
 * Record one completed LLM request into the per-key, per-day usage ledger.
 * `state.usage` shape:
 *   { [keyFp]: { label, days: { "2026-08-17": {
 *       requests, inputTokens, outputTokens, cacheReadTokens, cost,
 *       models: { [model]: { requests, inputTokens, outputTokens, cacheReadTokens, cost } }
 *     } } } }
 */
function recordUsage(state, keyFp, model, t, usage) {
  const inputTokens = typeof usage.inputTokens === 'number' && Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0
  const outputTokens = typeof usage.outputTokens === 'number' && Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0
  const cacheTokens = typeof usage.cacheReadTokens === 'number' && Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0
  if (inputTokens === 0 && outputTokens === 0 && cacheTokens === 0) return
  const cost = costOfRequest(model, t, { inputTokens, outputTokens, cacheReadTokens: cacheTokens })
  const day = dayKey(t)
  const bucket = state.usage[keyFp] || (state.usage[keyFp] = { label: keyFp, days: {} })
  const entry = bucket.days[day] || (bucket.days[day] = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0, models: {} })
  entry.requests += 1
  entry.inputTokens += inputTokens
  entry.outputTokens += outputTokens
  entry.cacheReadTokens += cacheTokens
  entry.cost += cost
  const modelEntry = entry.models[model] || (entry.models[model] = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0 })
  modelEntry.requests += 1
  modelEntry.inputTokens += inputTokens
  modelEntry.outputTokens += outputTokens
  modelEntry.cacheReadTokens += cacheTokens
  modelEntry.cost += cost
  persistSoon()
}

function json(res, value) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

// ---------------------------------------------------------------------------
// Plugin body
// ---------------------------------------------------------------------------

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  const credentials = ctx.get('credentials')
  if (webServer === undefined || credentials === undefined) return

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/quota/balance',
    async handler(req, res) {
      try {
        const cred = await credentials.resolve('DEEPSEEK_API_KEY')
        if (cred === undefined || typeof cred.value !== 'string' || cred.value.length === 0) {
          json(res, { balance: null, error: 'no api key' })
          return
        }
        const response = await fetch('https://api.deepseek.com/user/balance', {
          headers: { Authorization: `Bearer ${cred.value}` },
          signal: AbortSignal.timeout(10000),
        })
        const body = await response.json()
        const infos = body !== null && typeof body === 'object' && Array.isArray(body.balance_infos) ? body.balance_infos : []
        const balances = []
        for (const item of infos) {
          if (item === null || typeof item !== 'object' || typeof item.currency !== 'string') continue
          const parsed = Math.round(Number(item.total_balance) * 100) / 100
          if (!Number.isFinite(parsed)) continue
          balances.push({ currency: item.currency, balance: parsed })
        }
        // Stable ordering so the UI never reorders between refreshes:
        // CNY first, then the remaining currencies alphabetically.
        balances.sort((a, b) => {
          if (a.currency === 'CNY') return b.currency === 'CNY' ? 0 : -1
          if (b.currency === 'CNY') return 1
          return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0
        })
        const primary = balances.find((item) => item.currency === 'CNY') || balances[0] || null
        if (primary !== null) {
          await loadState()
          recordHistory(balances)
        }
        json(res, {
          balances,
          balance: primary === null ? null : primary.balance,
          currency: primary === null ? 'CNY' : primary.currency,
          error: primary === null ? 'unexpected response' : null,
        })
      } catch (err) {
        json(res, {
          balance: null,
          error: err !== null && typeof err === 'object' && typeof err.message === 'string' ? err.message : 'request failed',
        })
      }
    },
  }), 'quota-badge: balance route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/quota/config',
    async handler(req, res) {
      const state = await loadState()
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        const patch = body !== null && typeof body === 'object' && body.config !== undefined ? body.config : body
        const clean = sanitizeConfig(patch)
        if (!clean.ok) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: clean.error }))
          return
        }
        state.config = { ...state.config, ...clean.value }
        persistSoon()
      }
      json(res, { config: state.config, history: state.history })
    },
  }), 'quota-badge: config route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/quota/usage',
    async handler(req, res) {
      const state = await loadState()
      json(res, { usage: state.usage })
      // refresh the ledger from any newly appended session logs
      void scanSessions()
    },
  }), 'quota-badge: usage route')

  // Usage metering: subscribe to the harness session event stream and record
  // every completed LLM call (assistant/message with usage). Events dispatch
  // on the root event chain with no context filter, so any host listener
  // receives them.
  credentialsRef = credentials

  const onSessionEvent = (session, event) => {
    if (event === undefined || event === null || event.type !== 'assistant/message') return
    const data = event.data
    if (data === null || typeof data !== 'object' || data.usage === undefined || data.usage === null) return
    const usage = data.usage
    if (typeof usage !== 'object' || (typeof usage.inputTokens !== 'number' && typeof usage.outputTokens !== 'number')) return
    const source = data.message !== null && typeof data.message === 'object' ? data.message.source : undefined
    const model = source !== null && typeof source === 'object' && typeof source.model === 'string'
      ? source.model
      : (typeof session.requestHeader === 'function' && session.requestHeader()?.config?.model) || 'unknown'
    const t = typeof event.time === 'number' ? event.time : Date.now()
    void (async () => {
      try {
        const fp = await currentKeyFingerprintRef()
        const state = await loadState()
        recordUsage(state, fp, String(model), t, usage)
        // mark the event in the dedupe set so the log backfill never
        // double-counts a call that was already recorded live
        state.usageSeen[usageFingerprint(event)] = 1
      } catch (err) {
        ctx.logger.warn('quota-badge: usage record failed: %s', String(err && err.message !== undefined ? err.message : err))
      }
    })()
  }
  ctx.effect(() => ctx.on('session/event', onSessionEvent), 'quota-badge: usage meter')

  // Historical backfill: scan the harness session logs (calls made before
  // this plugin existed) once at boot, then periodically and on each usage
  // read. Runs in the background; failures never affect the plugin.
  ctx.effect(() => {
    void scanSessions()
    const timer = setInterval(() => void scanSessions(), 15 * 60 * 1000)
    return () => clearInterval(timer)
  }, 'quota-badge: usage backfill')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/quota/update/check',
    async handler(req, res) {
      // POST = manual check (force); GET = cached/auto result
      const result = await checkUpdate(req.method === 'POST')
      json(res, result)
    },
  }), 'quota-badge: update check route')

  // Auto update check: shortly after boot, then every 6 hours.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      void checkUpdate(false)
      const interval = setInterval(() => void checkUpdate(false), 6 * 60 * 60 * 1000)
      timer._interval = interval
    }, 20 * 1000)
    return () => {
      clearTimeout(timer)
      if (timer._interval !== undefined) clearInterval(timer._interval)
    }
  }, 'quota-badge: auto update check')
}
