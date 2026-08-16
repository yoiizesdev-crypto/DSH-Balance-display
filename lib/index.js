/**
 * dsh-quota-badge — host half.
 *
 * Serves one exact route `GET /quota/balance` used by the browser half:
 * resolves the DEEPSEEK_API_KEY credential (the same seam the model provider
 * uses), queries the official DeepSeek balance API with Node's global fetch,
 * and returns `{ balance, currency, error }` as JSON.
 *
 * IMPORTANT (2026-08-16): the previous version used `ctx.get('shell')` to
 * curl the API. In the Web/desktop composition `tool-bash` is DISABLED, so
 * the shell executor is a per-session service and `ctx.shell` is undefined
 * in the host plane — apply() silently returned and the route never
 * registered. Plain fetch needs no shell and keeps the API key out of any
 * command line.
 *
 * The browser half is picked up by dsh-client-modules through the package's
 * `dsh.client` declaration, so this file only needs the loader entry from
 * `cordis.patch.yml` (which injects `webServer` so this apply runs after the
 * server exists).
 */

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
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ balance: null, error: 'no api key' }))
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
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ balance, currency: 'CNY', error }))
      } catch (err) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          balance: null,
          error: err !== null && typeof err === 'object' && typeof err.message === 'string' ? err.message : 'request failed',
        }))
      }
    },
  }), 'quota-badge: balance route')
}
