import { screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

describe('help: finding feeds', () => {
  it('is listed in the help pages and opens', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help')
    const list = await screen.findByRole('list', { name: 'Help pages' })
    expect(within(list).getByRole('link', { name: 'Finding feeds' })).toHaveAttribute(
      'href',
      '/help/feeds',
    )
  })

  it('has the steps, one link to Feedspot that opens in a new tab, and what to do if it fails', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help/feeds')
    expect(await screen.findByRole('heading', { level: 1, name: 'Finding feeds' })).toBeVisible()
    expect(document.querySelectorAll('ol > li')).toHaveLength(4)
    const feedspot = screen.getByRole('link', { name: /Feedspot/ })
    expect(feedspot).toHaveAttribute('href', 'https://www.feedspot.com/')
    expect(feedspot).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('heading', { level: 2, name: 'If it doesn’t work' })).toBeVisible()
  })
})
