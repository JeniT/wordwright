/**
 * Who a reading item or a note belongs to: an idea (its id), or a whole profile (`{ profileId }`, for those
 * gathered before there is an idea). Both tables carry `profile_id` and a nullable `idea_id`, so this is the one
 * place that says how an owner is matched.
 */
export type Owner = string | { profileId: string }

/** A SQL condition (and its values) that picks out what `owner` owns. `alias` prefixes the columns. */
export function owned(owner: Owner, alias = ''): { sql: string; args: string[] } {
  const p = alias ? `${alias}.` : ''
  return typeof owner === 'string'
    ? { sql: `${p}idea_id = ?`, args: [owner] }
    : { sql: `(${p}profile_id = ? AND ${p}idea_id IS NULL)`, args: [owner.profileId] }
}
