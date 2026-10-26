import { describe, expect, it } from 'vitest'
import {
  allRows,
  PASSWORD,
  register,
  setup,
  sharePublication,
  verifyAccounts,
} from './test-helpers'

describe('taking back a kept name (#411)', () => {
  it('counts, then clears, a name kept at deletion, so the work reads "a former member"', async () => {
    const ctx = setup()
    const ada = ctx.client()
    const bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    const publication = (await (await ada.post('/api/publications', { name: 'Shared' })).json()).id
    const idea = (
      await (await ada.post(`/api/publications/${publication}/ideas`, { name: 'An idea' })).json()
    ).id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    const notes = `/api/publications/${publication}/ideas/${idea}/notes`
    await bob.post(notes, { text: 'Bob wrote this' })
    await bob.delete('/api/account', { password: PASSWORD }) // keeps the name by default
    const authorNames = async () =>
      ((await (await ada.get(notes)).json()) as { authorName: string | null }[]).map(
        (n) => n.authorName,
      )
    expect(await authorNames()).toEqual(['Bob'])

    expect(ctx.store.users.countKeptName('Bob')).toMatchObject({ 'idea_notes.kept_name': 1 })
    expect(ctx.store.users.countKeptName('Someone else')).toMatchObject({
      'idea_notes.kept_name': 0,
    })

    expect(ctx.store.users.forgetKeptName('Bob')).toBe(1)
    expect(await authorNames()).toEqual([null])
    expect(JSON.stringify(allRows(ctx))).not.toContain('"Bob"')
    expect(ctx.store.users.forgetKeptName('Bob')).toBe(0)
  })
})
