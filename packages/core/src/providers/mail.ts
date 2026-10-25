export interface Email {
  to: string
  subject: string
  /** Always provided: the version every mail client can show. */
  text: string
  html?: string
}

/**
 * Port for outbound email. Adapters (console, file, SMTP) live in `apps/api` because they need Node;
 * `MemoryMailer` is the fake.
 */
export interface Mailer {
  send(email: Email): Promise<void>
}

/** Sending failed. The message never includes the email's contents or any credentials. */
export class MailError extends Error {}

/** Tests: keeps sent emails in memory. */
export class MemoryMailer implements Mailer {
  readonly outbox: Email[] = []
  async send(email: Email) {
    this.outbox.push(email)
  }
}
