import type { Email, Mailer } from './mailer'

/**
 * Sends an email after the HTTP response has already been decided. Waiting would make "this address
 * has an account / is already a member" observable (slower reply, or an error if the mail server is
 * down). Failures are logged with `context` and the error only, never the message, since it holds
 * a live link.
 */
export function sendInBackground(
  mailer: Mailer,
  logger: Pick<Console, 'error'>,
  context: string,
  email: Email,
) {
  void mailer.send(email).catch((err: unknown) => {
    logger.error(
      `Failed to send ${context}: ${err instanceof Error ? err.message : 'unknown error'}`,
    )
  })
}
