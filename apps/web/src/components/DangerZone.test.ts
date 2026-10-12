import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import DangerZone from './DangerZone.vue'

describe('DangerZone', () => {
  it('is a region named by its title, with the explanation and the action', () => {
    render(DangerZone, {
      props: { title: 'Delete thing' },
      slots: { default: '<p>It all goes.</p>', action: '<button>Delete it</button>' },
    })
    const region = screen.getByRole('region', { name: 'Delete thing' })
    expect(region).toHaveTextContent('It all goes.')
    expect(screen.getByRole('button', { name: 'Delete it' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('announces why a delete failed', () => {
    render(DangerZone, { props: { title: 'Delete thing', error: 'Try again in a minute.' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in a minute.')
  })
})
