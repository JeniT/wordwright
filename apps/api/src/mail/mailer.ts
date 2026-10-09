export interface Email {
  to: string
  subject: string
  text: string
}

/** Port for outbound email. Add an SMTP / Resend / SES adapter for production. */
export interface Mailer {
  send(email: Email): Promise<void>
}

/** Development: prints the email (including reset links) to the server log. */
export class ConsoleMailer implements Mailer {
  async send(email: Email) {
    console.log(`\n--- email to ${email.to} ---\n${email.subject}\n\n${email.text}\n---\n`)
  }
}

/** Tests: keeps sent emails in memory. */
export class MemoryMailer implements Mailer {
  readonly outbox: Email[] = []
  async send(email: Email) {
    this.outbox.push(email)
  }
}
