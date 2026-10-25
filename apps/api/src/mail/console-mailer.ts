import type { Email, Mailer } from '@wordwright/core'

/**
 * Development default: prints the email (including links) to the server log. No setup needed.
 *
 * Not run under `mailerContract`: it delivers nothing, and prints only the text version (the HTML is for
 * mail clients, and the link a developer needs is in the text). Its own test checks the link is printed.
 */
export class ConsoleMailer implements Mailer {
  async send(email: Email) {
    console.log(
      `\n──── email (not sent: MAIL_TRANSPORT=console) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n─────────────────────────────────────────────────\n`,
    )
  }
}
