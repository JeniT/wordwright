import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Email, Mailer } from '@wordwright/core'

/**
 * Writes each email as a JSON file in a directory instead of sending it. Handy for local
 * development (open the newest file to find the link) and for end-to-end tests, which read
 * the file as a user would read their inbox.
 */
export class FileMailer implements Mailer {
  private counter = 0

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  async send(email: Email) {
    const name = `${Date.now()}-${String(this.counter++).padStart(4, '0')}.json`
    writeFileSync(join(this.dir, name), JSON.stringify(email, null, 2))
  }
}
