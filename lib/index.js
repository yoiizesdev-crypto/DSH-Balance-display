/**
 * dsh-quota-badge — host half.
 *
 * Serves one exact route `GET /quota/balance` used by the browser half:
 * resolves the DEEPSEEK_API_KEY credential (the same seam the model provider
 * uses), queries the official DeepSeek balance API through `ctx.shell`
 * (curl), and returns `{ balance, currency, error }` as JSON.
 *
 * The browser half is picked up by dsh-client-modules through the package's
 * `dsh.client` declaration, so this file only needs the loader entry from
 * `cordis.patch.yml`.
 */

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  const credentials = ctx.get('credentials')
  const shell = ctx.get('shell')
  if (webServer === undefined || credentials === undefined || shell === undefined) return

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
        const spec = shell.resolve({
          command: 'curl -s --max-time 8 -H "Authorization: Bearer $DSH_QUOTA_KEY" https://api.deepseek.com/user/balance',
          timeoutMs: 10000,
          env: { DSH_QUOTA_KEY: cred.value },
        })
        const result = await shell.run(spec)
        const text = result.stdout && result.stdout.text ? result.stdout.text : ''
        const body = JSON.parse(text)
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
