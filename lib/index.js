/**
 * dsh-quota-badge — host half.
 *
 * Serves three exact routes used by the browser half:
 *
 *   GET  /quota/balance  — resolve the DEEPSEEK_API_KEY credential (the same
 *                          seam the model provider uses), query the official
 *                          DeepSeek balance API with Node's global fetch, and
 *                          return `{ balance, currency, error }` as JSON.
 *                          Every successful read also appends a history
 *                          sample `{ t, balance }` for the monitoring chart.
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
import { homedir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Parameters & persistence
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  showBadge: true, // 显示侧边栏余额徽章
  autoRefresh: true, // 自动按间隔刷新余额
  refreshInterval: 5, // 自动刷新间隔（秒）
  showPhaseTag: true, // 徽章显示「高峰/空闲」时段标签
  showPricePanel: true, // 悬停徽章显示峰谷价格面板
})

const REFRESH_MIN = 3
const REFRESH_MAX = 600
const HISTORY_LIMIT = 720

/** In-memory { config, history } once loaded from disk. */
let cached = null
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
    if (typeof raw !== 'boolean') return { ok: false, error: `field "${key}" must be a boolean` }
    next[key] = raw
  }
  return { ok: true, value: next }
}

/** Load the persisted state once; a missing or corrupt file falls back to defaults. */
async function loadState() {
  if (cached !== null) return cached
  const state = { config: { ...DEFAULTS }, history: [] }
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
          .filter((item) => item !== null && typeof item === 'object'
            && typeof item.t === 'number' && Number.isFinite(item.t)
            && typeof item.balance === 'number' && Number.isFinite(item.balance))
          .slice(-HISTORY_LIMIT)
      }
    }
  } catch {
    // missing or unreadable file → defaults
  }
  cached = state
  return state
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

/** Append one successful balance sample, capped; at most one sample per second. */
function recordHistory(balance) {
  const t = Date.now()
  const history = cached.history
  const last = history[history.length - 1]
  if (last !== undefined && t - last.t < 1000) return
  history.push({ t, balance })
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT)
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
        const info = infos.find((item) => item !== null && typeof item === 'object' && item.currency === 'CNY') || infos[0]
        let balance = null
        let error = 'unexpected response'
        if (info !== undefined && typeof info.total_balance === 'string') {
          const parsed = Math.round(Number(info.total_balance) * 100) / 100
          if (Number.isFinite(parsed)) {
            balance = parsed
            error = null
            await loadState()
            recordHistory(balance)
          }
        }
        json(res, { balance, currency: 'CNY', error })
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
}
