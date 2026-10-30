import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import {
  expect,
  goTo,
  holdToConfirm,
  leaveSettings,
  openFeeds,
  openSettingsPage,
  test,
} from './fixtures'

const PASSWORD = 'a perfectly good password'

/** A real PNG of the given size (flat colour), for checking what happens to a picture bigger than the app keeps. */
function solidPng(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// A real 1x1 PNG, so the browser actually decodes what we upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function registerUser(page: Page, name: string) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(name.toLowerCase()) // so publication addresses start with it
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
}

/** A different name each time, because usernames are shared between parallel tests. */
const uniqueName = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

const noViolations = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

test("shows the website's icon when there is no picture, and the person's own picture instead when there is", async ({
  page,
}) => {
  await registerUser(page, uniqueName('Ivy'))

  // A website and no picture: the site's icon stands in, drawn as another site's image (on its plate).
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Garden notes')
  await page.getByLabel(/Website/).fill('garden.example')
  // Leaving the field shows the icon at once, before anything is created.
  await page.getByLabel('Publication name', { exact: true }).focus()
  await expect(page.locator('main img[src^="data:image/"]')).toBeVisible()
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page).toHaveURL(/garden-notes$/)
  const icon = page.getByRole('banner').locator('img').filter({ visible: true }).first()
  await expect(icon).toHaveAttribute('src', /\/site-icon\?v=\d+$/)
  await expect(icon.locator('..')).toHaveClass(/source-mark/)
  await noViolations(page)

  // The same website with a picture: the picture is shown, not the icon.
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Allotment')
  await page.getByLabel(/Website/).fill('allotment.example')
  await page
    .getByLabel(/Picture/)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page).toHaveURL(/allotment$/)
  const own = page.getByRole('banner').locator('img').filter({ visible: true }).first()
  await expect(own).toHaveAttribute('src', /\/image\?v=\d+$/)
})

test('a picture bigger than the app keeps is shrunk for the writer, not refused', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Una'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Big picture')
  await page
    .getByLabel(/Picture/)
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: solidPng(1600, 1200) })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page).toHaveURL(/big-picture$/)
  const picture = page.locator('img[src*="/image?v="]').filter({ visible: true }).first()
  await expect(picture).toBeVisible()
  // naturalWidth is 0 until the picture has loaded, so wait for it rather than read it once.
  await expect
    .poll(() =>
      picture.evaluate((img: HTMLImageElement) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
    )
    .toEqual({ width: 512, height: 384 })
})

test('creates a publication with a website and picture, and opens its page', async ({ page }) => {
  const person = uniqueName('Pat')
  await registerUser(page, person)
  const handle = person.toLowerCase()

  await page.getByRole('link', { name: 'New publication' }).click()
  await expect(page.getByRole('heading', { name: 'New publication' })).toBeVisible()
  await page.getByLabel('Publication name', { exact: true }).fill('My Substack')
  await expect(page.getByText(`/p/${handle}-my-substack`)).toHaveCount(0) // the address is not a thing to edit
  await page.getByLabel(/Website/).fill('pat.substack.com')
  await page
    .getByLabel(/Picture/)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await noViolations(page)
  await page.getByRole('button', { name: 'Create publication' }).click()

  // Lands on the publication page at its readable address.
  await expect(page).toHaveURL(new RegExp(`/p/${handle}-my-substack$`))
  await expect(
    page.getByRole('banner').getByText('My Substack').filter({ visible: true }).first(),
  ).toBeVisible()
  // In the menu, and beside the title on the publication's own page.
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

test('edits details, changes and removes the picture, and deletes the publication', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Quinn'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Draft publication')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(
    page.getByRole('banner').getByText('Draft publication').filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('banner').locator('img')).toHaveCount(0) // monogram placeholder

  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await noViolations(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Details' })).toBeVisible()
  await page.getByLabel('Publication name', { exact: true }).fill('Final publication')
  await page.getByLabel(/Website/).fill('not a url')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a web address')
  await page.getByLabel(/Website/).fill('final.example.com')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await expect(page.getByLabel(/Website/)).toHaveValue('https://final.example.com')

  // The description is written in a rich-text editor, with no Markdown to know, and survives a reload.
  await openSettingsPage(page, 'Description')
  const description = page.getByRole('textbox', { name: 'Description' })
  await description.fill('Personal weeknotes, mostly for me.')
  await description.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Bold' }).click()
  await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await page.getByLabel('Link address').fill('example.com')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(description.locator('a')).toHaveAttribute('href', 'https://example.com')
  await noViolations(page)
  await page.getByRole('button', { name: 'Save description' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' }).last()).toBeVisible()
  await page.reload()
  await expect(description.locator('strong')).toHaveText('Personal weeknotes, mostly for me.')
  await expect(description.locator('a')).toHaveAttribute('href', 'https://example.com')
  await noViolations(page)

  // Focus looks like any field: the border changes, with no ring inside it. Remove link is for when the cursor is in a link.
  await description.focus()
  await expect(description).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)')
  await description.locator('a').click()
  await page.getByRole('button', { name: 'Remove link' }).click()
  await expect(description.locator('a')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove link' })).toBeDisabled()

  // A non-image is refused with a reason; a real one is accepted.
  await openSettingsPage(page, 'Details')
  await page.getByLabel('Choose a picture').setInputFiles({
    name: 'notes.txt',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText('could not be read as a picture')
  await page
    .getByLabel('Choose a picture')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('main').locator('img')).toBeVisible()
  await holdToConfirm(page, page.getByRole('button', { name: 'Remove picture' }))
  await expect(page.getByRole('main').locator('img')).toHaveCount(0)

  await openSettingsPage(page, 'Delete publication')
  await page.getByRole('button', { name: 'Delete publication' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete publication' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /Final publication/ })).toHaveCount(
    0,
  )
})

test('renaming a publication changes its address, and the old address still works', async ({
  page,
}) => {
  const who = uniqueName('Reese')
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Early name')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(
    page.getByRole('banner').getByText('Early name').filter({ visible: true }).first(),
  ).toBeVisible()
  const oldPath = new URL(page.url()).pathname
  expect(oldPath).toMatch(/^\/p\/[a-z0-9]+-early-name$/)

  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Later name')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  const newPath = oldPath.replace('early-name', 'later-name')
  await expect(page).toHaveURL(`${newPath}/settings/details`)
  await expect(page.getByRole('heading', { level: 1, name: 'Details' })).toBeVisible()

  // Bookmarks and shared links to the old address end up at the new one.
  await page.goto(oldPath)
  await expect(page).toHaveURL(newPath)
  await expect(
    page.getByRole('banner').getByText('Later name').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.goto(`${oldPath}/settings`)
  await expect(page).toHaveURL(`${newPath}/settings/details`)

  // The server itself answers the old API address with a permanent redirect.
  const res = await page.request.get(`/api/publications/${oldPath.slice(3)}`, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(res.headers()['location']).toBe(`/api/publications/${newPath.slice(3)}`)
})

test('changes the display name, which is then used wherever it is shown', async ({ page }) => {
  const who = uniqueName('Remy')
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Remy publication')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(
    page.getByRole('banner').getByText('Remy publication').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(page, 'Sharing')
  const member = (name: string) =>
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: `${name} (` })
  await expect(member(who)).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  const section = page.getByRole('region', { name: 'Name' })
  const field = section.getByLabel('Name', { exact: true })
  const change = section.getByRole('button', { name: 'Save name' })
  await expect(field).toHaveValue(who)
  await expect(change).toBeDisabled()
  await noViolations(page)

  await field.fill('')
  await expect(change).toBeDisabled()
  await field.fill(`${who} Reed`)
  await change.click()
  await expect(section.getByRole('status')).toHaveText('Saved')
  await noViolations(page)

  // The header follows at once, and so does the list of people in the publication, with no other step.
  await expect(page.getByRole('banner').getByText(`${who} Reed`, { exact: true })).toBeVisible()
  await page.reload()
  await expect(field).toHaveValue(`${who} Reed`)
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await page
    .getByRole('main')
    .getByRole('link', { name: /Remy publication/ })
    .click()
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(page, 'Sharing')
  await expect(member(`${who} Reed`)).toBeVisible()
})

test('changes the username: existing publications keep their address, new ones use it', async ({
  page,
  browser,
}) => {
  const who = uniqueName('Quinn')
  const before = who.toLowerCase()
  const after = uniqueName('writer').toLowerCase()
  await registerUser(page, who)
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('First publication')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page).toHaveURL(`/p/${before}-first-publication`)

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  const section = page.getByRole('region', { name: 'Username' })
  await expect(section).toBeVisible()
  await section.getByLabel('Username', { exact: true }).fill('Not Valid!')
  await expect(section.getByText('Use only letters and numbers in your username')).toBeVisible()
  await section.getByLabel('Username', { exact: true }).fill('admin')
  await expect(section.getByText('That username is reserved. Try another.')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Save username' })).toBeDisabled()
  await section.getByLabel('Username', { exact: true }).fill(after)
  await expect(section.getByText(`“${after}” is available.`)).toBeVisible()
  await noViolations(page)
  await section.getByRole('button', { name: 'Save username' }).click()
  await expect(section).toContainText('Saved')

  // The publication made earlier keeps its address; a new one starts with the new username.
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(
    page.getByRole('main').getByRole('link', { name: /First publication/ }),
  ).toHaveAttribute('href', `/p/${before}-first-publication`)
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Second publication')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page).toHaveURL(`/p/${after}-second-publication`)

  // The old username is kept for them: nobody else can take it.
  const other = await (await browser.newContext()).newPage()
  await other.goto('/register')
  await other.getByLabel('Username').fill(before)
  await expect(other.getByText('That username is already taken. Try another.')).toBeVisible()
})

test('two people can each have a publication called "Substack", with different addresses', async ({
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
    await p.getByRole('link', { name: 'New publication' }).click()
    await p.getByLabel('Publication name', { exact: true }).fill('Substack')
    await p.getByRole('button', { name: 'Create publication' }).click()
    await expect(p).toHaveURL(new RegExp(`/p/${who.toLowerCase()}-substack$`))
  }

  // One person's publication address doesn't open for the other.
  await bobPage.goto(`/p/${ada.toLowerCase()}-substack`)
  await expect(bobPage.getByRole('alert')).toContainText("couldn't find that publication")
  await noViolations(bobPage)
})

test('publication pages for a signed-in user have no detectable accessibility violations', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Sam'))
  await noViolations(page) // the list, with the API key set-up and the first-publication prompt
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Sam writing')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await noViolations(page) // the publication page
})

test('manages the feeds in the publication settings, which are listed alphabetically', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Tess'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Articles')
  await page.getByRole('button', { name: 'Create publication' }).click()

  // With no feeds, the landing page and Search both lead to setting them up.
  await expect(page.getByRole('region', { name: 'Scan' }).getByText('No feeds yet.')).toBeVisible()
  await page
    .getByRole('region', { name: 'Scan' })
    .getByRole('link', { name: 'Set up feeds →' })
    .click()
  await expect(page).toHaveURL(/\/settings\/feeds$/)
  const sources = page.getByRole('region', { name: 'Feeds' })
  await expect(sources.getByText('No feeds yet. Add one above.')).toBeVisible()

  // The hint links to the help on finding feeds, which opens in a new tab; the Add feed button sits beside the field.
  const field = page.getByLabel('Add a feed')
  const addButton = page.getByRole('button', { name: 'Add feed' })
  const [fieldBox, buttonBox] = [await field.boundingBox(), await addButton.boundingBox()]
  expect(buttonBox!.x).toBeGreaterThan(fieldBox!.x + fieldBox!.width - 1)
  expect(Math.abs(buttonBox!.y - fieldBox!.y)).toBeLessThan(4)
  const popup = page.waitForEvent('popup')
  await page.getByRole('link', { name: /See how to find feeds/ }).click()
  const help = await popup
  await expect(help.getByRole('heading', { level: 1, name: 'Finding feeds' })).toBeVisible()
  await noViolations(help)
  await help.close()
  const add = async (address: string) => {
    await sources.getByLabel('Add a feed').fill(address)
    await sources.getByRole('button', { name: 'Add feed' }).click()
  }

  // Bad addresses are explained; good ones are read, named and added.
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

  // Alphabetical, not in the order added, and nothing to drag.
  const hosts = async () =>
    (await sources.getByRole('listitem').allInnerTexts()).map((t) => t.match(/\w+\.example/)![0])
  expect(await hosts()).toEqual(['one.example', 'three.example', 'two.example'])
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0)

  // Removals survive a reload.
  await holdToConfirm(page, sources.getByRole('button', { name: 'Remove Feed of three.example' }))
  await expect.poll(hosts).toEqual(['one.example', 'two.example'])
  await page.reload()
  await expect.poll(hosts).toEqual(['one.example', 'two.example'])

  // Scan now offers a quiet link instead of a button, and the menu has the page between Description and Sharing.
  await leaveSettings(page)
  await goTo(page, 'Scan')
  await expect(page.getByRole('link', { name: 'Manage feeds' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Set up feeds →' })).toHaveCount(0)
})

test('pasting a site that offers several feeds asks which to add', async ({ page }) => {
  await registerUser(page, uniqueName('Wren'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Choosing feeds')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await openFeeds(page)

  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('several.site.example')
  await feeds.getByRole('button', { name: 'Add feed' }).click()

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

test('a feed’s posts are listed on Search with their feed’s name, not under the feed in the settings', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Pia'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Posts to read')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await openFeeds(page)

  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add feed' }).click()
  const row = feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Recent posts')).toHaveCount(0)
  await expect(feeds.getByRole('link', { name: /A post in Feed of read.example/ })).toHaveCount(0)
  await noViolations(page)

  await leaveSettings(page)
  await goTo(page, 'Scan')
  const recent = page.getByRole('region', { name: 'Recent posts' })
  await expect(recent.getByRole('link', { name: /A post in Feed of read.example/ })).toBeVisible()
  await expect(recent.getByRole('listitem')).toContainText('Feed of read.example')
})

test('shows the description at the top of the publication page, clamped with Show more', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Robin'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Weeknotes')
  await page.getByRole('button', { name: 'Create publication' }).click()
  const about = page.getByRole('region', { name: 'About this publication' })
  // With no description there is one invitation, at the top, and no empty description area.
  await expect(about).toHaveCount(0)

  // The box to write in is the first thing on the Description page, which stays put when saved.
  await page.getByRole('link', { name: /Describe this publication/ }).click()
  await expect(page).toHaveURL(/\/settings\/description$/)
  const paragraphs = Array.from(
    { length: 12 },
    (_, i) => `Paragraph ${i + 1} about the publication.`,
  )
  await page.getByRole('textbox', { name: 'Description' }).fill(paragraphs.join('\n\n'))
  await page.getByRole('button', { name: 'Save description' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.getByRole('banner').getByRole('link', { name: /^← / }).click()
  await expect(page).toHaveURL(/\/p\/[^/]+$/)

  await expect(about.getByText('Paragraph 1 about')).toBeVisible()
  await expect(about.getByText('Paragraph 12 about')).not.toBeInViewport()
  await noViolations(page)
  await about.getByRole('button', { name: 'Show more…' }).click()
  await expect(about.getByText('Paragraph 12 about')).toBeVisible()
  await about.getByRole('button', { name: 'Show less' }).click()
  await expect(about.getByRole('button', { name: 'Show more…' })).toBeVisible()

  // On a phone the same text wraps onto more lines, and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(about.getByRole('button', { name: 'Show more…' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
})

test('writes a description with guidance on what it needs, and nothing drafts it for the writer', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Sam'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Garden notes')
  await page.getByLabel(/Website/).fill('garden.example')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await page.getByRole('link', { name: 'Describe this publication' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Description' })).toBeVisible()
  const describeUrl = page.url()

  // The advice is a link, not a panel above the box, and there is no AI drafting from posts.
  await expect(
    page.getByRole('link', { name: /See what makes a useful description/ }),
  ).toBeVisible()
  await expect(page.locator('details')).toHaveCount(0)
  await expect(page.getByText('Draft from a few posts')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Draft a description' })).toHaveCount(0)
  await noViolations(page)

  await page.getByRole('textbox', { name: 'Description' }).fill('Garden essays, by me, for me.')
  await page.getByRole('button', { name: 'Save description' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.getByRole('banner').getByRole('link', { name: /^← / }).click()
  const about = page.getByRole('region', { name: 'About this publication' })
  await expect(about.getByText('Garden essays, by me, for me.')).toBeVisible()
  await expect(about.getByText('AI draft', { exact: true })).toHaveCount(0)
  await noViolations(page)

  // The settings link to the same advice, which is on its own help page.
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(page, 'Description')
  const popup = page.waitForEvent('popup') // the link opens the help in a new tab
  await page.getByRole('link', { name: /See what makes a useful description/ }).click()
  const help = await popup
  await expect(help.getByRole('heading', { level: 1, name: 'Writing a description' })).toBeVisible()
  await expect(help.getByText('What it is:', { exact: false })).toBeVisible()
  await noViolations(help)
  await help.close()

  // The Description page on a phone, in dark mode.
  await page.setViewportSize({ width: 390, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(describeUrl)
  await expect(page).toHaveURL(describeUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Description' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await noViolations(page)
})

test('publication settings are a menu of short pages, which fold behind the menu button on a phone', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Tess'))
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Short pages')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()

  // The bare address and the gear lead to Details; each page is its own address and its own heading.
  await expect(page).toHaveURL(/\/settings\/details$/)
  const nav = page.getByRole('navigation', { name: 'Publication settings' })
  await expect(nav.getByRole('link', { name: 'Details' })).toHaveAttribute('aria-current', 'page')
  await noViolations(page)
  for (const name of ['Description', 'Sharing', 'Download', 'Delete publication']) {
    await openSettingsPage(page, name)
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
  await noViolations(page)

  // The way up is the publication itself.
  await page.getByRole('banner').getByRole('link', { name: '← Short pages' }).click()
  await expect(page).toHaveURL(/\/p\/[^/]+$/)

  // On a phone the menu folds away behind its button, and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).first().click()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await openSettingsPage(page, 'Sharing')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await noViolations(page)
})
