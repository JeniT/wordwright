import { createTransport, type Transporter } from 'nodemailer'
import { MailError, type Email, type Mailer } from './mailer'

export interface SmtpMailerOptions {
  /** e.g. `smtps://user:pass@smtp.example.com:465` or `smtp://localhost:1025` (Mailpit). */
  url: string
  from: string
}

/**
 * Provider-neutral delivery over SMTP: works with Resend, Postmark, SES, Mailgun, Gmail relays,
 * a company server, or a local catcher such as Mailpit.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(private readonly options: SmtpMailerOptions) {
    this.transport = createTransport({
      url: options.url,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }

  async send(email: Email) {
    try {
      await this.transport.sendMail({
        from: this.options.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
    } catch (err) {
      throw new MailError(describe(err))
    }
  }

  /** Checks we can connect and authenticate, without sending anything. */
  async verify() {
    try {
      await this.transport.verify()
    } catch (err) {
      throw new MailError(describe(err))
    }
  }
}

/** A safe summary of a transport failure: error code and SMTP status, never the URL or message content. */
function describe(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; command?: string }
  const parts = [
    e.code && `code ${e.code}`,
    e.responseCode && `SMTP ${e.responseCode}`,
    e.command && `during ${e.command}`,
  ].filter(Boolean)
  return `Email could not be sent${parts.length ? ` (${parts.join(', ')})` : ''}`
}
