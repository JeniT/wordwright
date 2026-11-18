import { render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import Breadcrumb from './Breadcrumb.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

describe('Breadcrumb', () => {
  it('never squeezes an earlier crumb to a letter or two: it keeps its own width, up to its share of 40%', async () => {
    render(Breadcrumb, {
      props: {
        crumbs: [
          { label: 'The Slow Letter', to: '/p/p1' },
          { label: 'Local newspapers are worth paying for', to: '/p/p1/ideas/i1' },
        ],
      },
      global: { plugins: [router] },
    })
    const first = screen.getByRole('link', { name: 'The Slow Letter' }).parentElement!
    const last = screen.getByRole('link', { name: /Local newspapers/ }).parentElement!
    expect(first.style.flexShrink).toBe('0')
    expect(first.style.maxWidth).toBe('40%')
    expect(last.style.flexShrink).toBe('1')
    expect(last.style.maxWidth).toBe('')
  })
})
