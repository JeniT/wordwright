import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  llmSettings,
  renderAt,
  server,
  signedInAs,
  sourcesList,
  testUser,
  useMockServer,
} from '../test-utils'

useMockServer()
// jsdom cannot type into the rich-text editor; its own tests are in DescriptionEditor.test.ts.
vi.mock('../components/DescriptionEditor.vue', () => import('../testing/description-editor-stub'))
// The landing page asks whether a key is saved; these tests are about publications.
// jsdom decodes no pictures; the picture field asks the browser for a picture's size, so say they are small ones.
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close: () => {} }))
  server.use(llmSettings(true), sourcesList())
})
afterEach(() => vi.unstubAllGlobals())

const owner = {
  userId: 'u1',
  name: 'Ada Lovelace',
  handle: 'ada',
  email: 'ada@example.com',
  role: 'owner',
}
const member = {
  userId: 'u2',
  name: 'Bob',
  handle: 'bob',
  email: 'bob@example.com',
  role: 'member',
}

const substack = {
  id: 'adalovelace-substack',
  name: 'Substack',
  siteUrl: 'https://ada.substack.com/about',
  imageUrl: '/api/publications/adalovelace-substack/image?v=1',
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [owner],
}
const blog = {
  id: 'adalovelace-blog',
  name: 'Blog',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [owner, member],
}

const listPublications = (publications: unknown[]) =>
  http.get('*/api/publications', () => HttpResponse.json(publications))

const noIdeas = http.get('*/api/publications/:id/ideas', () => HttpResponse.json([]))

describe('publication list (home)', () => {
  it('shows each publication with its picture, website and sharing', async () => {
    server.use(signedInAs(testUser), listPublications([substack, blog]))
    await renderAt('/')
    const main = within(await screen.findByRole('main'))
    await main.findByRole('heading', { name: 'Your publications' })

    const cards = await main.findAllByRole('listitem')
    expect(cards).toHaveLength(2)
    const first = within(cards[0]!)
    expect(first.getByRole('link')).toHaveAttribute('href', '/p/adalovelace-substack')
    expect(first.getByText('ada.substack.com')).toBeInTheDocument() // host only, no "https://"
    expect(cards[0]!.querySelector('img')).toHaveAttribute('src', substack.imageUrl)

    const second = within(cards[1]!)
    expect(second.getByText('Shared with 1 person')).toBeInTheDocument()
    expect(cards[1]!.querySelector('img')).toBeNull() // placeholder tile instead
    expect(second.getByText('B')).toBeInTheDocument()
  })

  it('links to the create page', async () => {
    server.use(signedInAs(testUser), listPublications([substack]))
    await renderAt('/')
    expect(await screen.findByRole('link', { name: 'New publication' })).toHaveAttribute(
      'href',
      '/publications/new',
    )
  })

  it('explains what a publication is when there are none', async () => {
    server.use(signedInAs(testUser), listPublications([]))
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Create your first publication' })
    expect(screen.getByRole('link', { name: 'New publication' })).toHaveAttribute(
      'href',
      '/publications/new',
    )
  })

  it('says what went wrong and lets you try again', async () => {
    let attempts = 0
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () =>
        ++attempts === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json([substack]),
      ),
    )
    await renderAt('/')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your publications")
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Substack/ })
  })
})

describe('new publication', () => {
  it('creates the publication and opens it', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(substack, { status: 201 })
      }),
    )
    const { router } = await renderAt('/publications/new')
    await fireEvent.update(
      await screen.findByLabelText('Publication name'),
      "Ada's Weekly Letters!",
    )
    await fireEvent.update(screen.getByLabelText(/Website/), ' ada.substack.com ')
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/adalovelace-substack'))
    expect(sent).toEqual({ name: "Ada's Weekly Letters!", siteUrl: 'ada.substack.com' })
  })

  it('leaves the website out when it is blank', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(blog, { status: 201 })
      }),
    )
    await renderAt('/publications/new')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Blog')
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))
    await waitFor(() => expect(sent).toEqual({ name: 'Blog', siteUrl: null }))
  })

  it('uploads the chosen picture after creating the publication', async () => {
    let uploaded: Blob | undefined
    let uploadedType: string | null = null
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications', () => HttpResponse.json(substack, { status: 201 })),
      http.put('*/api/publications/adalovelace-substack/image', async ({ request }) => {
        uploadedType = request.headers.get('content-type')
        uploaded = await request.blob()
        return HttpResponse.json(substack)
      }),
    )
    const { router } = await renderAt('/publications/new')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Substack')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/adalovelace-substack'))
    expect(uploadedType).toBe('image/png')
    expect(uploaded?.size).toBe(3)
  })

  it('rejects a file that is not a supported image before sending anything', async () => {
    server.use(signedInAs(testUser), listPublications([]), noIdeas)
    await renderAt('/publications/new')
    const input = await screen.findByLabelText(/Picture/)
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
    await fireEvent.change(input, { target: { files: [svg] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG, WebP or GIF')
  })

  it('explains why a publication could not be created', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications', () =>
        HttpResponse.json(
          { error: 'Enter a web address, like https://example.com' },
          { status: 400 },
        ),
      ),
    )
    const { router } = await renderAt('/publications/new')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Blog')
    await fireEvent.update(screen.getByLabelText(/Website/), 'javascript:1')
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a web address')
    expect(router.currentRoute.value.path).toBe('/publications/new')
  })

  it('keeps the publication it made if only the picture fails, rather than making a second one', async () => {
    let creates = 0
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications', () => {
        creates++
        return HttpResponse.json(substack, { status: 201 })
      }),
      http.put('*/api/publications/adalovelace-substack/image', () =>
        HttpResponse.json(
          { error: 'That image is too large. Choose one under 1 MB.' },
          { status: 413 },
        ),
      ),
    )
    await renderAt('/publications/new')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Substack')
    const file = new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Your publication was created, but we couldn’t upload its picture',
    )
    expect(alert).toHaveTextContent('too large')
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))
    await screen.findByRole('alert')
    expect(creates).toBe(1)
  })
})

describe('the website icon on the new publication form (#224)', () => {
  const iconUrl = 'data:image/png;base64,AAAA'
  const setUp = (answer: () => Response | Promise<Response>) => {
    const asked: string[] = []
    server.use(
      signedInAs(testUser),
      listPublications([]),
      noIdeas,
      http.post('*/api/publications/site-icon-preview', async ({ request }) => {
        asked.push(((await request.json()) as { siteUrl: string }).siteUrl)
        return answer()
      }),
    )
    return asked
  }
  const shown = () => document.querySelector('img[src^="data:"]')

  it('shows the icon when the person leaves the website field, before anything is saved', async () => {
    const asked = setUp(() => HttpResponse.json({ iconUrl, square: false }))
    await renderAt('/publications/new')
    const website = await screen.findByLabelText(/Website/)
    await fireEvent.update(website, 'ada.substack.com')
    expect(asked).toEqual([]) // not while typing
    await fireEvent.focusOut(website)
    await waitFor(() => expect(shown()).toHaveAttribute('src', iconUrl))
    expect(asked).toEqual(['ada.substack.com'])
    // Leaving again without changing it asks nothing more.
    await fireEvent.focusOut(website)
    expect(asked).toHaveLength(1)
  })

  it('stays quiet when there is no icon or the look fails, and drops it when the address is cleared', async () => {
    const answers = [
      () => HttpResponse.json({ iconUrl: null, square: false }),
      () => HttpResponse.json({ error: 'nope' }, { status: 429 }),
      () => HttpResponse.json({ iconUrl, square: true }),
    ]
    setUp(() => answers.shift()!())
    await renderAt('/publications/new')
    const website = await screen.findByLabelText(/Website/)
    await fireEvent.update(website, 'one.example')
    await fireEvent.focusOut(website)
    await fireEvent.update(website, 'two.example')
    await fireEvent.focusOut(website)
    await new Promise((r) => setTimeout(r, 50))
    expect(shown()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()

    await fireEvent.update(website, 'three.example')
    await fireEvent.focusOut(website)
    await waitFor(() => expect(shown()).not.toBeNull())
    await fireEvent.update(website, '')
    await fireEvent.focusOut(website)
    await waitFor(() => expect(shown()).toBeNull())
  })

  it('never lets a slow answer for an earlier address replace the current one', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    setUp(async () => {
      if (++calls === 1) {
        await gate
        return HttpResponse.json({ iconUrl: 'data:image/png;base64,OLD', square: false })
      }
      return HttpResponse.json({ iconUrl: 'data:image/png;base64,NEW', square: false })
    })
    await renderAt('/publications/new')
    const website = await screen.findByLabelText(/Website/)
    await fireEvent.update(website, 'old.example')
    await fireEvent.focusOut(website)
    await fireEvent.update(website, 'new.example')
    await fireEvent.focusOut(website)
    await waitFor(() => expect(shown()).toHaveAttribute('src', 'data:image/png;base64,NEW'))
    release()
    await new Promise((r) => setTimeout(r, 50))
    expect(shown()).toHaveAttribute('src', 'data:image/png;base64,NEW')
  })

  it('lets a picture the writer chooses win over the icon', async () => {
    setUp(() => HttpResponse.json({ iconUrl, square: false }))
    URL.createObjectURL = () => 'blob:own'
    await renderAt('/publications/new')
    const website = await screen.findByLabelText(/Website/)
    await fireEvent.update(website, 'ada.substack.com')
    await fireEvent.focusOut(website)
    await waitFor(() => expect(shown()).not.toBeNull())
    const file = new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await waitFor(() => expect(shown()).toBeNull())
  })
})

describe('publication page', () => {
  it('shows the publication and links out to its website', async () => {
    server.use(signedInAs(testUser), listPublications([substack]), noIdeas)
    await renderAt('/p/adalovelace-substack')
    // The publication's name, website and settings are in the side menu, which says whose publication this is.
    const menu = within(await screen.findByRole('banner'))
    await menu.findByRole('link', { name: 'Publication settings' })
    const site = menu.getByRole('link', { name: /Website/ })
    expect(site).toHaveAttribute('href', 'https://ada.substack.com/about')
    expect(site).toHaveAttribute('rel', 'noopener noreferrer')
    expect(menu.getByRole('link', { name: 'Publication settings' })).toHaveAttribute(
      'href',
      '/p/adalovelace-substack/settings',
    )
  })

  it('has no website link when the publication has none', async () => {
    server.use(signedInAs(testUser), listPublications([blog]), noIdeas)
    await renderAt('/p/adalovelace-blog')
    await screen.findByText(/No ideas yet/)
    expect(screen.queryByRole('link', { name: /substack|blog\./i })).toBeNull()
  })

  it('says so when the publication does not exist or is not yours', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.get('*/api/publications/someone-else', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
      http.get('*/api/publications/someone-else/ideas', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt('/p/someone-else')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't find that publication")
    expect(screen.getByRole('link', { name: 'Back to your publications' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

describe('publication description', () => {
  it('lets the owner write it, and shows it saved', async () => {
    const bodies: unknown[] = []
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.put('*/api/publications/adalovelace-substack/description', async ({ request }) => {
        const body = (await request.json()) as { description: string }
        bodies.push(body)
        return HttpResponse.json({ ...substack, description: body.description })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings/description')
    const field = await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.getByRole('button', { name: 'Save description' })).toBeEnabled()
    await fireEvent.update(field, 'Weeknotes, *mostly for me*. See [home](https://example.com).')
    await fireEvent.click(screen.getByRole('button', { name: 'Save description' }))
    await screen.findByText('Saved')
    expect(bodies).toEqual([
      { description: 'Weeknotes, *mostly for me*. See [home](https://example.com).' },
    ])
  })

  it('lets a member write it too, and says why when saving fails', async () => {
    const shared = { ...substack, role: 'member', members: [owner, { ...member, userId: 'u1' }] }
    server.use(
      signedInAs(testUser),
      listPublications([shared]),
      http.put('*/api/publications/adalovelace-substack/description', () =>
        HttpResponse.json({ error: 'Keep the description under 5000 characters' }, { status: 400 }),
      ),
    )
    await renderAt('/p/adalovelace-substack/settings/description')
    await fireEvent.update(await screen.findByRole('textbox', { name: 'Description' }), 'Hello')
    await fireEvent.click(screen.getByRole('button', { name: 'Save description' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep the description under 5000')
  })

  it('starts from the saved description', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([{ ...substack, description: 'A newsletter for gardeners' }]),
    )
    await renderAt('/p/adalovelace-substack/settings/description')
    expect(await screen.findByRole('textbox', { name: 'Description' })).toHaveValue(
      'A newsletter for gardeners',
    )
  })
})

describe('publication settings', () => {
  it('shows the icon of a changed website before saving it (#224)', async () => {
    let asked = 0
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.post('*/api/publications/site-icon-preview', () => {
        asked++
        return HttpResponse.json({ iconUrl: 'data:image/png;base64,AAAA', square: false })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings/details')
    const website = await screen.findByLabelText(/Website/)
    // The saved address is not looked up again: its icon is already shown under Picture.
    await fireEvent.focusOut(website)
    expect(asked).toBe(0)
    await fireEvent.update(website, 'https://other.example')
    await fireEvent.focusOut(website)
    expect(await screen.findByText('Icon found for this address')).toBeInTheDocument()
    expect(asked).toBe(1)
  })

  it('lets the owner change the name and website, showing the address as stored', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.patch('*/api/publications/adalovelace-substack', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          ...substack,
          name: 'Renamed',
          siteUrl: 'https://new.example.com',
        })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings/details')
    await screen.findByRole('heading', { name: 'Details' })
    await fireEvent.update(screen.getByLabelText('Publication name'), 'Renamed')
    await fireEvent.update(screen.getByLabelText(/Website/), 'new.example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByText('Saved')
    expect(sent).toEqual({ name: 'Renamed', siteUrl: 'new.example.com' })
    expect(screen.getByLabelText(/Website/)).toHaveValue('https://new.example.com')
  })

  it('clears the website when the field is emptied, and shows why a change was refused', async () => {
    const bodies: unknown[] = []
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.patch('*/api/publications/adalovelace-substack', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json(
              { error: 'Enter a web address, like https://example.com' },
              { status: 400 },
            )
          : HttpResponse.json({ ...substack, siteUrl: null })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings/details')
    const website = await screen.findByLabelText(/Website/)
    await fireEvent.update(website, 'javascript:1')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a web address')

    await fireEvent.update(website, '   ')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(bodies[1]).toEqual({ name: 'Substack', siteUrl: null }))
  })

  it('uploads and removes the picture', async () => {
    let removed = false
    let uploads = 0
    server.use(
      signedInAs(testUser),
      listPublications([substack]),
      http.put('*/api/publications/adalovelace-substack/image', () => {
        uploads++
        return HttpResponse.json(substack)
      }),
      http.delete('*/api/publications/adalovelace-substack/image', () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings/details')
    const file = new File([new Uint8Array([1])], 'cover.webp', { type: 'image/webp' })
    await fireEvent.change(await screen.findByLabelText('Choose a picture'), {
      target: { files: [file] },
    })
    await waitFor(() => expect(uploads).toBe(1))
    const removePicture = screen.getByRole('button', { name: 'Remove picture' })
    await fireEvent.click(removePicture) // no hold: it only asks to be pressed again
    await fireEvent.click(removePicture)
    await waitFor(() => expect(removed).toBe(true))
  })

  it('shows what the server said when the picture is refused', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([blog]),
      http.put('*/api/publications/adalovelace-blog/image', () =>
        HttpResponse.json(
          { error: 'That file is not a PNG, JPEG, WebP or GIF image. Choose a different one.' },
          { status: 415 },
        ),
      ),
    )
    await renderAt('/p/adalovelace-blog/settings/details')
    const file = new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(await screen.findByLabelText('Choose a picture'), {
      target: { files: [file] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('not a PNG, JPEG, WebP or GIF')
  })

  it('lets the owner list members and invite people (invitation flow is in invitations.test.ts)', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([blog]),
      http.get('*/api/publications/adalovelace-blog/invitations', () => HttpResponse.json([])),
    )
    await renderAt('/p/adalovelace-blog/settings/sharing')
    const row = (await screen.findByText(/Bob/)).closest('li')!
    expect(row).toHaveTextContent('(bob)')
    expect(within(row).getByText('member')).toHaveClass('chip')
    expect(row).not.toHaveTextContent('bob@example.com')
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument()
  })

  it('deletes the publication after confirmation and returns to the list', async () => {
    let deleted = false
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json(deleted ? [] : [blog])),
      http.delete('*/api/publications/adalovelace-blog', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings/delete')
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete publication' }))
    expect(deleted).toBe(false) // a dialog asks first
    const dialog = screen.getByRole('dialog', { name: 'Delete this publication?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete publication' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
    await screen.findByRole('heading', { name: 'Create your first publication' })
  })

  it('gives a member a read-only view and a way to leave', async () => {
    let left = false
    const bob = { ...owner, userId: 'u2', name: 'Bob', handle: 'bob', email: 'bob@example.com' }
    const me = { ...owner, role: 'member' }
    const shared = { ...blog, role: 'member', members: [bob, me] }
    server.use(
      signedInAs(testUser),
      listPublications([shared]),
      http.delete('*/api/publications/adalovelace-blog/members/u1', () => {
        left = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings/details')
    // Nothing on Details is a member's to change, so they are sent to the first page that is theirs.
    await screen.findByRole('heading', { level: 1, name: 'Description' })
    expect(router.currentRoute.value.path).toBe('/p/adalovelace-blog/settings/description')
    expect(screen.queryByLabelText('Publication name')).toBeNull()
    expect(screen.queryByLabelText('Choose a picture')).toBeNull()
    await router.push('/p/adalovelace-blog/settings/sharing')
    await screen.findByRole('heading', { level: 1, name: 'Sharing' })
    expect(screen.queryByLabelText('Email address')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(left).toBe(false) // it asks first
    const dialog = await screen.findByRole('dialog', { name: /^Leave / })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(left).toBe(true))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })
})

describe('the pages of publication settings', () => {
  it('uses the same name and website fields as a new publication, with what renaming does', async () => {
    server.use(signedInAs(testUser), listPublications([substack]))
    await renderAt('/p/adalovelace-substack/settings/details')
    const settingsLabels = [
      (await screen.findByLabelText('Publication name')).id,
      screen.getByLabelText('Website (optional)').id,
    ]
    expect(settingsLabels).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'About the website' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'About the name' })).toBeInTheDocument()
    expect(screen.getByText('Where it gets published.')).toBeInTheDocument()
    expect(screen.queryByText(/for example https/i)).toBeNull()
  })

  it('titles each page, with the settings as the small link above', async () => {
    server.use(signedInAs(testUser), listPublications([substack]))
    await renderAt('/p/adalovelace-substack/settings/sharing')
    await screen.findByRole('heading', { level: 1, name: 'Sharing' })
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Publication settings' })).toHaveAttribute(
      'href',
      '/p/adalovelace-substack/settings/details',
    )
    expect(main.getByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument()
  })

  it('keeps Delete on its own page, pointing to Download first', async () => {
    server.use(signedInAs(testUser), listPublications([substack]))
    await renderAt('/p/adalovelace-substack/settings/delete')
    await screen.findByRole('heading', { level: 1, name: 'Delete publication' })
    expect(screen.getByRole('link', { name: 'Download your writing' })).toHaveAttribute(
      'href',
      '/p/adalovelace-substack/settings/download',
    )
    expect(screen.queryByLabelText('Publication name')).toBeNull()
  })
})

describe('renamed publications', () => {
  const renamed = { ...blog, id: 'adalovelace-journal', name: 'Journal' }

  it('moves an old address to the current one, keeping the page and query', async () => {
    server.use(
      signedInAs(testUser),
      listPublications([renamed]),
      // The server answers an old id with a redirect, which fetch follows to the publication itself.
      http.get('*/api/publications/adalovelace-blog', () => HttpResponse.json(renamed)),
      noIdeas,
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings/details?from=email')
    await waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/p/adalovelace-journal/settings/details?from=email',
      ),
    )
    await screen.findByRole('heading', { name: 'Details' })
  })

  it('moves to the new address after renaming on the settings page', async () => {
    let current = blog
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([current])),
      http.patch('*/api/publications/adalovelace-blog', () => {
        current = renamed
        return HttpResponse.json(renamed)
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings/details')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Journal')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe('/p/adalovelace-journal/settings/details'),
    )
    await screen.findByRole('heading', { name: 'Details' })
    expect(await screen.findByText('Saved')).toBeInTheDocument() // the panel was kept, not rebuilt
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
