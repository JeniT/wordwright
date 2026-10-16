const KEY = 'wordwright:last-publication'

/** The publication the person last worked in, for Home's quick add to start from. Storage can be blocked or empty. */
export function lastPublicationId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function rememberPublication(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // A convenience only: quick add falls back to another publication.
  }
}
