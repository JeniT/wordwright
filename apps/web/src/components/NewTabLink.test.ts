import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import NewTabLink from './NewTabLink.vue'

describe('NewTabLink', () => {
  it('opens the address in a new tab without handing over the page', () => {
    render(NewTabLink, { props: { href: 'https://example.org/a' }, slots: { default: 'Example' } })
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.org/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('tells assistive technology in words, and shows only an icon', () => {
    const { container } = render(NewTabLink, {
      props: { href: 'https://example.org/a' },
      slots: { default: 'Example' },
    })
    expect(screen.getByRole('link', { name: 'Example (opens in a new tab)' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.sr-only')).toHaveTextContent('(opens in a new tab)')
  })

  it('adds detail to the spoken name when the visible text is not enough', () => {
    render(NewTabLink, {
      props: { href: 'https://example.org/a', detail: '“A title”' },
      slots: { default: 'Open the page' },
    })
    expect(
      screen.getByRole('link', { name: 'Open the page “A title” (opens in a new tab)' }),
    ).toBeInTheDocument()
  })

  it('has a tooltip, unless the caller gives its own title', () => {
    const first = render(NewTabLink, { props: { href: 'https://example.org/a' } })
    expect(first.getByRole('link')).toHaveAttribute('title', 'Opens in a new tab')
    first.unmount()
    const second = render(NewTabLink, {
      props: { href: 'https://example.org/a' },
      attrs: { title: 'A long title' },
    })
    expect(second.getByRole('link')).toHaveAttribute('title', 'A long title')
  })

  it('also works for a page inside the app', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/help/api-key', component: { template: '<div />' } }],
    })
    await router.push('/help/api-key')
    render(NewTabLink, {
      props: { to: '/help/api-key' },
      slots: { default: 'How to get an API key' },
      global: { plugins: [router] },
    })
    const link = screen.getByRole('link', { name: 'How to get an API key (opens in a new tab)' })
    expect(link).toHaveAttribute('href', '/help/api-key')
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('links that open in a new tab', () => {
  it('all go through NewTabLink, so the wording and the icon are written once', () => {
    const here = join(process.cwd(), 'src') // vitest runs from apps/web
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.vue') && entry.name !== 'NewTabLink.vue') {
          const source = readFileSync(path, 'utf8')
          // The editors open links on Ctrl/⌘-click and rendered notes use markdown.ts: deliberately without an icon.
          if (/target="_blank"|\(opens in a new tab\)/.test(source)) offenders.push(path)
        }
      }
    }
    walk(here)
    expect(offenders).toEqual([])
  })
})
