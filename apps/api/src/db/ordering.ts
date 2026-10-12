import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

/** Which rows of a table form one ordered list: a condition on its columns and the values it needs. */
export interface ListScope {
  sql: string
  args: SQLInputValue[]
}

/**
 * Lists people can put in order (an idea's drafts and notes, a profile's feeds) keep each row's place in a `position`
 * column. This is the one place that writes it. Call these inside a transaction: they make several writes.
 */

/** Gives each row in `ids` the place it has in the array. */
export function renumber(db: DatabaseSync, table: string, scope: ListScope, ids: string[]) {
  const update = db.prepare(`UPDATE ${table} SET position = ? WHERE ${scope.sql} AND id = ?`)
  ids.forEach((id, position) => update.run(position, ...scope.args, id))
}

/**
 * Puts the list in the given order. Returns false, changing nothing, unless `ids` names exactly the rows that are
 * there now (`current`), so a stale screen can't silently drop or resurrect any.
 */
export function reorder(
  db: DatabaseSync,
  table: string,
  scope: ListScope,
  current: string[],
  ids: string[],
): boolean {
  if (ids.length !== current.length || new Set(ids).size !== ids.length) return false
  const known = new Set(current)
  if (!ids.every((id) => known.has(id))) return false
  renumber(db, table, scope, ids)
  return true
}
