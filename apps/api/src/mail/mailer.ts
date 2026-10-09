export interface Email {
  to: string
  subject: string
  /** Always provided: the version every mail client can show. */
  text: string
  html?: string
}

/** Port for outbound email. Adapters: console, file (dev/e2e), memory (unit tests), SMTP. */
export interface Mailer {
  send(email: Email): Promise<void>
}

/** Sending failed. The message never includes the email's contents or any credentials. */
export class MailError extends Error {}

/** Development default: prints the email (including links) to the server log. No setup needed. */
export class ConsoleMailer implements Mailer {
  async send(email: Email) {
    console.log(
      `\n──── email (not sent: MAIL_TRANSPORT=console) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n─────────────────────────────────────────────────\n`,
    )
  }
}

/** Tests: keeps sent emails in memory. */
export class MemoryMailer implements Mailer {
  readonly outbox: Email[] = []
  async send(email: Email) {
    this.outbox.push(email)
  }
}
