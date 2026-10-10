import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import type { Terminal } from './options'

/** A terminal that asks the person at the keyboard. Only for an interactive run. */
export function realTerminal(): Terminal {
  return {
    ask(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      return new Promise((resolve) =>
        rl.question(question, (answer) => {
          rl.close()
          resolve(answer)
        }),
      )
    },
    askSecret(question) {
      process.stdout.write(question)
      // Output goes nowhere, so what is typed is not shown.
      const mute = new Writable({ write: (_chunk, _encoding, done) => done() })
      const rl = createInterface({ input: process.stdin, output: mute, terminal: true })
      return new Promise((resolve) =>
        rl.question('', (answer) => {
          rl.close()
          process.stdout.write('\n')
          resolve(answer)
        }),
      )
    },
  }
}
