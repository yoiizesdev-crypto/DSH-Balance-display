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
//   - 「余额」badge at the sidebar foot (beside Settings), every 5 s fetch of
//     the DeepSeek official balance via the host route GET /quota/balance.
//   - Odometer-style digit roll animation on change (up = green, down = red,
//     fading back to the base color).
//   - Dot badge before the number: dim gray at rest; flashes silver on every
//     refresh, green when the balance rises, red when it falls.
//   - Manual refresh button (rotating circular-arrow icon) pinned to the
//     right edge of the sidebar.
//   - Small phase tag at the badge bottom-right: 「空闲」(green) / 「高峰」
//     (orange), switched by the same Beijing-time peak windows (9:00-12:00,
//     14:00-18:00) used by the price chart, refreshed on the 30 s clock.
//   - Hover the badge for 3 s: a black panel expands upward showing a price
//     chart — X axis 0-24 h (Beijing time), Y axis CNY per million tokens —
//     with the peak-window bands highlighted, both model output-price step
//     lines, and the current local time marked on the chart.

window.__ModuleLoader__.load({
  id: 'dsh-quota-badge',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')

    var CSS = [
      '.q-wrap{flex:1 1 auto;width:100%;box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:flex-start;min-width:0;height:32px;padding:0 10px;background:var(--dsw-alias-bg-base);border-radius:10px;margin:8px 0 0;cursor:default;user-select:none}',
      '.q-label{flex:none;min-width:0}',
      '.q-spacer{flex:1 1 auto;min-width:0}',
      '.q-num{flex:none;min-width:0;display:inline-flex;align-items:center}',
      '.q-phase{flex:none;align-self:flex-end;font-size:9px;line-height:1;font-weight:600;margin:0 4px 2px 0;user-select:none}',
      '.q-dot{width:14px;height:14px;flex:none;margin-right:6px;color:var(--q-idle)}',
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
      '.q-refresh.q-spin svg{animation:q-rotate .8s linear infinite}',
      '@keyframes q-rotate{to{transform:rotate(360deg)}}',
      '.q-pop{position:fixed;z-index:60;width:360px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:12px 14px;background:rgba(9,11,15,.95);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.55);color:#e8eaf0;font-size:12px;line-height:1.5;animation:q-pop .28s ease-out;transform-origin:bottom center}',
      '@keyframes q-pop{from{opacity:0;transform:scaleY(.5)}to{opacity:1;transform:scaleY(1)}}',
      '.q-pop-title{font-weight:600;margin-bottom:4px}',
      '.q-pop-legend{display:flex;gap:14px;margin:4px 0 6px;color:rgba(232,234,240,.85)}',
      '.q-pop-swatch{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}',
      '.q-pop-info{margin-top:6px;padding:6px 8px;background:rgba(255,255,255,.06);border-radius:8px}',
      '.q-pop-now{color:#ff6b6b;font-weight:600}',
      '.q-pop-note{margin-top:6px;color:rgba(232,234,240,.5);font-size:11px}',
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

    var W = 332, H = 170, PL = 36, PR = 10, PT = 12, PB = 24, YMAX = 30
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
          react.createElement('text', { x: 8, y: 10, fill: 'rgba(232,234,240,.55)', fontSize: 9 }, '元/百万'),
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
        el.style.animation = (dir === 'down' ? 'q-roll-down' : 'q-roll-up') + ' 0.6s ease'
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

    function fetchBalanceJson() {
      return fetch('/quota/balance', { cache: 'no-store' })
        .then(function (res) { return res.json() })
    }

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return

      // Hide the shipped cordis plugin management button (reusing its cell).
      // NOTE: the conflict check compares `priority` (NOT `order` — order only
      // refines display). x6's cordis-panel sits at priority 0, so registering
      // the same id at priority -1 is allowed and shadows it (lowest renders).
      slots.inject('sidebar.footer.action', function () {
        return slots.register(
          { name: 'sidebar.footer.action', id: 'cordis-panel', priority: -1 },
          function () { return null },
        )
      })

      slots.inject('sidebar.footer.action', function () {
        return slots.register(
          { name: 'sidebar.footer.action', id: 'quota-badge', order: -1 },
          function (props) {
            var wide = props.wide
            if (!wide) return null
            var state = react.useState({ text: '--', prevText: null, dir: 'up', flash: 'silver', tick: 0 })
            var display = state[0]
            var setDisplay = state[1]
            var refreshingState = react.useState(false)
            var refreshing = refreshingState[0]
            var setRefreshing = refreshingState[1]
            var nowState = react.useState(new Date())
            var now = nowState[0]
            var setNow = nowState[1]
            var showPopState = react.useState(false)
            var showPop = showPopState[0]
            var setShowPop = showPopState[1]
            var popPosState = react.useState(null)
            var popPos = popPosState[0]
            var setPopPos = popPosState[1]
            var hoverTimer = react.useRef(null)
            var hideTimer = react.useRef(null)
            var wrapRef = react.useRef(null)

            var applyBalance = react.useCallback(function (next) {
              setDisplay(function (d) {
                var text = String(next)
                var flash = 'silver'
                var dir = d.dir
                var prevText = d.prevText
                if (d.text !== '--' && d.text !== text) {
                  dir = next < Number(d.text) ? 'down' : 'up'
                  prevText = d.text
                  flash = dir === 'down' ? 'red' : 'green'
                }
                return { text: text, prevText: prevText, dir: dir, flash: flash, tick: d.tick + 1 }
              })
            }, [])

            var fetchBalance = react.useCallback(function () {
              fetchBalanceJson().then(function (data) {
                if (data !== null && typeof data === 'object' && typeof data.balance === 'number') applyBalance(data.balance)
              }).catch(function () {})
            }, [applyBalance])

            react.useEffect(function () {
              fetchBalance()
              var id = setInterval(fetchBalance, 5000)
              return function () { clearInterval(id) }
            }, [fetchBalance])

            react.useEffect(function () {
              var id = setInterval(function () { setNow(new Date()) }, 30000)
              return function () { clearInterval(id) }
            }, [])

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

            var doRefresh = function () {
              if (refreshing) return
              setRefreshing(true)
              fetchBalanceJson().then(function (data) {
                if (data !== null && typeof data === 'object' && typeof data.balance === 'number') applyBalance(data.balance)
              }).catch(function () {}).finally(function () { setRefreshing(false) })
            }

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
              react.createElement('span', { className: 'q-label' }, '余额'),
              react.createElement('span', { className: 'q-spacer' }),
              react.createElement('span', { className: 'q-num' },
                react.createElement('svg', {
                  key: display.tick,
                  className: 'q-dot',
                  style: dotStyle,
                  viewBox: '0 0 24 24',
                }, react.createElement('circle', { cx: 12, cy: 12, r: 5.5, fill: 'currentColor' })),
                chars.map(function (ch, i) {
                  return react.createElement(RollDigit, {
                    key: i,
                    char: ch,
                    prevChar: prevChars[i] !== undefined ? prevChars[i] : null,
                    dir: display.dir,
                  })
                }),
                react.createElement('span', { className: 'q-roll-cell q-static' }, '¥'),
              ),
              react.createElement('span', {
                className: 'q-phase',
                style: {
                  color: peakNow ? 'var(--dsw-alias-state-warning-primary, #ffaa3c)' : 'var(--dsw-alias-state-success-primary)',
                },
              }, peakNow ? '高峰' : '空闲'),
              react.createElement('button', {
                type: 'button',
                className: 'q-refresh' + (refreshing ? ' q-spin' : ''),
                onClick: doRefresh,
                'aria-label': '刷新余额',
              },
                react.createElement('svg', {
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
                ),
              ),
              showPop && popStyle !== null ? react.createElement(ChartPanel, { now: now, style: popStyle, onEnter: onPopEnter, onLeave: onPopLeave }) : null,
            )
          },
        )
      })
    }

    exports.apply = apply
    return module.exports
  },
})
