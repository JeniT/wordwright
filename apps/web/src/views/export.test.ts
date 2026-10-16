import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt, server, signedInAs, sourcesList, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = (role: 'owner' | 'member') => ({
  id: 'p1',
  name: "Ada's writing",
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role,
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role }],
})

const zipReply = (filename: string) =>
  new HttpResponse(new Uint8Array([0x50, 0x4b, 5, 6]), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })

/** jsdom can't save files: record the name the page asks the browser to save under. */
const saved: string[] = []
beforeEach(() => {
  saved.length = 0
  URL.createObjectURL = vi.fn(() => 'blob:export')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download)
  })
})
afterEach(() => vi.restoreAllMocks())

describe('downloading your writing', () => {
  it('from the account page: shows it working, saves the file the server names, and says so', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication('owner')])),
      http.get('*/api/account/export', async () => {
        await delay(50)
        return zipReply('wordwright-export-2026-10-14.zip')
      }),
    )
    await renderAt('/account/download')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Download your writing' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/as an owner you get every draft/i)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Download as a zip' }))
    expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled()
    await waitFor(() => expect(saved).toEqual(['wordwright-export-2026-10-14.zip']))
    expect(await screen.findByText('Downloaded')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Download as a zip' })).toBeEnabled()
  })

  it('is mentioned beside deleting the account, with a link to it', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
    )
    await renderAt('/account/delete')
    const link = await screen.findByRole('link', { name: /download your writing first/i })
    expect(link.getAttribute('href')).toBe('/account/download')
  })

  it('explains in words why it could not be made, and lets you try again', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication('owner')])),
      http.get('*/api/account/export', () =>
        HttpResponse.json(
          { error: 'You have downloaded a lot of exports. Try again in a little while.' },
          { status: 429 },
        ),
      ),
    )
    await renderAt('/account/download')
    await fireEvent.click(await screen.findByRole('button', { name: 'Download as a zip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Try again in a little while/)
    expect(saved).toEqual([])
    expect(screen.getByRole('button', { name: 'Download as a zip' })).toBeEnabled()
  })

  it("from a publication's settings: says what a member gets, and downloads just that publication", async () => {
    server.use(
      signedInAs(testUser),
      sourcesList(),
      http.get('*/api/publications', () => HttpResponse.json([publication('member')])),
      http.get('*/api/publications/p1/export', () => zipReply('wordwright-p1-2026-10-14.zip')),
    )
    await renderAt('/p/p1/settings')
    expect(
      await screen.findByRole('heading', { name: 'Download your writing' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/drafts you edit or started/i)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Download as a zip' }))
    await waitFor(() => expect(saved).toEqual(['wordwright-p1-2026-10-14.zip']))
  })

  it('tells an owner they get every draft in the publication', async () => {
    server.use(
      signedInAs(testUser),
      sourcesList(),
      http.get('*/api/publications', () => HttpResponse.json([publication('owner')])),
    )
    await renderAt('/p/p1/settings')
    await screen.findByRole('heading', { name: 'Download your writing' })
    expect(screen.getByText(/every draft in this publication/i)).toBeInTheDocument()
  })
})
