import { render, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { expectNoLoneInfoIcons, loneInfoIcons } from '../testing/info-icons'
import { testUser } from '../test-utils'
import { useSessionStore } from '../stores/session'
import HeadingRow from './HeadingRow.vue'
import Explain from './Explain.vue'
import TextField from './TextField.vue'

function mount(tutorialMode: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().set({ ...testUser, tutorialMode })
  const Page = defineComponent(
    () => () =>
      h('div', [
        h(
          HeadingRow,
          { label: 'About people' },
          { default: () => h('h2', 'People'), explain: () => 'Who can do what.' },
        ),
        h(HeadingRow, { label: 'About nothing' }, { default: () => h('h2', 'Quiet') }),
        h(
          TextField,
          { modelValue: '', label: 'Name', explainLabel: 'About the name' },
          { explain: () => 'Changes the address.' },
        ),
        h('div', [h('button', 'Go'), h(Explain, { label: 'About go' }, () => 'Does a thing.')]),
      ]),
  )
  return render(Page, { global: { plugins: [pinia] } })
}

describe('HeadingRow and the other places an info icon goes', () => {
  it('puts the icon on the heading’s row, after the heading, not on a line of its own', () => {
    const { container } = mount(false)
    const heading = screen.getByRole('heading', { name: 'People' })
    const icon = screen.getByRole('button', { name: 'About people' })
    expect(icon).toHaveAccessibleDescription('Who can do what.')
    const row = heading.parentElement!
    expect(row.contains(icon)).toBe(true)
    expect(row.className).toContain('justify-between')
    expectNoLoneInfoIcons(container)
  })

  it('puts a field’s icon on its label row and an icon beside its button', () => {
    mount(false)
    const label = screen.getByText('Name')
    expect(
      label.parentElement!.contains(screen.getByRole('button', { name: 'About the name' })),
    ).toBe(true)
    const go = screen.getByRole('button', { name: 'Go' })
    expect(go.parentElement!.contains(screen.getByRole('button', { name: 'About go' }))).toBe(true)
  })

  it('shows nothing extra for a heading with nothing to say', () => {
    mount(false)
    expect(screen.queryByRole('button', { name: 'About nothing' })).toBeNull()
  })

  it('writes the text out below the heading, with no icon, in tutorial mode', () => {
    const { container } = mount(true)
    expect(screen.getByText('Who can do what.')).toBeVisible()
    expect(screen.getByText('Changes the address.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^About/ })).toBeNull()
    expect(loneInfoIcons(container)).toEqual([])
  })

  it('notices an icon left alone on a line', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().set({ ...testUser, tutorialMode: false })
    const Lone = defineComponent(
      () => () => h('div', [h(Explain, { label: 'About lonely' }, () => 'Alone.')]),
    )
    const { container } = render(Lone, { global: { plugins: [pinia] } })
    expect(loneInfoIcons(container)).toEqual(['About lonely'])
  })
})
