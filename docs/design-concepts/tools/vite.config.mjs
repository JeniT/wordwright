// Serves the concepts with the same Tailwind v4 pipeline the app uses (borrowing apps/web's install).
//   pnpm --filter @lfwa/web exec vite --config ../../docs/design-concepts/tools/vite.config.mjs
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../../apps/web/package.json'))
const tailwindcss = require('@tailwindcss/vite').default ?? require('@tailwindcss/vite')

export default {
  root: join(here, '..'),
  plugins: [tailwindcss()],
  server: { port: 5199, strictPort: true, fs: { strict: false } },
}
