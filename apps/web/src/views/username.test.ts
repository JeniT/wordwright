import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noPublications = http.get('*/api/publications', () => HttpResponse.json([]))

/** Answers the availability check from `taken`, and remembers what the save was sent. */
function fakeUsernames(taken: string[] = ['bobby']) {
  const state = { saved: [] as string[] }
  server.use(
    http.get('*/api/auth/handle-available', ({ request }) => {
      const handle = new URL(request.url).searchParams.get('handle')!.toLowerCase()
      return HttpResponse.json({ available: !taken.includes(handle) })
    }),
    http.put('*/api/account/handle', async ({ request }) => {
      const { handle } = (await request.json()) as { handle: string }
      state.saved.push(handle)
      return HttpResponse.json({ ...testUser, handle: handle.toLowerCase(), handleChosen: true })
    }),
  )
  return state
}

describe('username on the account page', () => {
  it('explains what it is for, checks the new one as it is typed, and saves it', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    const fake = fakeUsernames()
    await renderAt('/account')
    expect(await screen.findByText(/Your username is/)).toHaveTextContent('adalovelace')
    expect(
      screen.getByText(/Publications you already have keep their addresses/),
    ).toBeInTheDocument()

    const field = screen.getByLabelText('New username')
    const save = screen.getByRole('button', { name: 'Change username' })
    expect(save).toBeDisabled()

    await fireEvent.update(field, 'bobby')
    expect(await screen.findByText('That username is already taken. Try another.')).toBeVisible()
    expect(save).toBeDisabled()

    await fireEvent.update(field, 'Lovelace')
    expect(await screen.findByText('“lovelace” is available.')).toBeVisible()
    await fireEvent.click(save)
    await waitFor(() => expect(fake.saved).toEqual(['Lovelace']))
    expect(await screen.findByText(/Your username is now/)).toHaveTextContent('lovelace')
  })

  it('explains a badly formed or reserved username, and will not save it', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    fakeUsernames()
    await renderAt('/account')
    const field = await screen.findByLabelText('New username')
    await fireEvent.update(field, 'has space')
    expect(await screen.findByText('Use only letters and numbers in your username')).toBeVisible()
    await fireEvent.update(field, 'admin')
    expect(await screen.findByText('That username is reserved. Try another.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Change username' })).toBeDisabled()
  })

  it('will not offer the username they already have as a change', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    fakeUsernames()
    await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText('New username'), 'AdaLovelace')
    expect(await screen.findByText('That is your current username.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Change username' })).toBeDisabled()
  })

  it("shows the server's reason when saving fails", async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    fakeUsernames([])
    server.use(
      http.put('*/api/account/handle', () =>
        HttpResponse.json(
          { error: 'You have changed your username several times today.' },
          {
            status: 429,
          },
        ),
      ),
    )
    await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText('New username'), 'lovelace')
    await fireEvent.click(await screen.findByRole('button', { name: 'Change username' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed your username several')
  })
})

describe('the one-time prompt for a generated username', () => {
  const generated = { ...testUser, handle: 'adal', handleChosen: false }

  it('asks on the landing page, and lets them pick their own', async () => {
    server.use(signedInAs(generated), noPublications, llmSettings(true))
    const fake = fakeUsernames()
    await renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Choose your username' })).toBeVisible()
    expect(screen.getByText(/We gave you/)).toHaveTextContent('adal')
    await fireEvent.update(screen.getByLabelText('Username'), 'ada')
    await fireEvent.click(await screen.findByRole('button', { name: 'Use this username' }))
    await waitFor(() => expect(fake.saved).toEqual(['ada']))
    // Answered, so it goes away.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Choose your username' })).toBeNull(),
    )
  })

  it('lets them keep the one they were given', async () => {
    server.use(signedInAs(generated), noPublications, llmSettings(true))
    const fake = fakeUsernames()
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('button', { name: 'Keep adal' }))
    await waitFor(() => expect(fake.saved).toEqual(['adal']))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Choose your username' })).toBeNull(),
    )
  })

  it('does not ask people who chose their username', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Your publications' })
    expect(screen.queryByRole('heading', { name: 'Choose your username' })).toBeNull()
  })
})
