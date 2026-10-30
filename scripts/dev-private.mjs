// `pnpm dev:private`: your own API and web server on free ports, with the settings that make a local app usable in
// a browser (fake LLM, open sign-up, API origin matching the web port). Use it instead of `pnpm dev` when other
// sessions may hold 5173 and 8787. Stop it with Ctrl-C, or `kill $(lsof -nP -iTCP:<port> -sTCP:LISTEN -t)`.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

/** The environment for each server, given the two ports. */
export function devPrivateEnv(webPort, apiPort) {
  return {
    api: {
      PORT: String(apiPort),
      PUBLIC_URL: `http://localhost:${webPort}`,
      FAKE_LLM: 'true',
      ACCOUNT_APPROVAL: 'open',
    },
    web: { API_URL: `http://localhost:${apiPort}` },
  }
}

/** A port nothing is listening on right now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function main() {
  const [webPort, apiPort] = [await freePort(), await freePort()]
  const env = devPrivateEnv(webPort, apiPort)
  const run = (args, extra) =>
    spawn('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...extra } })
  const children = [
    run(['--filter', '@wordwright/api', 'dev'], env.api),
    run(
      ['--filter', '@wordwright/web', 'exec', 'vite', '--port', String(webPort), '--strictPort'],
      env.web,
    ),
  ]
  console.log(
    `\nOpen http://localhost:${webPort} (API on ${apiPort}; sign-up is open, the LLM is fake)\n`,
  )
  const stop = () => children.forEach((child) => child.kill('SIGTERM'))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  children.forEach((child) => child.on('exit', stop))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
