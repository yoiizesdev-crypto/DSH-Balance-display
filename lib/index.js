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
  displayCurrency: 'auto', // 徽章显示币种：'auto'（CNY 优先，否则第一个）或具体货币码（如 'USD'）
})

const REFRESH_MIN = 3
const REFRESH_MAX = 600
const HISTORY_LIMIT = 720
/** Currency code shape: 2-8 uppercase letters (ISO 4217 style). */
const CURRENCY_PATTERN = /^[A-Z]{2,8}$/

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
          .map(normalizeSample)
          .filter((item) => item !== null)
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
}
