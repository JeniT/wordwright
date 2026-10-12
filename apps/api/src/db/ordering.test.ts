import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { renumber, reorder } from './ordering'

let db: DatabaseSync
const scope = { sql: 'list_id = ?', args: ['a'] }
const order = (list = 'a') =>
  (
    db.prepare('SELECT id FROM item WHERE list_id = ? ORDER BY position').all(list) as {
      id: string
    }[]
  ).map((r) => r.id)

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE item (id TEXT PRIMARY KEY, list_id TEXT, position INTEGER)')
  const insert = db.prepare('INSERT INTO item VALUES (?, ?, ?)')
  ;['x', 'y', 'z'].forEach((id, i) => insert.run(id, 'a', i))
  insert.run('other', 'b', 0)
})

describe('reorder', () => {
  it('puts the list in the given order, leaving other lists alone', () => {
    expect(reorder(db, 'item', scope, ['x', 'y', 'z'], ['z', 'x', 'y'])).toBe(true)
    expect(order()).toEqual(['z', 'x', 'y'])
    expect(order('b')).toEqual(['other'])
  })

  it.each([
    ['one missing', ['x', 'y']],
    ['an extra one', ['x', 'y', 'z', 'w']],
    ['a repeat', ['x', 'x', 'z']],
    ['a stranger in place of one', ['x', 'y', 'w']],
  ])('changes nothing when the ids have %s', (_, ids) => {
    expect(reorder(db, 'item', scope, ['x', 'y', 'z'], ids)).toBe(false)
    expect(order()).toEqual(['x', 'y', 'z'])
  })
})

describe('renumber', () => {
  it('gives each row the place it has in the array', () => {
    renumber(db, 'item', scope, ['y', 'z', 'x'])
    expect(order()).toEqual(['y', 'z', 'x'])
  })
})
