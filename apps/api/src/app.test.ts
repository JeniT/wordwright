import { beforeEach, describe, expect, it } from 'vitest'
import { FakeLLMProvider, type Draft } from '@lfwa/core'
import { createApp } from './app'
import { SqliteDraftRepository } from './db/drafts'

function setup(apiToken?: string) {
  const llm = new FakeLLMProvider(() => 'Needs a stronger opening.')
  const app = createApp({
    drafts: new SqliteDraftRepository(':memory:'),
    providers: { llm, search: [] },
    apiToken,
  })
  const json = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { app, llm, json }
}

describe('drafts API', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('reports health', async () => {
    expect(await (await ctx.json('GET', '/health')).json()).toEqual({ status: 'ok' })
  })

  it('creates, reads, updates, lists and deletes a draft', async () => {
    const created = await ctx.json('POST', '/api/drafts', { title: 'Hello', body: 'World' })
    expect(created.status).toBe(201)
    const draft = (await created.json()) as Draft
    expect(draft).toMatchObject({ title: 'Hello', body: 'World' })

    const updated = await ctx.json('PUT', `/api/drafts/${draft.id}`, { title: 'Hi', body: 'There' })
    expect(await updated.json()).toMatchObject({ id: draft.id, title: 'Hi', body: 'There' })

    expect(await (await ctx.json('GET', '/api/drafts')).json()).toHaveLength(1)
    expect((await ctx.json('DELETE', `/api/drafts/${draft.id}`)).status).toBe(204)
    expect((await ctx.json('GET', `/api/drafts/${draft.id}`)).status).toBe(404)
  })

  it('rejects invalid input', async () => {
    const res = await ctx.json('POST', '/api/drafts', { title: 42 })
    expect(res.status).toBe(400)
  })
})

describe('assist API', () => {
  it('critiques a draft via the LLM provider', async () => {
    const { json, llm } = setup()
    const draft = (await (
      await json('POST', '/api/drafts', { title: 'T', body: 'B' })
    ).json()) as Draft
    const res = await json('POST', '/api/assist/critique', { draftId: draft.id })
    expect(await res.json()).toEqual({ text: 'Needs a stronger opening.' })
    expect(llm.calls[0]?.messages[0]?.content).toContain('B')
  })

  it('404s for an unknown draft', async () => {
    const { json } = setup()
    expect((await json('POST', '/api/assist/critique', { draftId: 'nope' })).status).toBe(404)
  })
})

describe('auth', () => {
  it('requires the bearer token when configured', async () => {
    const { json } = setup('secret')
    expect((await json('GET', '/api/drafts')).status).toBe(401)
    expect(
      (await json('GET', '/api/drafts', undefined, { authorization: 'Bearer secret' })).status,
    ).toBe(200)
    expect((await json('GET', '/health')).status).toBe(200)
  })
})
