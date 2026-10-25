import AxeBuilder from '@axe-core/playwright'
import {
  PASSWORD,
  confirmEmail,
  expect,
  holdToConfirm,
  invite,
  joinFrom,
  linkIn,
  openSettings,
  openSettingsPage,
  registerUser,
  test,
  uniqueUsername,
  waitForEmail,
  watchForProblems,
} from './fixtures'

test('invites someone who has no account yet: they register from the email and join', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const newbieEmail = `newbie-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const link = await invite(page, newbieEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
  await expect(page.getByText(newbieEmail).first()).toBeVisible()

  // The invitee has no account and opens the link in their own browser.
  const newbie = await (await browser.newContext()).newPage()
  const newbieProblems = watchForProblems(newbie)
  await newbie.goto(link)
  await expect(newbie.getByText('has invited you to write together')).toBeVisible()
  expect(
    (await new AxeBuilder({ page: newbie }).analyze()).violations,
    'accessibility of invitation page',
  ).toEqual([])
  await newbie.getByRole('link', { name: 'Create an account' }).click()
  await expect(newbie.getByLabel('Email')).toHaveValue(newbieEmail) // prefilled from the invitation
  await newbie.getByLabel('What should we call you?').fill('Newbie')
  await newbie.getByLabel('Username').fill(uniqueUsername())
  await newbie.getByLabel('Password').fill(PASSWORD)
  await newbie.getByRole('button', { name: 'Create account' }).click()

  // Registering from the invitation page joins them at once: there is no button to press.
  await expect(newbie.getByRole('button', { name: /^Join / })).toHaveCount(0)
  await expect(newbie.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  // Accepting proved they own the address, so there is no "please confirm" banner.
  await expect(newbie.getByRole('region', { name: 'Email confirmation' })).toHaveCount(0)
  await expect(newbie.getByRole('banner').getByText('Shared with')).toHaveCount(0)

  // Ada now sees them as a member, and the invitation is no longer pending.
  await page.reload()
  const people = page.getByRole('list', { name: 'People' })
  await expect(people.getByText('member')).toBeVisible()
  await expect(people).not.toContainText(newbieEmail)
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  // On Home each of them sees their own role beside the sharing line (#228).
  await newbie.goto('/')
  // They joined rather than started a publication, so the only step left is the AI key.
  await expect(newbie.getByRole('heading', { name: 'Create your first publication' })).toHaveCount(
    0,
  )
  await expect(newbie.getByLabel('Anthropic API key')).toBeVisible()
  await expect(newbie.getByRole('link', { name: /Shared with 1 person/ })).toContainText('Member')
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Shared with 1 person/ })).toContainText('Owner')
  expect(newbieProblems, "Newbie's browser problems").toEqual([])
})

test('an owner makes a member an owner, then steps down; the last owner cannot', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)
  await openSettings(page)

  // Ada is the only owner, so she can't step down, and is told why.
  await expect(page.getByRole('button', { name: 'Step down as owner' })).toBeDisabled()
  await expect(page.getByText('Make someone else an owner first')).toBeVisible()

  // Making Bob an owner asks first, saying what changes.
  await page.getByRole('button', { name: 'Make owner Bob' }).click()
  const dialog = page.getByRole('dialog', { name: /^Make Bob an owner of / })
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Make Bob an owner' }).click()
  await expect(page.getByText('Bob is now an owner.')).toBeVisible()

  // Bob can now change the publication's details.
  await bob.reload()
  await bob.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await expect(bob.getByRole('button', { name: 'Save details' })).toBeVisible()

  // Ada steps down and loses the owner-only parts of the page.
  await page.getByRole('button', { name: 'Step down as owner' }).click()
  const stepDown = page.getByRole('dialog', { name: /^Step down as owner of / })
  await expect(stepDown).toContainText('Only another owner can give them back')
  await stepDown.getByRole('button', { name: 'Step down as owner' }).click()
  await expect(page.getByText('You are no longer an owner.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
  // A member has no Details page: nothing on it is theirs to change.
  await expect(
    page
      .getByRole('navigation', { name: 'Publication settings' })
      .getByRole('link', { name: 'Details' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('navigation', { name: 'Publication settings' })
      .getByRole('link', { name: 'Delete publication' }),
  ).toHaveCount(0)

  // Bob is now the only owner.
  await bob.reload()
  await openSettingsPage(bob, 'Sharing')
  await expect(bob.getByRole('button', { name: 'Step down as owner' })).toBeDisabled()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('removing a member and leaving a publication each ask first, saying what happens', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await joinFrom(page, browser, 'Bob')
  const cara = await joinFrom(page, browser, 'Cara')
  const caraProblems = watchForProblems(cara)
  await openSettings(page)

  // Cancelling leaves Bob in place.
  await page.getByRole('button', { name: 'Remove Bob' }).click()
  const dialog = page.getByRole('dialog', { name: /^Remove Bob from / })
  await expect(dialog).toContainText('longest-standing owner')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Remove Bob' })).toBeVisible()

  // Confirming removes him.
  await page.getByRole('button', { name: 'Remove Bob' }).click()
  await dialog.getByRole('button', { name: 'Remove Bob' }).click()
  await expect(page.getByRole('button', { name: 'Remove Bob' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Cara' })).toBeVisible()

  // Cara leaves from her own page, after being told she needs a new invitation to come back.
  await cara.reload()
  await cara.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(cara, 'Sharing')
  await cara.getByRole('button', { name: 'Leave', exact: true }).click()
  const leaving = cara.getByRole('dialog', { name: /^Leave / })
  await expect(leaving).toContainText('only if an owner invites you again')
  await leaving.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(cara.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  expect(caraProblems, "Cara's browser problems").toEqual([])
})

test('declining and blocking an inviter from the email, then lifting the block', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobEmail = `bob-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await invite(page, bobEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()

  // Bob has no account. He declines from the email and stops invitations from Ada.
  const bob = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bob)
  const declineLink = linkIn(
    await waitForEmail(bobEmail, 'Ada invited you to write together'),
    '/decline-invite',
  )!
  expect(declineLink, 'decline link in the email').toBeTruthy()
  await bob.goto(declineLink)
  await expect(bob.getByText("They won't be told that you declined")).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of decline page',
  ).toEqual([])
  await bob.getByLabel('Also stop invitations from Ada').check()
  await bob.getByRole('button', { name: 'Decline' }).click()
  await expect(bob.getByRole('status')).toContainText('from this person again')

  // Ada isn't told; the invitation just stops waiting, and a second attempt quietly does nothing.
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)
  await page.getByLabel('Email address').first().fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`Invitation sent to ${bobEmail}`)).toBeVisible()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  // Bob signs up later with that address, confirms it, and sees the block on his account page.
  await bob.goto('/register')
  await bob.getByLabel('What should we call you?').fill('Bob')
  await bob.getByLabel('Username').fill(uniqueUsername())
  await bob.getByLabel('Email').fill(bobEmail)
  await bob.getByLabel('Password').fill(PASSWORD)
  await bob.getByRole('button', { name: 'Create account' }).click()
  await expect(bob.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  await bob.goto(
    linkIn(await waitForEmail(bobEmail, 'Confirm your email address'), '/verify-email')!,
  )
  await expect(bob.getByText('your email address is confirmed')).toBeVisible()
  await bob.goto('/account/security')
  await expect(bob.getByText('Ada', { exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of account page',
  ).toEqual([])
  await bob.getByRole('button', { name: 'Unblock Ada' }).click()
  await expect(bob.getByText('No one blocked')).toBeVisible()
  expect(bobProblems).toEqual([])

  // With the block lifted, Ada's invitation goes through again.
  await page.getByLabel('Email address').first().fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
})

test('invites someone who already has an account; the link only works for that address', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const malloryPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await registerUser(malloryPage, 'Mallory')

  const link = await invite(page, bobEmail)

  // Someone signed in as a different person is told so, and can't join.
  await malloryPage.goto(link)
  await expect(malloryPage.getByRole('alert')).toContainText(`sent to ${bobEmail}`)
  await expect(malloryPage.getByRole('button', { name: /^Join / })).toHaveCount(0)

  await bobPage.goto(link)
  await bobPage.getByRole('button', { name: /^Join / }).click()
  await expect(bobPage.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await expect(bobPage.getByRole('banner').getByText('Shared with')).toHaveCount(0)
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('an invited person with a confirmed address sees the invitation on Home and joins from there', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await confirmEmail(bobPage, bobEmail)

  await invite(page, bobEmail)

  // Bob never opens the email: it is waiting on his Home page.
  await bobPage.goto('/')
  const panel = bobPage.getByRole('region', { name: 'Invitations' })
  await expect(panel).toContainText('Ada invited you to write together')
  expect((await new AxeBuilder({ page: bobPage }).analyze()).violations).toEqual([])
  await panel.getByRole('button', { name: /^Join / }).click()
  await expect(bobPage.getByRole('banner')).toContainText("Ada's writing")
  await bobPage.goto('/')
  await expect(bobPage.getByRole('region', { name: 'Invitations' })).toHaveCount(0)
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('revoking an invitation stops its link working', async ({ page, browser }) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const email = `revoked-${Date.now()}@example.com`
  const link = await invite(page, email)
  await holdToConfirm(page, page.getByRole('button', { name: `Revoke invitation to ${email}` }))
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  const guest = await (await browser.newContext()).newPage()
  await guest.goto(link)
  await expect(guest.getByRole('alert')).toContainText('invalid or has expired')
})

test('unconfirmed owners are told to confirm before inviting', async ({ page }) => {
  await registerUser(page, 'Ada')
  await openSettings(page)
  await expect(page.getByText('Confirm your email address to invite people')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
})
