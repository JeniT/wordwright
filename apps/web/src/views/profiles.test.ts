import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
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
// The landing page asks whether a key is saved; these tests are about profiles.
beforeEach(() => server.use(llmSettings(true), sourcesList()))

const owner = { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }
const editor = { userId: 'u2', name: 'Bob', email: 'bob@example.com', role: 'editor' }

const substack = {
  id: 'adalovelace-substack',
  name: 'Substack',
  siteUrl: 'https://ada.substack.com/about',
  imageUrl: '/api/profiles/adalovelace-substack/image?v=1',
  description: null,
  descriptionOrigin: 'entered',
  descriptionConfirmed: true,
  descriptionSources: [],
  role: 'owner',
  members: [owner],
}
const blog = {
  id: 'adalovelace-blog',
  name: 'Blog',
  siteUrl: null,
  imageUrl: null,
  description: null,
  descriptionOrigin: 'entered',
  descriptionConfirmed: true,
  descriptionSources: [],
  role: 'owner',
  members: [owner, editor],
}

const listProfiles = (profiles: unknown[]) =>
  http.get('*/api/profiles', () => HttpResponse.json(profiles))

const noIdeas = http.get('*/api/profiles/:id/ideas', () => HttpResponse.json([]))

describe('profile list (home)', () => {
  it('shows each profile with its picture, website and sharing', async () => {
    server.use(signedInAs(testUser), listProfiles([substack, blog]))
    await renderAt('/')
    const main = within(await screen.findByRole('main'))
    await main.findByRole('heading', { name: 'Your profiles' })

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
    server.use(signedInAs(testUser), listProfiles([substack]))
    await renderAt('/')
    expect(await screen.findByRole('link', { name: 'New profile' })).toHaveAttribute(
      'href',
      '/profiles/new',
    )
  })

  it('explains what a profile is when there are none', async () => {
    server.use(signedInAs(testUser), listProfiles([]))
    await renderAt('/')
    await screen.findByText('Next, create your first profile')
    expect(screen.getByRole('link', { name: 'Create your first profile' })).toHaveAttribute(
      'href',
      '/profiles/new',
    )
  })

  it('says what went wrong and lets you try again', async () => {
    let attempts = 0
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () =>
        ++attempts === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json([substack]),
      ),
    )
    await renderAt('/')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your profiles")
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Substack/ })
  })
})

describe('new profile', () => {
  it('previews the address, then creates the profile and opens it', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listProfiles([]),
      noIdeas,
      http.post('*/api/profiles', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(substack, { status: 201 })
      }),
    )
    const { router } = await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), "Ada's Weekly Letters!")
    expect(screen.getByText('/p/adalovelace-adas-weekly-letters')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText(/Website/), ' ada.substack.com ')
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/adalovelace-substack'))
    expect(sent).toEqual({ name: "Ada's Weekly Letters!", siteUrl: 'ada.substack.com' })
  })

  it('leaves the website out when it is blank', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listProfiles([]),
      noIdeas,
      http.post('*/api/profiles', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(blog, { status: 201 })
      }),
    )
    await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Blog')
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    await waitFor(() => expect(sent).toEqual({ name: 'Blog', siteUrl: null }))
  })

  it('uploads the chosen picture after creating the profile', async () => {
    let uploaded: Blob | undefined
    let uploadedType: string | null = null
    server.use(
      signedInAs(testUser),
      listProfiles([]),
      noIdeas,
      http.post('*/api/profiles', () => HttpResponse.json(substack, { status: 201 })),
      http.put('*/api/profiles/adalovelace-substack/image', async ({ request }) => {
        uploadedType = request.headers.get('content-type')
        uploaded = await request.blob()
        return HttpResponse.json(substack)
      }),
    )
    const { router } = await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Substack')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/adalovelace-substack'))
    expect(uploadedType).toBe('image/png')
    expect(uploaded?.size).toBe(3)
  })

  it('rejects a file that is not a supported image before sending anything', async () => {
    server.use(signedInAs(testUser), listProfiles([]), noIdeas)
    await renderAt('/profiles/new')
    const input = await screen.findByLabelText(/Picture/)
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
    await fireEvent.change(input, { target: { files: [svg] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG, WebP or GIF')
  })

  it('explains why a profile could not be created', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles([]),
      noIdeas,
      http.post('*/api/profiles', () =>
        HttpResponse.json(
          { error: 'Enter a web address, like https://example.com' },
          { status: 400 },
        ),
      ),
    )
    const { router } = await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Blog')
    await fireEvent.update(screen.getByLabelText(/Website/), 'javascript:1')
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a web address')
    expect(router.currentRoute.value.path).toBe('/profiles/new')
  })

  it('keeps the profile it made if only the picture fails, rather than making a second one', async () => {
    let creates = 0
    server.use(
      signedInAs(testUser),
      listProfiles([]),
      noIdeas,
      http.post('*/api/profiles', () => {
        creates++
        return HttpResponse.json(substack, { status: 201 })
      }),
      http.put('*/api/profiles/adalovelace-substack/image', () =>
        HttpResponse.json(
          { error: 'That image is too large. Choose one under 1 MB.' },
          { status: 413 },
        ),
      ),
    )
    await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Substack')
    const file = new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your profile was created, but its picture')
    expect(alert).toHaveTextContent('too large')
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    await screen.findByRole('alert')
    expect(creates).toBe(1)
  })
})

describe('profile page', () => {
  it('shows the profile and links out to its website', async () => {
    server.use(signedInAs(testUser), listProfiles([substack]), noIdeas)
    await renderAt('/p/adalovelace-substack')
    // The profile's name, website and settings are in the side menu, which says whose profile this is.
    const menu = within(await screen.findByRole('banner'))
    await menu.findByRole('link', { name: 'Profile settings' })
    const site = menu.getByRole('link', { name: /ada\.substack\.com/ })
    expect(site).toHaveAttribute('href', 'https://ada.substack.com/about')
    expect(site).toHaveAttribute('rel', 'noopener noreferrer')
    expect(menu.getByRole('link', { name: 'Profile settings' })).toHaveAttribute(
      'href',
      '/p/adalovelace-substack/settings',
    )
  })

  it('has no website link when the profile has none', async () => {
    server.use(signedInAs(testUser), listProfiles([blog]), noIdeas)
    await renderAt('/p/adalovelace-blog')
    await screen.findByText(/No ideas yet/)
    expect(screen.queryByRole('link', { name: /substack|blog\./i })).toBeNull()
  })

  it('says so when the profile does not exist or is not yours', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles([substack]),
      http.get('*/api/profiles/someone-else', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
      http.get('*/api/profiles/someone-else/ideas', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt('/p/someone-else')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't find that profile")
    expect(screen.getByRole('link', { name: 'Back to your profiles' })).toHaveAttribute('href', '/')
  })
})

describe('profile description', () => {
  it('lets the owner write it in Markdown, previews it, and shows it saved', async () => {
    const bodies: unknown[] = []
    server.use(
      signedInAs(testUser),
      listProfiles([substack]),
      http.put('*/api/profiles/adalovelace-substack/description', async ({ request }) => {
        const body = (await request.json()) as { description: string }
        bodies.push(body)
        return HttpResponse.json({ ...substack, description: body.description })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings')
    const field = await screen.findByLabelText('About this venue')
    expect(screen.getByRole('button', { name: 'Save description' })).toBeDisabled()
    await fireEvent.update(field, 'Weeknotes, *mostly for me*. See [home](https://example.com).')
    await fireEvent.click(screen.getByText('Preview'))
    expect(screen.getByRole('link', { name: 'home' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Save description' }))
    await screen.findByText('Saved')
    expect(bodies).toEqual([
      { description: 'Weeknotes, *mostly for me*. See [home](https://example.com).' },
    ])
  })

  it('lets an editor write it too, and says why when saving fails', async () => {
    const shared = { ...substack, role: 'editor', members: [owner, { ...editor, userId: 'u1' }] }
    server.use(
      signedInAs(testUser),
      listProfiles([shared]),
      http.put('*/api/profiles/adalovelace-substack/description', () =>
        HttpResponse.json({ error: 'Keep the description under 5000 characters' }, { status: 400 }),
      ),
    )
    await renderAt('/p/adalovelace-substack/settings')
    await fireEvent.update(await screen.findByLabelText('About this venue'), 'Hello')
    await fireEvent.click(screen.getByRole('button', { name: 'Save description' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep the description under 5000')
  })

  it('starts from the saved description', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles([{ ...substack, description: 'A newsletter for gardeners' }]),
    )
    await renderAt('/p/adalovelace-substack/settings')
    expect(await screen.findByLabelText('About this venue')).toHaveValue(
      'A newsletter for gardeners',
    )
  })
})

describe('profile settings', () => {
  it('lets the owner change the name and website, showing the address as stored', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listProfiles([substack]),
      http.patch('*/api/profiles/adalovelace-substack', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          ...substack,
          name: 'Renamed',
          siteUrl: 'https://new.example.com',
        })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings')
    expect(await screen.findByText('/p/adalovelace-substack')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Name'), 'Renamed')
    await fireEvent.update(screen.getByLabelText('Website'), 'new.example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByText('Saved')
    expect(sent).toEqual({ name: 'Renamed', siteUrl: 'new.example.com' })
    expect(screen.getByLabelText('Website')).toHaveValue('https://new.example.com')
  })

  it('clears the website when the field is emptied, and shows why a change was refused', async () => {
    const bodies: unknown[] = []
    server.use(
      signedInAs(testUser),
      listProfiles([substack]),
      http.patch('*/api/profiles/adalovelace-substack', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json(
              { error: 'Enter a web address, like https://example.com' },
              { status: 400 },
            )
          : HttpResponse.json({ ...substack, siteUrl: null })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings')
    const website = await screen.findByLabelText('Website')
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
      listProfiles([substack]),
      http.put('*/api/profiles/adalovelace-substack/image', () => {
        uploads++
        return HttpResponse.json(substack)
      }),
      http.delete('*/api/profiles/adalovelace-substack/image', () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt('/p/adalovelace-substack/settings')
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
      listProfiles([blog]),
      http.put('*/api/profiles/adalovelace-blog/image', () =>
        HttpResponse.json(
          { error: 'That file is not a PNG, JPEG, WebP or GIF image. Choose a different one.' },
          { status: 415 },
        ),
      ),
    )
    await renderAt('/p/adalovelace-blog/settings')
    const file = new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    await fireEvent.change(await screen.findByLabelText('Choose a picture'), {
      target: { files: [file] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('not a PNG, JPEG, WebP or GIF')
  })

  it('lets the owner list members and invite people (invitation flow is in invitations.test.ts)', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles([blog]),
      http.get('*/api/profiles/adalovelace-blog/invitations', () => HttpResponse.json([])),
    )
    await renderAt('/p/adalovelace-blog/settings')
    await screen.findByText(/bob@example.com, editor/)
    expect(screen.getByLabelText(/Invite someone to/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument()
  })

  it('deletes the profile after confirmation and returns to the list', async () => {
    let deleted = false
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json(deleted ? [] : [blog])),
      http.delete('*/api/profiles/adalovelace-blog', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete this profile' }))
    expect(deleted).toBe(false) // a dialog asks first
    const dialog = screen.getByRole('dialog', { name: 'Delete this profile?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete it' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
    await screen.findByText('Next, create your first profile')
  })

  it('gives an editor a read-only view and a way to leave', async () => {
    let left = false
    const bob = { ...owner, userId: 'u2', name: 'Bob', email: 'bob@example.com' }
    const me = { ...owner, role: 'editor' }
    const shared = { ...blog, role: 'editor', members: [bob, me] }
    server.use(
      signedInAs(testUser),
      listProfiles([shared]),
      http.delete('*/api/profiles/adalovelace-blog/members/u1', () => {
        left = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings')
    await screen.findByRole('heading', { name: 'Profile settings' })
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByLabelText('Choose a picture')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete this profile' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(left).toBe(true))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })
})

describe('renamed profiles', () => {
  const renamed = { ...blog, id: 'adalovelace-journal', name: 'Journal' }

  it('moves an old address to the current one, keeping the page and query', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles([renamed]),
      // The server answers an old id with a redirect, which fetch follows to the profile itself.
      http.get('*/api/profiles/adalovelace-blog', () => HttpResponse.json(renamed)),
      noIdeas,
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings?from=email')
    await waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/p/adalovelace-journal/settings?from=email'),
    )
    expect(await screen.findByText('/p/adalovelace-journal')).toBeInTheDocument()
  })

  it('moves to the new address after renaming on the settings page', async () => {
    let current = blog
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([current])),
      http.patch('*/api/profiles/adalovelace-blog', () => {
        current = renamed
        return HttpResponse.json(renamed)
      }),
    )
    const { router } = await renderAt('/p/adalovelace-blog/settings')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Journal')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe('/p/adalovelace-journal/settings'),
    )
    expect(await screen.findByText('/p/adalovelace-journal')).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument() // the panel was kept, not rebuilt
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
