import { describe, expect, it } from 'vitest'
import {
  lastInvitationToken,
  PASSWORD,
  register,
  setup,
  sharePublication,
  verifyAccounts,
} from './test-helpers'

const put = (c: ReturnType<ReturnType<typeof setup>['client']>, name: unknown) =>
  c.put('/api/account/name', { name })

describe('changing your name', () => {
  it('changes it, trimmed, and answers with the updated account', async () => {
    const { client } = setup()
    const c = client()
    await register(c, 'ada@example.com', 'Ada')
    const res = await put(c, '  Ada King ')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Ada King', email: 'ada@example.com' })
    expect((await (await c.get('/api/auth/me')).json()).name).toBe('Ada King')
  })

  it('leaves the username, email and publications alone', async () => {
    const { client } = setup()
    const c = client()
    const before = await register(c, 'ada@example.com', 'Ada')
    const publication = (await (await c.get('/api/publications')).json())[0]
    await put(c, 'Someone Else')
    const me = await (await c.get('/api/auth/me')).json()
    expect(me).toMatchObject({ handle: before.handle, email: before.email, id: before.id })
    expect((await (await c.get('/api/publications')).json())[0].id).toBe(publication.id)
  })

  it('applies the same rules as sign-up, explaining them in plain words', async () => {
    const { client } = setup()
    const c = client()
    await register(c, 'ada@example.com', 'Ada')
    const message = async (name: unknown) => (await (await put(c, name)).json()).error
    expect(await message('   ')).toBe('Enter a name')
    expect(await message('')).toBe('Enter a name')
    expect(await message('x'.repeat(101))).toBe('Use 100 characters or fewer for the name')
    expect((await put(c, 'x'.repeat(100))).status).toBe(200)
    expect((await (await c.get('/api/auth/me')).json()).name).toBe('x'.repeat(100))
  })

  it('needs sign-in', async () => {
    expect((await put(setup().client(), 'Whoever')).status).toBe(401)
  })

  it('shows the new name to the other people in a publication, and in invitations already sent', async () => {
    const ctx = setup()
    const ada = ctx.client()
    const bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob', PASSWORD, 'bobby')
    verifyAccounts(ctx, 'ada@example.com')
    const publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    const members = async () =>
      (
        (await (await bob.get(`/api/publications/${publication}`)).json()).members as {
          name: string
        }[]
      )
        .map((m) => m.name)
        .sort()
    expect(await members()).toEqual(['Ada', 'Bob'])

    // An invitation that is still waiting names its sender as they are called now.
    await ada.post(`/api/publications/${publication}/invitations`, { email: 'eve@example.com' })
    const token = lastInvitationToken(ctx.mailer)
    const sender = async () =>
      (await (await ctx.client().post('/api/invitations/preview', { token })).json()).inviterName
    expect(await sender()).toBe('Ada')

    await put(ada, 'Ada King')
    expect(await members()).toEqual(['Ada King', 'Bob'])
    expect(await sender()).toBe('Ada King')
  })
})
