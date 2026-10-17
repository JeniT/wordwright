import { test, expect } from './fixtures'

// `:hover` once outranked the focus rule, so a field you were typing in showed the hover border while the mouse sat on it.
test('a field keeps its focus border while the pointer is over it', async ({ page }) => {
  await page.goto('/register')
  const [first, second] = [page.locator('input.field').nth(0), page.locator('input.field').nth(1)]
  const border = (field: typeof first) => field.evaluate((e) => getComputedStyle(e).borderTopColor)

  await second.hover()
  const hoverOnly = await border(second)

  await first.click()
  await first.hover()
  await page.keyboard.type('jenit')
  await expect(first).toBeFocused()
  expect(await border(first)).not.toBe(hoverOnly)
})

test('an invalid field keeps its error border while the pointer is over it', async ({ page }) => {
  await page.goto('/register')
  const field = page.locator('input.field').first()
  await field.evaluate((e) => e.setAttribute('aria-invalid', 'true'))
  const border = () => field.evaluate((e) => getComputedStyle(e).borderTopColor)
  await page.mouse.move(0, 0)
  const atRest = await border()
  await field.hover()
  expect(await border()).toBe(atRest)
})
