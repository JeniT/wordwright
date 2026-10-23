import { describe, expect, it } from 'vitest'
import { setup } from './test-helpers'

describe('GET /ready', () => {
  it('says ready when the database is open and migrated, and /health says ok', async () => {
    const { client: newClient } = setup()
    const client = newClient()
    const ready = await client.request('GET', '/ready')
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: 'ready' })
    expect((await client.request('GET', '/health')).status).toBe(200)
  })

  it('answers 503 when the database is not usable, while /health still says ok', async () => {
    const { client: newClient, db } = setup()
    const client = newClient()
    db.close()
    const ready = await client.request('GET', '/ready')
    expect(ready.status).toBe(503)
    expect((await client.request('GET', '/health')).status).toBe(200)
  })
})
