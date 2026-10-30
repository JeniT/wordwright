import AxeBuilder from '@axe-core/playwright'
import {
  PASSWORD,
  confirmEmail,
  createIdea,
  expect,
  goTo,
  joinFrom,
  linkIn,
  openFirstPublication,
  registerUser,
  test,
  uniqueUsername,
  waitForEmail,
  watchForProblems,
} from './fixtures'

test('only a draft’s editor can change it: another member sees it read-only', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()

  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  // Bob can read the draft, with the editor named, but not change it.
  await bob.goto(draftUrl)
  const banner = bob.getByTestId('read-only')
  await expect(banner).toContainText('Ada')
  await expect(banner).toContainText('is this draft’s editor')
  await expect(bob.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(bob.getByLabel('Title', { exact: true })).toHaveAttribute('readonly', '')
  await expect(bob.getByRole('button', { name: 'Critique' })).toHaveCount(0)
  await expect(bob.getByRole('textbox', { name: 'Draft body' })).toHaveAttribute(
    'contenteditable',
    'false',
  )
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Bob can comment, and sees only his own. Ada, the editor, sees it with his name on it and resolves it.
  const bobSide = bob.getByRole('complementary')
  await bobSide.getByRole('tab', { name: /^Comments/ }).click()
  await expect(bobSide.getByText(/You haven’t commented yet/)).toBeVisible()
  // He has no toolbar: he selects the words, and presses Add comment above the text.
  await bob
    .getByRole('textbox', { name: 'Draft body' })
    .getByText('Rivers rarely')
    .click({ clickCount: 3 })
  await bob.getByRole('button', { name: 'Add comment' }).first().click()
  await expect(bobSide.getByRole('heading', { name: 'Comment on paragraph 1' })).toBeVisible()
  await bobSide.getByLabel('Your comment').fill('Lovely first line.')
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  await expect(bobSide.getByLabel('Your comment')).toHaveCount(0) // the new card is the confirmation
  await expect(bobSide.getByRole('listitem')).toHaveCount(1)
  await expect(bob.getByRole('button', { name: 'Comment 1', exact: true })).toBeVisible()
  expect((await new AxeBuilder({ page: bob }).analyze()).violations, 'Bob’s comment').toEqual([])

  // The Add comment button at the top of the tab starts a general comment when the caret is not in the text. Its
  // author can reword it (it then says edited) and delete it for good.
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  await bobSide.getByLabel('Your comment').fill('A second thought.')
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  const second = bobSide.getByRole('listitem').nth(1)
  await second.getByRole('button', { name: /^Edit comment/ }).click()
  await second.getByLabel('Your comment').fill('A better second thought.')
  await second.getByRole('button', { name: 'Save' }).click()
  await expect(second).toContainText('A better second thought.')
  await expect(second).toContainText('edited')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations, 'an edited comment').toEqual(
    [],
  )
  await second.getByRole('button', { name: /^Delete comment/ }).dblclick()
  await expect(bobSide.getByText('A better second thought.')).toHaveCount(0)
  await expect(bobSide.getByRole('listitem')).toHaveCount(1)

  await page.goto(draftUrl)
  const adaSide = page.getByRole('complementary')
  await adaSide.getByRole('tab', { name: /^Comments/ }).click()
  const bobsComment = adaSide.getByRole('listitem').filter({ hasText: 'Lovely first line.' })
  await expect(bobsComment).toContainText('Bob')
  await adaSide.getByRole('switch', { name: 'Resolved: comment 1' }).click()
  await expect(adaSide.getByText('Lovely first line.')).toHaveCount(0)
  await bob.reload()
  await bob
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(bob.getByText('Lovely first line.')).toHaveCount(0)

  // The editor's changes reach Bob when he reloads.
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('They bend instead.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await bob.reload()
  await expect(
    bob.getByRole('textbox', { name: 'Draft body' }).getByText('They bend instead.'),
  ).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('the editor comments from the toolbar on selected words, which are underlined in the text', async ({
  page,
}) => {
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers bend')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('They bend instead, over centuries.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The old form is gone; Comment and Rephrase sit together in the toolbar.
  await expect(page.getByRole('button', { name: 'Add a comment' })).toHaveCount(0)
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(toolbar.getByRole('button', { name: 'Comment' })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Rephrase' })).toBeVisible()

  // Select two words in the second paragraph (a double click, then Shift+Right to take another word).
  await bodyBox.getByText('They bend instead').dblclick({ position: { x: 10, y: 8 } })
  await toolbar.getByRole('button', { name: 'Comment' }).click()
  const side = page.getByRole('complementary')
  await expect(side.getByRole('heading', { name: 'Comment on paragraph 2' })).toBeVisible()
  await expect(side.getByLabel('Your comment')).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the composer').toEqual([])
  await side.getByLabel('Your comment').fill('Say why.')
  await side.getByRole('button', { name: 'Add comment' }).click()
  await expect(side.getByLabel('Your comment')).toHaveCount(0)
  await expect(side.getByText('Say why.')).toBeVisible()
  await expect(bodyBox.locator('.comment-quote')).toHaveText('They')

  // A general comment: select the title, then Comment. There is no switch.
  await page.getByLabel('Title').focus()
  await toolbar.getByRole('button', { name: 'Comment' }).click()
  await expect(side.getByRole('heading', { name: 'General comment' })).toBeVisible()
  await expect(side.getByRole('switch', { name: 'General comment' })).toHaveCount(0)
  await side.getByRole('button', { name: 'Cancel' }).click()
  await expect(side.getByLabel('Your comment')).toHaveCount(0)
})

test('the editor offers a draft; the member declines once and accepts the next time', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  const offer = async () => {
    await page.goto(draftUrl)
    await page.getByRole('button', { name: 'Hand over editing', exact: true }).click()
    await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
    await page.getByRole('dialog').getByRole('button', { name: 'Hand over editing' }).click()
    await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  }

  // Ada offers, then takes it back from the notice, then offers again; she keeps the pen throughout.
  await offer()
  await page.getByRole('button', { name: 'Withdraw the offer' }).click()
  await expect(page.getByRole('button', { name: 'Hand over editing', exact: true })).toBeVisible()
  await offer()
  // Bob is told on the draft page and declines.
  // Critique is in the Comments tab, so the editor's tools show once it is open.
  await page
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(page.getByRole('button', { name: 'Critique' })).toBeVisible()
  await bob.goto(draftUrl)
  const offered = bob.getByTestId('offered-to-me')
  await expect(offered).toContainText('Ada has offered you this draft')
  await offered.getByRole('button', { name: 'Decline' }).click()
  await expect(bob.getByTestId('offered-to-me')).toHaveCount(0)
  // Asking is confirmed first, and a request can be withdrawn from its notice.
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Ask for this draft' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toBeVisible()
  await bob.getByRole('button', { name: 'Withdraw my request' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Ask for this draft' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toBeVisible()

  // Ada sees the request, offers again, and this time Bob accepts: the pen moves.
  await page.goto(draftUrl)
  await expect(page.getByText('Bob asked for this draft')).toBeVisible()
  await page.getByRole('button', { name: 'Hand over editing to Bob' }).click()
  await bob.reload()
  await bob.getByTestId('offered-to-me').getByRole('button', { name: 'Accept' }).click()
  await bob
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(bob.getByRole('button', { name: 'Critique' })).toBeVisible()
  await expect(bob.getByTestId('read-only')).toHaveCount(0)
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  await page.reload()
  await expect(page.getByTestId('read-only')).toContainText('Bob')
  await expect(page.getByRole('button', { name: 'Critique' })).toHaveCount(0)
  await page.getByRole('button', { name: /Handover history/ }).click()
  await expect(page.getByText(/Ada offered the draft to Bob: accepted/)).toBeVisible()
  await expect(page.getByText(/Ada offered the draft to Bob: declined/)).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('a member asked to review reads the draft with the full menu, and goes back to Home’s reviews', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobEmail = `bob-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const bob = await joinFrom(page, browser, 'Bob', bobEmail)
  const bobProblems = watchForProblems(bob)

  await page.goto('/')
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /Bob/ }).check()
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Bob, a member, finds it on Home and opens it: no "Start writing", and the side menu stays.
  await bob.goto('/')
  await bob
    .getByRole('region', { name: 'Drafts to review' })
    .getByRole('link', { name: 'Meanders' })
    .click()
  await expect(bob.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(bob.getByRole('link', { name: 'Start writing' })).toHaveCount(0)
  await expect(bob.getByRole('navigation').first()).toBeVisible()
  await bob.getByRole('button', { name: 'Add comment' }).click()
  const dialog = bob.getByRole('dialog', { name: 'Add comment' })
  await dialog.getByLabel('Your comment').fill('Which rivers?')
  await dialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(
    bob.getByRole('tabpanel', { name: 'Comments' }).getByText('Which rivers?'),
  ).toBeVisible()
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Back goes to Home, at the reviews; /reviews does the same.
  await bob.getByRole('link', { name: '← Back to Home' }).click()
  await expect(bob).toHaveURL(/\/#to-review-heading$/)
  await expect(bob.getByRole('heading', { name: 'Drafts to review' })).toBeInViewport()
  await bob.goto('/reviews')
  await expect(bob).toHaveURL(/\/#to-review-heading$/)
  await expect(
    bob
      .getByRole('heading', { name: 'Drafts to review' })
      .locator('..')
      .getByRole('link', { name: 'Meanders' }),
  ).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('the editor sends a snapshot for review; the reviewer comments and ends; the editor sees it and closes', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()

  // Ada sends it for review; the dialog says reviewers read a snapshot.
  const reviewerEmail = `rae-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByRole('tab', { name: /^Reviews/ }).click() // Send for review is at the top of this tab
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await expect(page.getByTestId('snapshot-notice')).toContainText('snapshot')
  await page.getByLabel('Email addresses').fill(reviewerEmail)
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  // The dialog closes and the Reviews tab beside the draft shows who was asked.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /^Reviews/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(`${reviewerEmail} · waiting for a reply`)).toBeVisible()
  const mail = await waitForEmail(reviewerEmail, 'Ada asked you to review a draft')
  const link = linkIn(mail, '/review-invite')
  expect(link, 'review link in the email').toBeTruthy()

  // Ada keeps writing after sending.
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Added after sending.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // Rae follows the link and makes a reviewer account with a name and password.
  const rae = await (await browser.newContext()).newPage()
  const raeProblems = watchForProblems(rae)
  await rae.goto(link!)
  await expect(rae.getByText('would like your comments on')).toBeVisible()
  expect((await new AxeBuilder({ page: rae }).analyze()).violations).toEqual([])
  await rae.getByLabel('What should we call you?').fill('Rae')
  await rae.getByLabel('Choose a password').fill(PASSWORD)
  await rae.getByRole('button', { name: 'Read the draft' }).click()

  // She lands on the draft she was asked to read, not on a list. Her whole app is her reviews.
  await expect(rae.getByRole('link', { name: 'Account' })).toHaveCount(0)
  await expect(rae.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(rae.getByText('Added after sending.')).toHaveCount(0)
  await expect(rae.getByRole('textbox', { name: 'Draft body' })).toHaveAttribute(
    'contenteditable',
    'false',
  )
  await rae.getByRole('button', { name: 'Add comment' }).click()
  const raeDialog = rae.getByRole('dialog', { name: 'Add comment' })
  await expect(raeDialog.getByRole('heading', { name: 'General comment' })).toBeVisible() // nothing selected
  await raeDialog.getByLabel('Your comment').fill('Which rivers do you mean?')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  // Her comments sit beside the draft, in the panel.
  const raePanel = rae.getByRole('tabpanel', { name: 'Comments' })
  await expect(raePanel.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(raePanel.getByText('General')).toBeVisible()
  await expect(rae.getByRole('switch', { name: 'General comment' })).toHaveCount(0)

  // With the title selected, Comment makes a general comment...
  await rae.getByLabel('Title').focus()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await expect(raeDialog.getByRole('heading', { name: 'General comment' })).toBeVisible()
  await raeDialog.getByLabel('Your comment').fill('Lovely title.')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(raePanel.getByText('Lovely title.')).toBeVisible()

  // ...and with words in a paragraph selected, one about that paragraph.
  await rae.getByText('Rivers rarely flow straight.', { exact: true }).dblclick()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await expect(raeDialog.getByRole('heading', { name: 'Comment on paragraph 1' })).toBeVisible()
  await raeDialog.getByLabel('Your comment').fill('Rarely?')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(raePanel.getByText('Rarely?')).toBeVisible()
  expect((await new AxeBuilder({ page: rae }).analyze()).violations).toEqual([])

  // Ada sees the comment as it is made, labelled with Rae's name, and how far Rae has got.
  await page.goto(draftUrl)
  await page.getByRole('tab', { name: /^Comments/ }).click()
  await expect(page.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(
    page
      .getByRole('tabpanel', { name: /^Comments/ })
      .getByText('Rae', { exact: true })
      .first(),
  ).toBeVisible()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(page.getByText(/Rae · Reading · 3 comments/)).toBeVisible()

  // Rae ends the review: the page stays, read-only, and Ada can see it finished.
  await raePanel.getByRole('button', { name: 'End review' }).click()
  await expect(rae.getByTestId('review-ended')).toContainText('You ended this review')
  await expect(rae.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(rae.getByRole('button', { name: 'End review' })).toHaveCount(0)
  await page.reload()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(page.getByText(/Rae · Finished · 3 comments/)).toBeVisible()
  const finished = await waitForEmail(adaEmail, 'Rae has finished reviewing Meanders')
  expect(finished.text).toContain('left 3 comments')

  // A second reviewer is closed out by the editor before they finish.
  const secondEmail = `sam-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByRole('tab', { name: /^Reviews/ }).click() // Send for review is at the top of this tab
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await page.getByLabel('Email addresses').fill(secondEmail)
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  // The Reviews tab shows the latest request; the first is a page back, and can be named.
  const reviewsTab = page.getByRole('tabpanel', { name: /^Reviews/ })
  await reviewsTab.getByRole('button', { name: 'Previous review' }).click()
  await expect(reviewsTab.getByText(/Rae · Finished/)).toBeVisible()
  await reviewsTab.getByRole('button', { name: 'Rename review' }).click()
  await reviewsTab.getByLabel('Review name').fill('First round')
  await reviewsTab.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(reviewsTab.getByRole('heading', { name: 'First round' })).toBeVisible()
  await reviewsTab.getByRole('button', { name: 'Next review' }).click()
  const second = linkIn(
    await waitForEmail(secondEmail, 'Ada asked you to review a draft'),
    '/review-invite',
  )
  const sam = await (await browser.newContext()).newPage()
  await sam.goto(second!)
  await sam.getByLabel('What should we call you?').fill('Sam')
  await sam.getByLabel('Choose a password').fill(PASSWORD)
  await sam.getByRole('button', { name: 'Read the draft' }).click()
  // Sending again made a new copy, so Sam's includes what Ada added after Rae's was sent.
  await expect(sam.getByText('Added after sending.', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await page.getByRole('button', { name: 'Close these reviews' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close these reviews' }).click()
  await sam.reload()
  await expect(sam.getByTestId('review-ended')).toContainText('closed')
  await expect(sam.getByRole('button', { name: 'Add comment' })).toHaveCount(0)

  // Rae chooses to start writing: a full account, sent to the home page.
  await rae.getByRole('link', { name: '← All your reviews' }).click()
  await rae.getByRole('banner').getByRole('link', { name: 'Start writing' }).click()
  await rae.getByLabel('Username').fill(uniqueUsername())
  await rae.getByRole('button', { name: 'Start writing' }).click()
  await expect(rae.getByRole('link', { name: 'Account' }).first()).toBeVisible()
  expect(raeProblems, "Rae's browser problems").toEqual([])
})

test('the publication’s landing page says what is waiting: an offer, a wait, and finished reviews', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  const publicationUrl = page.url()
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  // Nothing is waiting yet.
  await bob.goto(publicationUrl)
  await expect(bob.getByRole('heading', { level: 1, name: /writing$/ })).toBeVisible()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)

  // Ada offers the draft to Bob: she is told she is waiting, he is told it was offered.
  await page.goto(draftUrl)
  await page.getByRole('button', { name: 'Hand over editing', exact: true }).click()
  await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
  await page.getByRole('dialog').getByRole('button', { name: 'Hand over editing' }).click()
  await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  await page.goto(publicationUrl)
  await expect(page.getByRole('region', { name: 'Waiting for you' })).toContainText(
    'Waiting for Bob to answer your offer of Meanders',
  )
  await bob.goto(publicationUrl)
  const offered = bob.getByRole('region', { name: 'Waiting for you' })
  await expect(offered).toContainText('Ada has offered you the draft Meanders')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Ada withdraws from the landing page, and then offers again; Bob accepts there too.
  await page.getByRole('button', { name: 'Withdraw the offer of Meanders' }).click()
  await expect(page.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)
  await bob.reload()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)
  await page.goto(draftUrl)
  await page.getByRole('button', { name: 'Hand over editing', exact: true }).click()
  await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
  await page.getByRole('dialog').getByRole('button', { name: 'Hand over editing' }).click()
  await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  await bob.reload()
  await bob.getByRole('button', { name: 'Accept Meanders' }).click()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)

  // Bob, now the editor, sends it for review; the reviewer finishes with a comment.
  const reviewerEmail = `rae-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await bob.goto(draftUrl)
  await bob.getByRole('tab', { name: /^Reviews/ }).click()
  await bob.getByRole('button', { name: /^Send for review/ }).click()
  await bob.getByLabel('Email addresses').fill(reviewerEmail)
  await bob.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  await expect(bob.getByRole('tab', { name: /^Reviews/ })).toHaveAttribute('aria-selected', 'true')
  const link = linkIn(
    await waitForEmail(reviewerEmail, 'Bob asked you to review a draft'),
    '/review-invite',
  )
  const rae = await (await browser.newContext()).newPage()
  await rae.goto(link!)
  await rae.getByLabel('What should we call you?').fill('Rae')
  await rae.getByLabel('Choose a password').fill(PASSWORD)
  await rae.getByRole('button', { name: 'Read the draft' }).click()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await rae.getByRole('dialog').getByLabel('Your comment').fill('Which rivers?')
  await rae.getByRole('dialog').getByRole('button', { name: 'Add comment' }).click()
  await expect(rae.getByText('Which rivers?')).toBeVisible()

  // While Rae is reading, Bob's landing page lists the draft under Keep writing; once she ends, it says she is done.
  await bob.goto(publicationUrl)
  const keepWriting = bob.getByRole('region', { name: 'Keep writing' })
  await expect(keepWriting).toContainText('0 of 1 reviews complete · 1 unresolved comment')
  await rae.getByRole('button', { name: 'End review' }).first().click()
  await expect(rae.getByTestId('review-ended')).toBeVisible()
  await bob.reload()
  await expect(keepWriting).toContainText('1 of 1 reviews complete · 1 unresolved comment')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // The draft page says the same per request; resolving the comment clears what is left to answer.
  await bob.goto(draftUrl)
  await bob.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(bob.getByTestId('review-summary')).toContainText(
    '1 of 1 reviews complete · 1 comment',
  )
  await bob.getByRole('tab', { name: /^Comments/ }).click()
  await bob
    .getByRole('switch', { name: /Resolved/ })
    .first()
    .click()
  await bob.goto(publicationUrl)
  await expect(bob.getByRole('region', { name: 'Keep writing' })).toContainText(
    '1 of 1 reviews complete · No unresolved comments',
  )
  expect(bobProblems, "Bob's browser problems").toEqual([])
})
