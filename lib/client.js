// dsh-quota-badge — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules at /plugins/dsh-quota-badge/client.js and
// executed through the vendored cordis Loader's lazy-CJS module table
// (window.__ModuleLoader__.load). The factory body is plain CJS with
// require() resolved against the shell's module table — the same shape the
// shipped ui-* packages' bundles emit. Only platform seed words and
// registered client bundles may be required.
//
// Features:
//   - 「余额」badge at the sidebar foot (beside Settings), every N seconds
//     (configurable) fetch of the DeepSeek official balance via the host
//     route GET /quota/balance.
//   - Odometer-style digit roll animation on change (up = green, down = red,
//     fading back to the base color).
//   - Dot badge before the number: gently breathes (opacity/scale pulse) on
//     every successful refresh, so the heartbeat stays visible; flashes
//     silver on first load, green when the balance rises, red when it falls
//     — any change, however small, animates.
//   - Manual refresh button (rotating circular-arrow icon) pinned to the
//     right edge of the sidebar.
//   - Small phase tag at the label bottom-right: 「空闲时段」(green) /
//     「高峰时段」(orange), switched by the same Beijing-time peak windows
//     (9:00-12:00, 14:00-18:00) used by the price chart, refreshed on the
//     30 s clock.
//   - Hover the badge for 3 s: a black panel expands upward showing a price
//     chart — X axis 0-24 h (Beijing time), Y axis CNY per million tokens —
//     with the peak-window bands highlighted, both model output-price step
//     lines, and the current local time marked on the chart.
//   - Settings → 「余额监控」section: live balance display, balance trend
//     sparkline (host-recorded history), and adjustable parameters:
//     showBadge / autoRefresh / refreshInterval / showPhaseTag /
//     showPricePanel. Parameters persist through the host route
//     POST /quota/config and apply to the badge live.
//
// All state flows through one module-level store (QUOTA_STATE) shared by the
// badge and the settings section; React reads it with useSyncExternalStore.

window.__ModuleLoader__.load({
  id: 'dsh-quota-badge',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')

    var CSS = [
      '.q-wrap{flex:1 1 auto;width:100%;box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:flex-start;min-width:0;height:32px;padding:0 10px;background:var(--dsw-alias-bg-base);border-radius:10px;margin:8px 0 0;cursor:default;user-select:none}',
      '.q-label{flex:none;min-width:0;position:relative;line-height:1}',
      '.q-spacer{flex:1 1 auto;min-width:0}',
      '.q-num{flex:none;min-width:0;display:inline-flex;align-items:center}',
      '.q-phase{position:absolute;left:100%;bottom:0;margin-left:3px;font-size:8px;line-height:1;font-weight:600;white-space:nowrap;pointer-events:none;user-select:none}',
      '.q-dot{width:14px;height:14px;flex:none;margin-right:6px;color:var(--q-idle)}',
      '.q-breathe{display:inline-flex;flex:none;animation:q-breathe 1.2s ease-in-out}',
      '@keyframes q-breathe{0%{opacity:.35;transform:scale(.7)}50%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}',
      '.q-roll-cell{display:inline-block;overflow:hidden;height:1em;line-height:1em;text-align:center;width:0.62em;vertical-align:bottom}',
      '.q-roll-cell.q-static{overflow:visible;width:auto}',
      '.q-roll-track{display:block;height:1em;line-height:1em}',
      '.q-roll-item{display:block;height:1em;line-height:1em;width:0.62em;text-align:center}',
      '@keyframes q-roll-up{0%{transform:var(--q-from);color:var(--q-up)}65%{color:var(--q-up)}100%{transform:var(--q-to);color:var(--q-base)}}',
      '@keyframes q-roll-down{0%{transform:var(--q-from);color:var(--q-down)}65%{color:var(--q-down)}100%{transform:var(--q-to);color:var(--q-base)}}',
      '@keyframes q-dot-flash{0%{color:var(--q-flash);filter:drop-shadow(0 0 2px rgba(255,255,255,.9))}45%{color:var(--q-flash);filter:drop-shadow(0 0 3px rgba(255,255,255,.95))}70%{color:var(--q-silver);filter:drop-shadow(0 0 2px rgba(255,255,255,.8))}100%{color:var(--q-idle);filter:none}}',
      '.q-refresh{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin:0 0 0 2px;flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}',
      '.q-refresh:hover{color:var(--dsw-alias-label-primary)}',
      '.q-refresh svg{width:14px;height:14px;display:block}',
      '.q-refresh.q-spin svg{animation:q-rotate .45s ease-out}',
      '@keyframes q-rotate{to{transform:rotate(360deg)}}',
      '.q-pop{position:fixed;z-index:60;width:360px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:12px 14px;background:rgba(9,11,15,.95);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.55);color:#e8eaf0;font-size:12px;line-height:1.5;animation:q-pop .28s ease-out;transform-origin:bottom center}',
      '@keyframes q-pop{from{opacity:0;transform:scaleY(.5)}to{opacity:1;transform:scaleY(1)}}',
      '.q-pop-title{font-weight:600;margin-bottom:4px}',
      '.q-pop-legend{display:flex;gap:14px;margin:4px 0 6px;color:rgba(232,234,240,.85)}',
      '.q-pop-swatch{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}',
      '.q-pop-info{margin-top:6px;padding:6px 8px;background:rgba(255,255,255,.06);border-radius:8px}',
      '.q-pop-now{color:#ff6b6b;font-weight:600}',
      '.q-pop-note{margin-top:6px;color:rgba(232,234,240,.5);font-size:11px}',
      // ---- settings section ----
      '.qs-section{max-width:720px;width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex;padding:4px 0 24px}',
      '.qs-head{flex-direction:column;gap:4px;display:flex}',
      '.qs-title{margin:0;font-size:16px;font-weight:500;line-height:24px}',
      '.qs-intro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.qs-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:10px;padding:12px 14px;display:flex;background:var(--dsw-alias-bg-base)}',
      '.qs-card-head{flex:none;align-items:center;justify-content:space-between;gap:8px;display:flex}',
      '.qs-card-title{font-size:13px;font-weight:600;line-height:20px}',
      '.qs-live-main{flex:none;align-items:baseline;gap:6px;display:flex}',
      '.qs-live-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;margin-right:2px}',
      '.qs-live-num{font-size:30px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}',
      '.qs-live-unit{font-size:14px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.qs-live-cur{flex:none;font-size:10px;font-weight:600;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:1px 5px;line-height:14px}',
      '.qs-cur-list{flex:none;flex-direction:column;gap:2px;display:flex;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}',
      '.qs-cur-row{flex:none;align-items:center;justify-content:space-between;gap:8px;display:flex;font-size:13px;line-height:20px;padding:3px 8px;border-radius:8px}',
      '.qs-cur-row.qs-cur-on{background:var(--dsw-alias-interactive-bg-hover)}',
      '.qs-cur-code{color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.qs-cur-value{font-variant-numeric:tabular-nums}',
      '.qs-currency{gap:4px;flex-wrap:wrap;justify-content:flex-end}',
      '.qs-live-meta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;gap:12px;display:flex;flex-wrap:wrap}',
      '.qs-live-ok{color:var(--dsw-alias-state-success-primary)}',
      '.qs-live-err{color:var(--dsw-alias-state-error-primary)}',
      '.qs-refresh{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:auto;flex:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:0}',
      '.qs-refresh:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.qs-refresh svg{width:14px;height:14px;display:block}',
      '.qs-refresh.qs-spin svg{animation:q-rotate .45s ease-out}',
      '.qs-range{flex:none;gap:4px;display:inline-flex}',
      '.qs-range-btn{box-sizing:border-box;height:24px;cursor:pointer;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:6px;padding:0 8px;font-size:11px;line-height:22px;font-family:inherit}',
      '.qs-range-btn:hover{color:var(--dsw-alias-label-primary)}',
      '.qs-range-btn.qs-on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.qs-chart{width:100%;position:relative}',
      '.qs-hover-tip{position:absolute;top:-8px;transform:translateX(-50%);z-index:2;pointer-events:none;background:rgba(9,11,15,.92);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:4px 9px;color:#e8eaf0;font-size:11px;line-height:16px;white-space:nowrap;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,.4)}',
      '.qs-hover-tip.qs-flip{transform:translateX(-92%)}',
      '.qs-hover-time{color:rgba(232,234,240,.6)}',
      '.qs-hover-val{font-weight:600;font-variant-numeric:tabular-nums}',
      '.qs-chart svg{display:block}',
      '.qs-chart-axis{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;justify-content:space-between;display:flex;margin-top:2px}',
      '.qs-chart-stats{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.qs-chart-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:28px 0;text-align:center}',
      '.qs-row{box-sizing:border-box;flex:none;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2);display:flex;cursor:pointer}',
      '.qs-card > .qs-row:first-of-type{border-top:none}',
      '.qs-row-label{flex-direction:column;gap:2px;min-width:0;display:flex}',
      '.qs-row-title{font-size:13px;line-height:20px}',
      '.qs-row-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.qs-switch{box-sizing:border-box;width:36px;height:20px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;flex:none;padding:0;position:relative;transition:background .18s ease}',
      '.qs-switch .qs-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .18s ease,background .18s ease}',
      '.qs-switch.qs-on{background:var(--dsw-alias-state-success-primary);border-color:transparent}',
      '.qs-switch.qs-on .qs-switch-knob{transform:translateX(16px);background:#fff}',
      '.qs-input{box-sizing:border-box;width:72px;height:28px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:0 8px;font-size:13px;text-align:right;font-family:inherit}',
      '.qs-input:focus{outline:none;border-color:var(--dsw-alias-state-success-primary)}',
    ].join('\n')

    var CSS_TAG = 'dsh-quota-badge'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
      var tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', CSS_TAG)
      tag.textContent = CSS
      ;(document.head || document.documentElement).appendChild(tag)
    }

    var DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

    function isDigitChar(c) {
      return c !== null && typeof c === 'string' && c.length === 1 && c >= '0' && c <= '9'
    }

    // DeepSeek official peak/off-peak pricing (Beijing time, effective
    // 2026-08-17 00:00). Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
    var PRICING = {
      'deepseek-v4-flash': { label: 'V4-Flash', color: '#4fc3f7', idle: { hit: 0.05, in: 1.5, out: 4.5 }, peak: { hit: 0.10, in: 3.0, out: 9.0 } },
      'deepseek-v4-pro': { label: 'V4-Pro', color: '#b39ddb', idle: { hit: 0.15, in: 4.5, out: 13.5 }, peak: { hit: 0.30, in: 9.0, out: 27.0 } },
    }
    // Peak windows in minutes: 9:00-12:00, 14:00-18:00 (Beijing time)
    var PEAK_MIN = [[540, 720], [840, 1080]]
    function isPeak(hourFrac) {
      var m = hourFrac * 60
      return PEAK_MIN.some(function (r) { return m >= r[0] && m < r[1] })
    }
    function priceOf(model, hourFrac, field) {
      return isPeak(hourFrac) ? model.peak[field] : model.idle[field]
    }

    // -----------------------------------------------------------------------
    // Shared store: config + live balance + history, one source of truth for
    // the badge and the settings section.
    // -----------------------------------------------------------------------

    var DEFAULTS = {
      showBadge: true,
      autoRefresh: true,
      refreshInterval: 5,
      showPhaseTag: true,
      showPricePanel: true,
      displayCurrency: 'auto',
    }

    var QUOTA_STATE = {
      config: null, // merged config, null until the first successful load
      balances: null, // { CNY: 20.99, USD: 12.34 } latest successful read, or null
      currency: null, // primary currency code (CNY preferred, else the first)
      error: null, // last fetch error message or null
      lastUpdated: null, // ms timestamp of the last successful fetch
      history: [], // [{ t, balances: { CNY: .., USD: .. } }] recorded by the host
      fetching: false, // a balance fetch is in flight
      fetchStartedAt: 0,
      breathe: 0, // incremented on every successful fetch (dot pulse)
      revision: 0,
    }
    var listeners = new Set()

    function getSnapshot() {
      return QUOTA_STATE
    }

    function subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    }

    function update(patch) {
      QUOTA_STATE = Object.assign({}, QUOTA_STATE, patch, { revision: QUOTA_STATE.revision + 1 })
      for (var fn of [...listeners]) {
        try { fn() } catch (e) { /* listener errors never break the store */ }
      }
    }

    // -----------------------------------------------------------------------
    // Multi-currency helpers
    // -----------------------------------------------------------------------

    function symbolOf(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      if (currency === 'EUR') return '€'
      if (currency === 'JPY') return '¥'
      if (currency === 'GBP') return '£'
      return currency
    }

    /**
     * Resolve what the badge shows: the config-selected currency (auto = CNY
     * preferred, else the first available). Falls back gracefully when the
     * chosen currency is absent from the latest read.
     */
    function resolveDisplay(snap) {
      var cfg = snap.config === null ? DEFAULTS : snap.config
      var list = snap.balances
      if (list === null || typeof list !== 'object' || Object.keys(list).length === 0) {
        return { value: null, currency: 'CNY', symbol: '¥' }
      }
      var keys = Object.keys(list)
      var want = cfg.displayCurrency === 'auto'
        ? (keys.indexOf('CNY') !== -1 ? 'CNY' : keys[0])
        : cfg.displayCurrency
      if (keys.indexOf(want) === -1) {
        want = keys.indexOf('CNY') !== -1 ? 'CNY' : keys[0]
      }
      return { value: list[want], currency: want, symbol: symbolOf(want) }
    }

    /** Extract per-currency points from history, tolerating legacy samples. */
    function historyPoints(snap, currency) {
      var out = []
      for (var i = 0; i < snap.history.length; i++) {
        var h = snap.history[i]
        if (h === null || typeof h !== 'object' || typeof h.t !== 'number') continue
        var value
        if (h.balances !== null && typeof h.balances === 'object') {
          value = h.balances[currency]
        } else if (currency === 'CNY' && typeof h.balance === 'number') {
          value = h.balance // legacy single-currency sample
        }
        if (typeof value === 'number' && Number.isFinite(value)) out.push({ t: h.t, balance: value })
      }
      return out
    }

    var loopTimer = null
    function startLoop() {
      if (loopTimer !== null) { clearInterval(loopTimer); loopTimer = null }
      var cfg = QUOTA_STATE.config
      if (cfg === null || !cfg.autoRefresh) return
      var ms = Math.max(3000, Math.min(600000, Math.round(cfg.refreshInterval) * 1000))
      loopTimer = setInterval(refreshBalance, ms)
    }

    function stopLoop() {
      if (loopTimer !== null) { clearInterval(loopTimer); loopTimer = null }
    }

    function refreshBalance() {
      var now = Date.now()
      if (QUOTA_STATE.fetching && now - QUOTA_STATE.fetchStartedAt < 20000) return
      update({ fetching: true, fetchStartedAt: now })
      fetch('/quota/balance', { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (data) {
          if (data !== null && typeof data === 'object' && Array.isArray(data.balances) && data.balances.length > 0) {
            var balances = {}
            for (var i = 0; i < data.balances.length; i++) {
              var item = data.balances[i]
              if (item !== null && typeof item === 'object' && typeof item.currency === 'string'
                && typeof item.balance === 'number' && Number.isFinite(item.balance)) {
                balances[item.currency] = item.balance
              }
            }
            var keys = Object.keys(balances)
            if (keys.length > 0) {
              var primary = keys.indexOf('CNY') !== -1 ? 'CNY' : keys[0]
              update({
                balances: balances,
                currency: primary,
                error: null,
                lastUpdated: Date.now(),
                breathe: QUOTA_STATE.breathe + 1,
              })
              return
            }
            update({ error: '查询失败' })
          } else {
            update({ error: data !== null && typeof data === 'object' && typeof data.error === 'string' ? data.error : '查询失败' })
          }
        })
        .catch(function () { update({ error: '网络请求失败' }) })
        .finally(function () { update({ fetching: false }) })
    }

    function loadConfig() {
      return fetch('/quota/config', { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (data) {
          if (data !== null && typeof data === 'object' && data.config !== null && typeof data.config === 'object') {
            update({ config: data.config, history: Array.isArray(data.history) ? data.history : [] })
            startLoop()
          }
        })
        .catch(function () { /* host half unavailable → keep defaults */ })
    }

    function saveConfig(patch) {
      return fetch('/quota/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
        cache: 'no-store',
      })
        .then(function (r) { return r.json() })
        .then(function (data) {
          if (data !== null && typeof data === 'object' && data.config !== null && typeof data.config === 'object') {
            update({ config: data.config, history: Array.isArray(data.history) ? data.history : QUOTA_STATE.history })
            startLoop()
          }
          return data
        })
        .catch(function () { return null })
    }

    // -----------------------------------------------------------------------
    // Settings section components
    // -----------------------------------------------------------------------

    var RANGE_OPTIONS = [
      { id: '30m', label: '近30分钟' },
      { id: '1h', label: '近1小时' },
      { id: 'all', label: '全部' },
    ]

    function fmtClock(ms) {
      var d = new Date(ms)
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2)
    }

    function SwitchRow(props) {
      var checked = !!props.checked
      return react.createElement('label', { className: 'qs-row' },
        react.createElement('span', { className: 'qs-row-label' },
          react.createElement('span', { className: 'qs-row-title' }, props.label),
          typeof props.hint === 'string' ? react.createElement('span', { className: 'qs-row-hint' }, props.hint) : null,
        ),
        react.createElement('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          className: 'qs-switch' + (checked ? ' qs-on' : ''),
          onClick: function () { props.onChange(!checked) },
        }, react.createElement('span', { className: 'qs-switch-knob' })),
      )
    }

    function IntervalField(props) {
      var value = props.value
      var draftState = react.useState(String(value))
      var draft = draftState[0]
      var setDraft = draftState[1]
      react.useEffect(function () { setDraft(String(value)) }, [value])
      var commit = function () {
        var text = String(draft).trim()
        var n = Number(text)
        if (text.length === 0 || !Number.isFinite(n)) { setDraft(String(value)); return }
        var clamped = Math.round(Math.min(600, Math.max(3, n)))
        if (clamped !== value) props.onChange(clamped)
        else setDraft(String(clamped))
      }
      return react.createElement('label', { className: 'qs-row' },
        react.createElement('span', { className: 'qs-row-label' },
          react.createElement('span', { className: 'qs-row-title' }, '自动刷新间隔（秒）'),
          react.createElement('span', { className: 'qs-row-hint' }, '3–600 秒，保存后立即生效'),
        ),
        react.createElement('input', {
          type: 'number',
          min: 3,
          max: 600,
          step: 1,
          className: 'qs-input',
          value: draft,
          onChange: function (e) { setDraft(e.target.value) },
          onBlur: commit,
          onKeyDown: function (e) { if (e.key === 'Enter') commit() },
        }),
      )
    }

    function Sparkline(props) {
      var points = props.points
      var symbol = typeof props.symbol === 'string' ? props.symbol : ''
      var hoverState = react.useState(null)
      var hoverIdx = hoverState[0]
      var setHoverIdx = hoverState[1]
      if (points.length < 2) {
        return react.createElement('div', { className: 'qs-chart-empty' }, '暂无足够数据，等待自动刷新积累…')
      }
      var W = 560
      var H = 132
      var PX = 10
      var PY = 10
      var t0 = points[0].t
      var t1 = points[points.length - 1].t
      var span = t1 - t0
      var min = Infinity
      var max = -Infinity
      for (var i = 0; i < points.length; i++) {
        var b = points[i].balance
        if (b < min) min = b
        if (b > max) max = b
      }
      if (!Number.isFinite(min) || min === max) { min = min - 1; max = max + 1 }
      var pad = (max - min) * 0.08
      min = min - pad
      max = max + pad
      function x(t) {
        return span > 0 ? PX + (t - t0) / span * (W - PX * 2) : PX
      }
      function y(b) {
        return H - PY - (b - min) / (max - min) * (H - PY * 2)
      }
      var line = []
      var area = []
      for (var j = 0; j < points.length; j++) {
        var px = x(points[j].t).toFixed(1)
        var py = y(points[j].balance).toFixed(1)
        line.push(px + ',' + py)
      }
      area = line.slice()
      area.push((W - PX).toFixed(1) + ',' + (H - PY).toFixed(1))
      area.push(PX.toFixed(1) + ',' + (H - PY).toFixed(1))
      var lastP = points[points.length - 1]
      var lastX = x(lastP.t).toFixed(1)
      var lastY = y(lastP.balance).toFixed(1)
      var gridY1 = y(min + (max - min) * 0.25).toFixed(1)
      var gridY2 = y(min + (max - min) * 0.75).toFixed(1)
      var fmtShort = function (d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) }

      // Stock-style crosshair: snap to the nearest sample, show a vertical
      // guide line, a highlighted dot, and a tooltip that follows the cursor.
      var onMove = function (e) {
        var rect = e.currentTarget.getBoundingClientRect()
        if (rect === null || rect.width === 0) return
        var ratio = (e.clientX - rect.left) / rect.width
        if (ratio < 0 || ratio > 1) return
        var idx = Math.round(ratio * (points.length - 1))
        if (idx < 0) idx = 0
        if (idx > points.length - 1) idx = points.length - 1
        setHoverIdx(idx)
      }
      var onLeave = function () { setHoverIdx(null) }

      var active = hoverIdx === null ? points.length - 1 : hoverIdx
      var hx = x(points[active].t).toFixed(1)
      var hy = y(points[active].balance).toFixed(1)
      var tipLeft = (x(points[active].t) / W) * 100
      var tipFlip = x(points[active].t) > W * 0.8

      return react.createElement('div', { className: 'qs-chart' },
        react.createElement('svg', {
          width: '100%',
          viewBox: '0 0 ' + W + ' ' + H,
          preserveAspectRatio: 'none',
          style: { cursor: 'crosshair' },
          onMouseMove: onMove,
          onMouseLeave: onLeave,
        },
          react.createElement('line', { x1: PX, y1: gridY1, x2: W - PX, y2: gridY1, stroke: 'rgba(128,138,158,.18)', strokeWidth: 1 }),
          react.createElement('line', { x1: PX, y1: gridY2, x2: W - PX, y2: gridY2, stroke: 'rgba(128,138,158,.18)', strokeWidth: 1 }),
          react.createElement('polygon', { points: area.join(' '), fill: 'var(--dsw-alias-state-success-primary)', opacity: 0.12 }),
          react.createElement('polyline', { points: line.join(' '), fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }),
          hoverIdx !== null ? react.createElement('line', { x1: hx, y1: PY, x2: hx, y2: H - PY, stroke: 'rgba(128,138,158,.55)', strokeWidth: 1, strokeDasharray: '3 3' }) : null,
          react.createElement('circle', { cx: hoverIdx === null ? lastX : hx, cy: hoverIdx === null ? lastY : hy, r: hoverIdx === null ? 3 : 4.5, fill: 'var(--dsw-alias-state-success-primary)', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 1.5 }),
        ),
        hoverIdx !== null ? react.createElement('div', {
          className: 'qs-hover-tip' + (tipFlip ? ' qs-flip' : ''),
          style: { left: tipLeft + '%' },
        },
          react.createElement('div', { className: 'qs-hover-time' }, fmtClock(points[active].t)),
          react.createElement('div', { className: 'qs-hover-val' }, symbol + points[active].balance.toFixed(2)),
        ) : null,
        react.createElement('div', { className: 'qs-chart-axis' },
          react.createElement('span', null, fmtShort(new Date(points[0].t))),
          react.createElement('span', null, '当前 ' + fmtShort(new Date(lastP.t))),
        ),
      )
    }

    var REFRESH_ICON = react.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
      react.createElement('polyline', { points: '23 4 23 10 17 10' }),
      react.createElement('polyline', { points: '1 20 1 14 7 14' }),
      react.createElement('path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }),
    )

    function CurrencyField(props) {
      return react.createElement('div', { className: 'qs-row' },
        react.createElement('span', { className: 'qs-row-label' },
          react.createElement('span', { className: 'qs-row-title' }, '徽章显示币种'),
          react.createElement('span', { className: 'qs-row-hint' }, '自动 = CNY 优先，否则第一个可用币种'),
        ),
        react.createElement('div', { className: 'qs-range qs-currency' },
          props.options.map(function (opt) {
            return react.createElement('button', {
              key: opt.id,
              type: 'button',
              className: 'qs-range-btn' + (props.value === opt.id ? ' qs-on' : ''),
              onClick: function () { props.onChange(opt.id) },
            }, opt.label)
          }),
        ),
      )
    }

    /** Options for the currency field: 自动 + every currency on the account. */
    function currencyOptions(snap, cfg) {
      var seen = { auto: true }
      var opts = [{ id: 'auto', label: '自动' }]
      var list = snap.balances
      if (list !== null && typeof list === 'object') {
        for (var cur of Object.keys(list)) {
          if (seen[cur]) continue
          seen[cur] = true
          opts.push({ id: cur, label: cur })
        }
      }
      if (cfg.displayCurrency !== 'auto' && !seen[cfg.displayCurrency]) {
        opts.push({ id: cfg.displayCurrency, label: cfg.displayCurrency })
      }
      return opts
    }

    function QuotaSettingsSection(props) {
      var snap = react.useSyncExternalStore(subscribe, getSnapshot)
      var cfg = snap.config === null ? DEFAULTS : snap.config
      var display = resolveDisplay(snap)
      var rangeState = react.useState('30m')
      var range = rangeState[0]
      var setRange = rangeState[1]
      var cutoff = range === '30m' ? Date.now() - 30 * 60 * 1000 : range === '1h' ? Date.now() - 60 * 60 * 1000 : 0
      var points = historyPoints(snap, display.currency).filter(function (p) { return p.t >= cutoff })
      var minB = Infinity
      var maxB = -Infinity
      for (var i = 0; i < points.length; i++) {
        if (points[i].balance < minB) minB = points[i].balance
        if (points[i].balance > maxB) maxB = points[i].balance
      }
      var hasPoints = points.length > 0
      // Stable display order: CNY always on top, the rest alphabetically —
      // never reorders between refreshes regardless of API order.
      var curRows = snap.balances === null ? [] : Object.keys(snap.balances).sort(function (a, b) {
        if (a === 'CNY') return b === 'CNY' ? 0 : -1
        if (b === 'CNY') return 1
        return a < b ? -1 : a > b ? 1 : 0
      }).map(function (cur) {
        return { currency: cur, balance: snap.balances[cur] }
      })
      var curOpts = currencyOptions(snap, cfg)
      return react.createElement('div', { className: 'qs-section' },
        react.createElement('div', { className: 'qs-head' },
          react.createElement('h2', { className: 'qs-title' }, '余额监控'),
          react.createElement('p', { className: 'qs-intro' }, '实时显示 DeepSeek 账户全部币种余额与历史趋势。调整下方参数会立即保存并生效。'),
        ),
        react.createElement('div', { className: 'qs-card' },
          react.createElement('div', { className: 'qs-live-main' },
            react.createElement('span', {
              className: 'qs-live-dot',
              style: { background: snap.error === null ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' },
            }),
            react.createElement('span', { className: 'qs-live-num' }, display.value === null ? '--' : String(display.value)),
            react.createElement('span', { className: 'qs-live-unit' }, display.symbol),
            react.createElement('span', { className: 'qs-live-cur' }, display.currency),
            react.createElement('button', {
              type: 'button',
              className: 'qs-refresh' + (snap.fetching ? ' qs-spin' : ''),
              onClick: refreshBalance,
              'aria-label': '立即刷新余额',
            }, REFRESH_ICON),
          ),
          curRows.length > 0 ? react.createElement('div', { className: 'qs-cur-list' },
            curRows.map(function (row) {
              return react.createElement('div', {
                key: row.currency,
                className: 'qs-cur-row' + (display.currency === row.currency ? ' qs-cur-on' : ''),
              },
                react.createElement('span', { className: 'qs-cur-code' }, row.currency),
                react.createElement('span', { className: 'qs-cur-value' }, symbolOf(row.currency) + String(row.balance)),
              )
            }),
          ) : null,
          react.createElement('div', { className: 'qs-live-meta' },
            react.createElement('span', { className: snap.error === null ? 'qs-live-ok' : 'qs-live-err' }, snap.error === null ? '查询正常' : String(snap.error)),
            react.createElement('span', null, '最后更新 ' + (snap.lastUpdated === null ? '—' : fmtClock(snap.lastUpdated))),
            react.createElement('span', null, '自动刷新 ' + (cfg.autoRefresh ? '每 ' + cfg.refreshInterval + ' 秒' : '已关闭')),
          ),
        ),
        react.createElement('div', { className: 'qs-card' },
          react.createElement('div', { className: 'qs-card-head' },
            react.createElement('span', { className: 'qs-card-title' }, '余额趋势 · ' + display.currency),
            react.createElement('div', { className: 'qs-range' },
              RANGE_OPTIONS.map(function (opt) {
                return react.createElement('button', {
                  key: opt.id,
                  type: 'button',
                  className: 'qs-range-btn' + (range === opt.id ? ' qs-on' : ''),
                  onClick: function () { setRange(opt.id) },
                }, opt.label)
              }),
            ),
          ),
          hasPoints ? react.createElement('div', { style: { flexDirection: 'column', gap: 6, display: 'flex' } },
            react.createElement(Sparkline, { points: points, symbol: display.symbol }),
            react.createElement('div', { className: 'qs-chart-stats' },
              '当前 ' + display.symbol + (display.value === null ? '--' : String(display.value)),
              ' · 区间最低 ' + display.symbol + (minB === Infinity ? '--' : minB.toFixed(2)),
              ' · 区间最高 ' + display.symbol + (maxB === -Infinity ? '--' : maxB.toFixed(2)),
            ),
          ) : react.createElement('div', { className: 'qs-chart-empty' }, '当前区间暂无数据'),
        ),
        react.createElement('div', { className: 'qs-card' },
          react.createElement('div', { className: 'qs-card-head' },
            react.createElement('span', { className: 'qs-card-title' }, '参数'),
          ),
          react.createElement(CurrencyField, {
            value: cfg.displayCurrency,
            options: curOpts,
            onChange: function (v) { saveConfig({ displayCurrency: v }) },
          }),
          react.createElement(SwitchRow, {
            label: '显示侧边栏余额徽章',
            hint: '在侧边栏底部显示余额徽章',
            checked: cfg.showBadge,
            onChange: function (v) { saveConfig({ showBadge: v }) },
          }),
          react.createElement(SwitchRow, {
            label: '自动刷新余额',
            hint: '按下方间隔自动查询 DeepSeek 余额 API',
            checked: cfg.autoRefresh,
            onChange: function (v) { saveConfig({ autoRefresh: v }) },
          }),
          react.createElement(IntervalField, {
            value: cfg.refreshInterval,
            onChange: function (v) { saveConfig({ refreshInterval: v }) },
          }),
          react.createElement(SwitchRow, {
            label: '显示「高峰/空闲」时段标签',
            hint: '徽章上标注当前是否为高峰时段',
            checked: cfg.showPhaseTag,
            onChange: function (v) { saveConfig({ showPhaseTag: v }) },
          }),
          react.createElement(SwitchRow, {
            label: '悬停显示峰谷价格面板',
            hint: '悬停徽章 3 秒展开价格曲线',
            checked: cfg.showPricePanel,
            onChange: function (v) { saveConfig({ showPricePanel: v }) },
          }),
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Price chart hover panel (unchanged)
    // -----------------------------------------------------------------------

    var W = 332, H = 170, PL = 36, PR = 10, PT = 16, PB = 24, YMAX = 30
    function mx(h) { return PL + (h / 24) * (W - PL - PR) }
    function my(v) { return H - PB - (v / YMAX) * (H - PT - PB) }
    var X_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
    var Y_TICKS = [0, 5, 10, 15, 20, 25, 30]

    function ChartPanel(props) {
      var now = props.now
      var style = props.style
      var hourFrac = now.getHours() + now.getMinutes() / 60
      var peakNow = isPeak(hourFrac)
      var models = Object.keys(PRICING).map(function (k) { return PRICING[k] })
      var stepPoints = function (model, field) {
        var pts = []
        for (var h = 0; h <= 24; h += 0.25) {
          var v = priceOf(model, h, field)
          pts.push(mx(h).toFixed(1) + ',' + my(v).toFixed(1))
        }
        return pts.join(' ')
      }
      var hh = ('0' + now.getHours()).slice(-2)
      var mm = ('0' + now.getMinutes()).slice(-2)
      var lineX = mx(hourFrac).toFixed(1)
      return react.createElement('div', { className: 'q-pop', style: style, onMouseEnter: props.onEnter, onMouseLeave: props.onLeave },
        react.createElement('div', { className: 'q-pop-title' }, 'DeepSeek 峰谷价格 · 元/百万 tokens'),
        react.createElement('div', { className: 'q-pop-legend' },
          models.map(function (m) {
            return react.createElement('span', { key: m.label },
              react.createElement('span', { className: 'q-pop-swatch', style: { background: m.color } }), m.label + ' 输出价')
          }),
        ),
        react.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H },
          Y_TICKS.map(function (v) {
            return react.createElement('line', { key: 'y' + v, x1: PL, y1: my(v), x2: W - PR, y2: my(v), stroke: 'rgba(255,255,255,.12)', strokeWidth: 1 })
          }),
          X_TICKS.map(function (h) {
            return react.createElement('line', { key: 'x' + h, x1: mx(h), y1: PT, x2: mx(h), y2: H - PB, stroke: 'rgba(255,255,255,.12)', strokeWidth: 1 })
          }),
          react.createElement('rect', { x: mx(9), y: PT, width: mx(12) - mx(9), height: H - PT - PB, fill: 'rgba(255,170,60,.16)' }),
          react.createElement('rect', { x: mx(14), y: PT, width: mx(18) - mx(14), height: H - PT - PB, fill: 'rgba(255,170,60,.16)' }),
          models.map(function (m) {
            return react.createElement('polyline', { key: 'line' + m.label, points: stepPoints(m, 'out'), fill: 'none', stroke: m.color, strokeWidth: 2, strokeLinejoin: 'round' })
          }),
          react.createElement('line', { x1: lineX, y1: PT, x2: lineX, y2: H - PB, stroke: '#ff6b6b', strokeWidth: 1.5, strokeDasharray: '4 3' }),
          models.map(function (m) {
            return react.createElement('circle', { key: 'dot' + m.label, cx: lineX, cy: my(priceOf(m, hourFrac, 'out')).toFixed(1), r: 3.2, fill: m.color, stroke: '#0b0d11', strokeWidth: 1 })
          }),
          X_TICKS.map(function (h) {
            return react.createElement('text', { key: 'xt' + h, x: mx(h), y: H - 6, fill: 'rgba(232,234,240,.7)', fontSize: 9, textAnchor: h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, String(h))
          }),
          Y_TICKS.map(function (v) {
            return react.createElement('text', { key: 'yt' + v, x: PL - 6, y: my(v) + 3, fill: 'rgba(232,234,240,.7)', fontSize: 9, textAnchor: 'end' }, String(v))
          }),
          react.createElement('text', { x: 8, y: 7, fill: 'rgba(232,234,240,.5)', fontSize: 8 }, '元/百万'),
        ),
        react.createElement('div', { className: 'q-pop-info' },
          '现在 ', react.createElement('span', { className: 'q-pop-now' }, hh + ':' + mm),
          ' · ' + (peakNow ? '高峰时段' : '空闲时段') + ' · ',
          'Flash 输出 ' + priceOf(PRICING['deepseek-v4-flash'], hourFrac, 'out') + ' 元',
          ' / Pro 输出 ' + priceOf(PRICING['deepseek-v4-pro'], hourFrac, 'out') + ' 元',
        ),
        react.createElement('div', { className: 'q-pop-note' }, '高峰 9:00-12:00 / 14:00-18:00（北京时间），其余空闲半价 · 来源：DeepSeek 官方定价（2026-08-17 起）'),
      )
    }

    // -----------------------------------------------------------------------
    // Badge
    // -----------------------------------------------------------------------

    function RollDigit(props) {
      var ref = react.useRef(null)
      var char = props.char
      var prevChar = props.prevChar
      var dir = props.dir
      var animated = isDigitChar(char) && isDigitChar(prevChar) && prevChar !== char
      react.useEffect(function () {
        if (!animated || ref.current === null) return
        var el = ref.current
        var onEnd = function () { el.style.animation = '' }
        el.addEventListener('animationend', onEnd)
        el.style.animation = 'none'
        void el.offsetWidth
        el.style.animation = (dir === 'down' ? 'q-roll-down' : 'q-roll-up') + ' ' + (ROLL_MS / 1000) + 's ease'
        return function () { el.removeEventListener('animationend', onEnd) }
      }, [animated, dir, char, prevChar])
      if (!isDigitChar(char)) {
        return react.createElement('span', { className: 'q-roll-cell q-static' }, char)
      }
      var cur = Number(char)
      var from = isDigitChar(prevChar) ? Number(prevChar) : cur
      return react.createElement('span', { className: 'q-roll-cell' },
        react.createElement('span', {
          ref: ref,
          className: 'q-roll-track',
          style: {
            '--q-from': 'translateY(' + (-from) + 'em)',
            '--q-to': 'translateY(' + (-cur) + 'em)',
            '--q-up': 'var(--dsw-alias-state-success-primary)',
            '--q-down': 'var(--dsw-alias-state-error-primary)',
            '--q-base': 'var(--dsw-alias-label-primary)',
            transform: 'translateY(' + (-cur) + 'em)',
          },
        }, DIGITS.map(function (d) {
          return react.createElement('span', { key: d, className: 'q-roll-item' }, d)
        })),
      )
    }

    var FLASH_COLORS = {
      silver: 'var(--dsw-alias-label-tertiary)',
      green: 'var(--dsw-alias-state-success-primary)',
      red: 'var(--dsw-alias-state-error-primary)',
    }

    /** Odometer roll duration per digit (slowed down for easy eye tracking). */
    var ROLL_MS = 1200

    function BadgeComponent(props) {
      var snap = react.useSyncExternalStore(subscribe, getSnapshot)
      var cfg = snap.config === null ? DEFAULTS : snap.config
      var shown = resolveDisplay(snap)
      var state = react.useState({ text: '--', prevText: null, dir: 'up', flash: 'silver', tick: 0 })
      var display = state[0]
      var setDisplay = state[1]
      var nowState = react.useState(new Date())
      var now = nowState[0]
      var setNow = nowState[1]
      var breatheRef = react.useRef(null)
      var showPopState = react.useState(false)
      var showPop = showPopState[0]
      var setShowPop = showPopState[1]
      var popPosState = react.useState(null)
      var popPos = popPosState[0]
      var setPopPos = popPosState[1]
      var hoverTimer = react.useRef(null)
      var hideTimer = react.useRef(null)
      var wrapRef = react.useRef(null)

      // Roll the odometer digits whenever the shown balance changes. A
      // currency switch re-mounts nothing: the new value just rolls in.
      react.useEffect(function () {
        var b = shown.value
        if (b === null) return
        setDisplay(function (d) {
          var text = String(b)
          if (d.text === text) return d
          var flash = 'silver'
          var dir = d.dir
          var prevText = d.prevText
          if (d.text !== '--' && d.text !== text) {
            dir = b < Number(d.text) ? 'down' : 'up'
            prevText = d.text
            flash = dir === 'down' ? 'red' : 'green'
          }
          return { text: text, prevText: prevText, dir: dir, flash: flash, tick: d.tick + 1 }
        })
      }, [shown.value])

      // Phase-tag clock (30 s).
      react.useEffect(function () {
        var id = setInterval(function () { setNow(new Date()) }, 30000)
        return function () { clearInterval(id) }
      }, [])

      // Restart the breathing pulse on each refresh WITHOUT remounting
      // the dot: a keyed wrapper would recreate the svg and replay its
      // flash animation with the stale last color (e.g. red forever).
      react.useEffect(function () {
        var el = breatheRef.current
        if (el === null) return
        el.style.animation = 'none'
        void el.offsetWidth
        el.style.animation = 'q-breathe 1.2s ease-in-out'
      }, [snap.breathe])

      var onWrapEnter = function () {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
        if (showPop) return
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(function () {
          var el = wrapRef.current
          if (el) {
            var r = el.getBoundingClientRect()
            setPopPos({ left: r.left, top: r.top, viewH: window.innerHeight })
          }
          setShowPop(true)
        }, 3000)
      }
      var onWrapLeave = function () {
        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
        if (!showPop) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(function () { setShowPop(false) }, 350)
      }
      var onPopEnter = function () {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
      }
      var onPopLeave = function () {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(function () { setShowPop(false) }, 350)
      }

      if (cfg.showBadge === false) return null

      var chars = display.text.split('')
      var prevChars = display.prevText === null ? [] : display.prevText.split('')
      var hourFrac = now.getHours() + now.getMinutes() / 60
      var peakNow = isPeak(hourFrac)
      var dotStyle = display.tick > 0 ? {
        '--q-flash': FLASH_COLORS[display.flash] || FLASH_COLORS.silver,
        '--q-silver': '#d5dae2',
        '--q-idle': 'var(--dsw-alias-label-tertiary)',
        animation: 'q-dot-flash 1s ease',
      } : {
        '--q-idle': 'var(--dsw-alias-label-tertiary)',
      }
      var popStyle = popPos === null ? null : {
        left: Math.max(8, popPos.left) + 'px',
        bottom: (popPos.viewH - popPos.top + 8) + 'px',
      }

      return react.createElement('div', {
        ref: wrapRef,
        className: 'q-wrap',
        onMouseEnter: onWrapEnter,
        onMouseLeave: onWrapLeave,
      },
        react.createElement('span', { className: 'q-label' },
          '余额',
          cfg.showPhaseTag === false ? null : react.createElement('span', {
            className: 'q-phase',
            style: {
              color: peakNow ? 'var(--dsw-alias-state-warning-primary, #ffaa3c)' : 'var(--dsw-alias-state-success-primary)',
            },
          }, peakNow ? '高峰时段' : '空闲时段'),
        ),
        react.createElement('span', { className: 'q-spacer' }),
        react.createElement('span', { className: 'q-num' },
          react.createElement('span', { ref: breatheRef, className: 'q-breathe' },
            react.createElement('svg', {
              key: 'f' + display.tick,
              className: 'q-dot',
              style: dotStyle,
              viewBox: '0 0 24 24',
            }, react.createElement('circle', { cx: 12, cy: 12, r: 5.5, fill: 'currentColor' })),
          ),
          chars.map(function (ch, i) {
            return react.createElement(RollDigit, {
              key: i,
              char: ch,
              prevChar: prevChars[i] !== undefined ? prevChars[i] : null,
              dir: display.dir,
            })
          }),
          react.createElement('span', { className: 'q-roll-cell q-static' }, shown.symbol),
        ),
        react.createElement('button', {
          type: 'button',
          className: 'q-refresh' + (snap.fetching ? ' q-spin' : ''),
          onClick: refreshBalance,
          'aria-label': '刷新余额',
        }, REFRESH_ICON),
        showPop && popStyle !== null && cfg.showPricePanel !== false ? react.createElement(ChartPanel, { now: now, style: popStyle, onEnter: onPopEnter, onLeave: onPopLeave }) : null,
      )
    }

    // -----------------------------------------------------------------------
    // Plugin body
    // -----------------------------------------------------------------------

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return

      // Boot the shared store: load persisted parameters and fetch once.
      loadConfig()
      refreshBalance()
      ctx.effect(function () {
        return function () { stopLoop() }
      }, 'quota-badge: refresh loop cleanup')

      // Hide the shipped cordis plugin management button while the badge is
      // visible (reusing its cell); restore it when the user hides the badge.
      // NOTE: the conflict check compares `priority` (NOT `order` — order only
      // refines display). x6's cordis-panel sits at priority 0, so registering
      // the same id at priority -1 is allowed and shadows it (lowest renders).
      slots.inject('sidebar.footer.action', function () {
        var shadowHandle = null
        var applyShadow = function () {
          var cfg = QUOTA_STATE.config
          var active = cfg === null ? true : cfg.showBadge !== false
          if ((shadowHandle !== null) === active) return
          if (shadowHandle !== null) { var h = shadowHandle; shadowHandle = null; h() }
          if (active) {
            shadowHandle = slots.register(
              { name: 'sidebar.footer.action', id: 'cordis-panel', priority: -1 },
              function () { return null },
            )
          }
        }
        var unsub = subscribe(applyShadow)
        applyShadow()
        return function () {
          unsub()
          if (shadowHandle !== null) { shadowHandle(); shadowHandle = null }
        }
      })

      slots.inject('sidebar.footer.action', function () {
        return slots.register(
          { name: 'sidebar.footer.action', id: 'quota-badge', order: -1 },
          function (props) {
            if (!props.wide) return null
            return react.createElement(BadgeComponent, {})
          },
        )
      })

      slots.inject('settings.section', function () {
        return slots.register(
          { name: 'settings.section', id: 'quota', order: 16, label: '余额监控' },
          QuotaSettingsSection,
        )
      })
    }

    exports.apply = apply
    return module.exports
  },
})
