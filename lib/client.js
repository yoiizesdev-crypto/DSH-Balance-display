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
      slots.inject('sidebar.footer.action', function () {
        return slots.register(
          { name: 'sidebar.footer.action', id: 'cordis-panel', order: 0 },
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
              return ctx.interval(fetchBalance, 5000)
            }, [fetchBalance])

            var doRefresh = function () {
              if (refreshing) return
              setRefreshing(true)
              fetchBalanceJson().then(function (data) {
                if (data !== null && typeof data === 'object' && typeof data.balance === 'number') applyBalance(data.balance)
              }).catch(function () {}).finally(function () { setRefreshing(false) })
            }

            var chars = display.text.split('')
            var prevChars = display.prevText === null ? [] : display.prevText.split('')
            var dotStyle = display.tick > 0 ? {
              '--q-flash': FLASH_COLORS[display.flash] || FLASH_COLORS.silver,
              '--q-silver': '#d5dae2',
              '--q-idle': 'var(--dsw-alias-label-tertiary)',
              animation: 'q-dot-flash 1s ease',
            } : {
              '--q-idle': 'var(--dsw-alias-label-tertiary)',
            }

            return react.createElement('div', { className: 'q-wrap' },
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
            )
          },
        )
      })
    }

    exports.apply = apply
    return module.exports
  },
})
