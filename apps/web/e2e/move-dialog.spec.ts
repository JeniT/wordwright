import AxeBuilder from '@axe-core/playwright'
import { expect, test, createIdea } from './fixtures'

test('the Move dialog keeps its picker inside it, however long an idea’s name is', async ({
  page,
}) => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pia')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`pia-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Gathering')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await createIdea(
    page,
    'We are talking past each other on AI risks and what to do about the very long list of them',
    'x',
  )
  await page.goto(page.url().replace(/\/ideas\/.*/, '/notes'))
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('A first note')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('A first note')).toBeVisible()

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.getByRole('button', { name: /^Move note “A first/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Move to').selectOption({ index: 1 })
    const inside = await dialog.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const select = el.querySelector('select')!.getBoundingClientRect()
      return select.left >= box.left && select.right <= box.right
    })
    expect(inside, `the picker is inside the dialog at ${width}px`).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.keyboard.press('Escape')
  }
})
