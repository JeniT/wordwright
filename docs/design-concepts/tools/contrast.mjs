// Checks every token pair in tokens.mjs against WCAG 2.2 AA. Usage: node tools/contrast.mjs
import { PAIRS, ratio, themes } from './tokens.mjs'

let failures = 0
for (const [id, theme] of Object.entries(themes)) {
  for (const [mode, tokens] of Object.entries(theme.modes)) {
    for (const [fg, bg, min, what] of PAIRS) {
      const r = ratio(tokens[fg], tokens[bg])
      const ok = r >= min
      if (!ok) failures++
      if (!ok || process.argv.includes('--all'))
        console.log(
          `${ok ? 'ok  ' : 'FAIL'} ${id}/${mode} ${fg} on ${bg}: ${r.toFixed(2)} (needs ${min}) ${what}`,
        )
    }
  }
}
console.log(failures ? `${failures} failing pair(s)` : 'All token pairs pass.')
process.exitCode = failures ? 1 : 0
