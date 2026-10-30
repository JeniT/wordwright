import { createIdea, expect, signUpWithPublication, startDraft, test } from './fixtures'

// The built app, served with the Content-Security-Policy from deploy/Caddyfile (the `csp` project in
// playwright.config.ts). Chrome reports anything the policy blocks as a console error, which fails the test, so this
// walks through the pages most likely to need something the policy forbids: an inline script, an inline style, a
// picture from memory, the editor.

test('the app works under the production Content-Security-Policy', async ({ page }) => {
  // A saved dark theme is applied by the one inline script in index.html, before the app loads.
  await page.addInitScript(() => localStorage.setItem('wordwright-theme', 'dark'))
  const first = await page.goto('/register')
  expect(first?.headers()['content-security-policy'], 'the policy is being sent').toContain(
    "default-src 'self'",
  )
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'See [the survey](https://example.org/survey).')
  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('The river bends because the outside bank wears away.')
  await expect(body).toContainText('outside bank')
})
