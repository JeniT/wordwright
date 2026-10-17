import { FakeFeedFetcher, SQUARE_PNG, TINY_PNG } from '@wordwright/core'
import { describe, expect, it } from 'vitest'
import { backfillIconShapes } from './icon-backfill'
import { register, setup } from '../test-helpers'

describe('backfillIconShapes (#226)', () => {
  it('records the shape of icons stored before it was, once', async () => {
    const ctx = setup({ feeds: new FakeFeedFetcher({}) })
    const user = ctx.client()
    await register(user)
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const { store } = ctx
    // An icon as stored before the column existed: no shape recorded.
    store.publications.setSiteIcon(publication, { contentType: 'image/png', data: SQUARE_PNG })
    expect(store.publications.unshapedSiteIcons()).toHaveLength(1)
    expect((await (await user.get(`/api/publications/${publication}`)).json()).siteIconSquare).toBe(
      false,
    )

    expect(await backfillIconShapes(store)).toBe(1)
    expect((await (await user.get(`/api/publications/${publication}`)).json()).siteIconSquare).toBe(
      true,
    )
    expect(await backfillIconShapes(store)).toBe(0)

    store.publications.setSiteIcon(publication, { contentType: 'image/png', data: TINY_PNG })
    await backfillIconShapes(store)
    expect((await (await user.get(`/api/publications/${publication}`)).json()).siteIconSquare).toBe(
      false,
    )
  })
})
