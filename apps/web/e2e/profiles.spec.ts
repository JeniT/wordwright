import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, holdToConfirm, showArrowsFor, test } from './fixtures'

const PASSWORD = 'a perfectly good password'

// A real 1x1 PNG, so the browser actually decodes what we upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function registerUser(page: Page, name: string) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(name.toLowerCase()) // so profile addresses start with it
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
}

/** A different name each time, because usernames are shared between parallel tests. */
const uniqueName = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

const noViolations = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

test('creates a profile with a website and picture, and opens its page', async ({ page }) => {
  const person = uniqueName('Pat')
  await registerUser(page, person)
  const handle = person.toLowerCase()

  await page.getByRole('link', { name: 'New profile' }).click()
  await expect(page.getByRole('heading', { name: 'New profile' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('My Substack')
  // The shareable address is previewed as you type.
  await expect(page.getByText(`/p/${handle}-my-substack`)).toBeVisible()
  await page.getByLabel(/Website/).fill('pat.substack.com')
  await page
    .getByLabel(/Picture/)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await noViolations(page)
  await page.getByRole('button', { name: 'Create profile' }).click()

  // Lands on the profile page at its readable address.
  await expect(page).toHaveURL(new RegExp(`/p/${handle}-my-substack$`))
  await expect(
    page.getByRole('banner').getByText('My Substack').filter({ visible: true }).first(),
  ).toBeVisible()
  // In the menu, and beside the title on the profile's own page.
  const site = page.getByRole('link', { name: /pat\.substack\.com/ }).first()
  await expect(site).toHaveAttribute('href', 'https://pat.substack.com')
  const image = page.getByRole('banner').locator('img')
  await expect(image).toBeVisible()
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await noViolations(page)

  // And it appears on the list.
  await page.getByRole('link', { name: 'Wordwright' }).click()
  const card = page.getByRole('main').getByRole('link', { name: /My Substack/ })
  await expect(card).toContainText('pat.substack.com')
  await expect(card.locator('img')).toBeVisible()
})

test('edits details, changes and removes the picture, and deletes the profile', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Quinn'))
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Draft venue')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(
    page.getByRole('banner').getByText('Draft venue').filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('banner').locator('img')).toHaveCount(0) // monogram placeholder

  await page.getByRole('link', { name: 'Profile settings' }).click()
  await noViolations(page)
  await page.getByLabel('Name', { exact: true }).fill('Final venue')
  await page.getByLabel('Website').fill('not a url')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a web address')
  await page.getByLabel('Website').fill('final.example.com')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await expect(page.getByLabel('Website')).toHaveValue('https://final.example.com')

  // A non-image is refused with a reason; a real one is accepted.
  await page.getByLabel('Choose a picture').setInputFiles({
    name: 'notes.txt',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText('not a PNG, JPEG, WebP or GIF')
  await page
    .getByLabel('Choose a picture')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('main').locator('img')).toBeVisible()
  await holdToConfirm(page, page.getByRole('button', { name: 'Remove picture' }))
  await expect(page.getByRole('main').locator('img')).toHaveCount(0)

  await page.getByRole('button', { name: 'Delete this profile' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /Final venue/ })).toHaveCount(0)
})

test('renaming a profile changes its address, and the old address still works', async ({
  page,
}) => {
  const who = uniqueName('Reese')
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Early name')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(
    page.getByRole('banner').getByText('Early name').filter({ visible: true }).first(),
  ).toBeVisible()
  const oldPath = new URL(page.url()).pathname
  expect(oldPath).toMatch(/^\/p\/[a-z0-9]+-early-name$/)

  await page.getByRole('link', { name: 'Profile settings' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Later name')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  const newPath = oldPath.replace('early-name', 'later-name')
  await expect(page).toHaveURL(`${newPath}/settings`)
  await expect(page.getByText(newPath, { exact: true })).toBeVisible()

  // Bookmarks and shared links to the old address end up at the new one.
  await page.goto(oldPath)
  await expect(page).toHaveURL(newPath)
  await expect(
    page.getByRole('banner').getByText('Later name').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.goto(`${oldPath}/settings`)
  await expect(page).toHaveURL(`${newPath}/settings`)

  // The server itself answers the old API address with a permanent redirect.
  const res = await page.request.get(`/api/profiles/${oldPath.slice(3)}`, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(res.headers()['location']).toBe(`/api/profiles/${newPath.slice(3)}`)
})

test('changes the display name, which is then used wherever it is shown', async ({ page }) => {
  const who = uniqueName('Remy')
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Remy venue')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(
    page.getByRole('banner').getByText('Remy venue').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Profile settings' }).click()
  const member = (name: string) =>
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: `${name} (` })
  await expect(member(who)).toBeVisible()

  await page.getByRole('link', { name: who, exact: true }).click()
  const section = page.getByRole('region', { name: 'Your name' })
  const field = section.getByLabel('What should we call you?')
  const change = section.getByRole('button', { name: 'Change name' })
  await expect(field).toHaveValue(who)
  await expect(change).toBeDisabled()
  await noViolations(page)

  await field.fill('')
  await expect(change).toBeDisabled()
  await field.fill(`${who} Reed`)
  await change.click()
  await expect(section.getByRole('status')).toContainText(`${who} Reed`)
  await noViolations(page)

  // The header follows at once, and so does the list of people in the profile, with no other step.
  await expect(page.getByRole('link', { name: `${who} Reed`, exact: true })).toBeVisible()
  await page.reload()
  await expect(field).toHaveValue(`${who} Reed`)
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await page
    .getByRole('main')
    .getByRole('link', { name: /Remy venue/ })
    .click()
  await page.getByRole('link', { name: 'Profile settings' }).click()
  await expect(member(`${who} Reed`)).toBeVisible()
})

test('changes the username: existing profiles keep their address, new ones use it', async ({
  page,
  browser,
}) => {
  const who = uniqueName('Quinn')
  const before = who.toLowerCase()
  const after = uniqueName('writer').toLowerCase()
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('First venue')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page).toHaveURL(`/p/${before}-first-venue`)

  await page.getByRole('link', { name: who, exact: true }).click()
  const section = page.getByRole('region', { name: 'Username' })
  await expect(section).toContainText(`Your username is ${before}`)
  await section.getByLabel('New username').fill('Not Valid!')
  await expect(section.getByText('Use only letters and numbers in your username')).toBeVisible()
  await section.getByLabel('New username').fill('admin')
  await expect(section.getByText('That username is reserved. Try another.')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Change username' })).toBeDisabled()
  await section.getByLabel('New username').fill(after)
  await expect(section.getByText(`“${after}” is available.`)).toBeVisible()
  await noViolations(page)
  await section.getByRole('button', { name: 'Change username' }).click()
  await expect(section).toContainText(`Your username is now ${after}`)

  // The profile made earlier keeps its address; a new one starts with the new username.
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(page.getByRole('main').getByRole('link', { name: /First venue/ })).toHaveAttribute(
    'href',
    `/p/${before}-first-venue`,
  )
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Second venue')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page).toHaveURL(`/p/${after}-second-venue`)

  // The old username is kept for them: nobody else can take it.
  const other = await (await browser.newContext()).newPage()
  await other.goto('/register')
  await other.getByLabel('Username').fill(before)
  await expect(other.getByText('That username is already taken. Try another.')).toBeVisible()
})

test('two people can each have a profile called "Substack", with different addresses', async ({
  page,
  browser,
}) => {
  const ada = uniqueName('Ada')
  const bob = uniqueName('Bob')
  await registerUser(page, ada)
  const bobPage = await (await browser.newContext()).newPage()
  await registerUser(bobPage, bob)

  for (const [p, who] of [
    [page, ada],
    [bobPage, bob],
  ] as const) {
    await p.getByRole('link', { name: 'New profile' }).click()
    await p.getByLabel('Name', { exact: true }).fill('Substack')
    await p.getByRole('button', { name: 'Create profile' }).click()
    await expect(p).toHaveURL(new RegExp(`/p/${who.toLowerCase()}-substack$`))
  }

  // One person's profile address doesn't open for the other.
  await bobPage.goto(`/p/${ada.toLowerCase()}-substack`)
  await expect(bobPage.getByRole('alert')).toContainText("couldn't find that profile")
  await noViolations(bobPage)
})

test('profile pages for a signed-in user have no detectable accessibility violations', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Sam'))
  await noViolations(page) // the list, with the API key set-up and the first-profile prompt
  await page.getByRole('link', { name: 'Create your first profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Sam writing')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await noViolations(page) // the profile page
})

test('manages the ordered list of feeds on the Search page', async ({ page }) => {
  await registerUser(page, uniqueName('Tess'))
  await page.getByRole('link', { name: 'Create your first profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Reading list')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await goTo(page, 'Search')

  const sources = page.getByRole('region', { name: 'Feeds' })
  await expect(sources.getByText('No sources yet')).toBeVisible()
  const add = async (address: string) => {
    await sources.getByLabel('Add a feed').fill(address)
    await sources.getByRole('button', { name: 'Add source' }).click()
  }

  // Bad addresses are explained; good ones are read, named and added at the end.
  await add('not a feed')
  await expect(sources.getByRole('alert')).toContainText('web address of a feed')
  await add('nothing.example/notafeed')
  await expect(sources.getByRole('alert')).toContainText('RSS or Atom')
  for (const feed of ['one.example/feed', 'two.example/rss', 'three.example/atom']) {
    await add(feed)
    await expect(
      sources.getByRole('listitem').filter({ hasText: `Feed of ${feed.split('/')[0]}` }),
    ).toBeVisible()
  }
  await add('https://two.example/rss')
  await expect(sources.getByRole('alert')).toContainText('already in your list')

  // Each shows what the feed said about itself, and its picture.
  const first = sources.getByRole('listitem').first()
  await expect(first).toContainText('Posts from one.example')
  await expect(first).toContainText('one.example/feed')
  const icon = first.locator('img')
  await expect(icon).toBeVisible()
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await noViolations(page)

  const hosts = async () =>
    (await sources.getByRole('listitem').allInnerTexts()).map((t) => t.match(/\w+\.example/)![0])
  expect(await hosts()).toEqual(['one.example', 'two.example', 'three.example'])

  // Each move is saved; the next step waits for the saves to be answered, because the list draws again when one is,
  // and that must not happen in the middle of a drag, or while the slow-server route below is being set up.
  let saving = 0
  const isSave = (r: { method(): string; url(): string }) =>
    r.method() === 'PUT' && r.url().includes('/sources/order')
  page.on('request', (r) => isSave(r) && saving++)
  page.on('requestfinished', (r) => isSave(r) && saving--)
  page.on('requestfailed', (r) => isSave(r) && saving--)
  const savesAnswered = async () => {
    await expect.poll(() => saving).toBe(0)
    await page.waitForLoadState('networkidle')
  }

  // Reordering works from the keyboard and keeps focus on the moved source.
  const up = sources.getByRole('button', { name: 'Move Feed of three.example up' })
  await expect(up).toHaveCount(0) // the arrows appear when a feed's grip is pressed
  await showArrowsFor(sources, 'Reorder Feed of three.example')
  await up.focus()
  await page.keyboard.press('Enter')
  await expect.poll(hosts).toEqual(['one.example', 'three.example', 'two.example'])
  await expect(up).toBeFocused() // still on the source that moved, so Enter can move it again
  await page.keyboard.press('Enter')
  await expect.poll(hosts).toEqual(['three.example', 'one.example', 'two.example'])

  await savesAnswered()

  // ...and by dragging a source by its grip (with the list in view: the page above it is long, and a drag
  // that has to scroll partway through is not what is being tested).
  await sources.getByRole('listitem').first().scrollIntoViewIfNeeded()
  await sources
    .getByRole('listitem')
    .nth(2)
    .getByTestId('rail')
    .dragTo(sources.getByRole('listitem').first(), {
      sourcePosition: { x: 3, y: 3 },
      targetPosition: { x: 40, y: 3 },
    })
  await expect.poll(hosts).toEqual(['two.example', 'three.example', 'one.example'])
  await savesAnswered()

  // A move shows at once, even when the server is slow to save it. The server is held (`release` lets it answer)
  // rather than slowed by a timer, and only the saves that pass through the route are counted: an earlier save
  // (the drag above) may still be answering, and must not be mistaken for one of these.
  let asked = 0
  let saved = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/sources/order', async (route) => {
    asked++
    await held
    const response = await route.fetch()
    await route.fulfill({ response })
    saved++
  })
  await showArrowsFor(sources, 'Reorder Feed of one.example')
  await sources.getByRole('button', { name: 'Move Feed of one.example up' }).click()
  await expect(async () =>
    expect(await hosts()).toEqual(['two.example', 'one.example', 'three.example']),
  ).toPass()
  await expect.poll(() => asked).toBe(1)
  // Quick moves in a row show at once too, and the server is asked one at a time: the second
  // save is only sent after the first has been answered, with the order as it is by then.
  await sources.getByRole('button', { name: 'Move Feed of three.example up' }).click()
  await sources.getByRole('button', { name: 'Move Feed of three.example up' }).click()
  await expect.poll(hosts).toEqual(['three.example', 'two.example', 'one.example'])
  await page.waitForTimeout(300) // time enough for a second request to be sent, if one were going to be
  expect(asked).toBe(1)
  release()
  await expect.poll(() => saved).toBe(2)
  expect(asked).toBe(2)
  expect(await hosts()).toEqual(['three.example', 'two.example', 'one.example'])
  await page.unroute('**/sources/order')

  // The order, and removals, survive a reload.
  await holdToConfirm(page, sources.getByRole('button', { name: 'Remove Feed of three.example' }))
  await expect.poll(hosts).toEqual(['two.example', 'one.example'])
  await page.reload()
  await expect.poll(hosts).toEqual(['two.example', 'one.example'])
})

test('pasting a site that offers several feeds asks which to add', async ({ page }) => {
  await registerUser(page, uniqueName('Wren'))
  await page.getByRole('link', { name: 'Create your first profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Choosing feeds')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await goTo(page, 'Search')

  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('several.site.example')
  await feeds.getByRole('button', { name: 'Add source' }).click()

  const choice = feeds.getByRole('group', { name: /more than one feed/ })
  await expect(choice.getByLabel(/Comments/)).toBeVisible() // comments are listed, and labelled
  await expect(feeds.getByRole('listitem')).toHaveCount(0) // nothing yet
  await noViolations(page)

  await choice.getByLabel(/Posts/).check()
  await choice.getByLabel(/Podcast/).check()
  await feeds.getByRole('button', { name: 'Add chosen feeds' }).click()
  await expect(choice).toHaveCount(0)
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of posts.example' }),
  ).toBeVisible()
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of podcast.example' }),
  ).toBeVisible()
  await expect(feeds.getByLabel('Add a feed')).toHaveValue('')
})

test('shows the recent posts of a feed, only when asked', async ({ page }) => {
  await registerUser(page, uniqueName('Pia'))
  await page.getByRole('link', { name: 'Create your first profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Posts to read')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await goTo(page, 'Search')

  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add source' }).click()
  const row = feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' })

  let asked = 0
  page.on('request', (r) => {
    if (r.url().includes('/items')) asked++
  })
  await expect(row).toBeVisible()
  expect(asked).toBe(0) // not read until someone looks

  await row.getByText('Recent posts').click()
  const post = row.getByRole('link', { name: /A post in Feed of read.example/ })
  await expect(post).toHaveAttribute('href', 'https://read.example/post-1')
  await noViolations(page)
  expect(asked).toBe(1)

  // The same post is in the combined list at the top, with its feed's name.
  const recent = page.getByRole('region', { name: 'Recent posts' })
  await expect(recent.getByRole('link', { name: /A post in Feed of read.example/ })).toBeVisible()
  await expect(recent.getByRole('listitem')).toContainText('Feed of read.example')
})
