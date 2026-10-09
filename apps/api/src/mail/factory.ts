import { ConsoleMailer, type Mailer } from './mailer'
import { FileMailer } from './file-mailer'
import { SmtpMailer } from './smtp-mailer'

export interface MailConfig {
  MAIL_TRANSPORT: 'console' | 'file' | 'smtp'
  MAIL_FROM: string
  SMTP_URL: string
  MAIL_OUTBOX_DIR: string
}

/** Picks the mail adapter from configuration. The default needs no setup at all. */
export function createMailer(config: MailConfig): Mailer {
  switch (config.MAIL_TRANSPORT) {
    case 'console':
      return new ConsoleMailer()
    case 'file':
      return new FileMailer(config.MAIL_OUTBOX_DIR)
    case 'smtp':
      return new SmtpMailer({ url: config.SMTP_URL, from: config.MAIL_FROM })
  }
}
