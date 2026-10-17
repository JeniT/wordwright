import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import PublicationImage from './PublicationImage.vue'

const props = { id: 'ada-garden', name: 'Garden' }

describe('PublicationImage', () => {
  it("shows the person's own picture cropped to fill, even when the website has an icon", () => {
    const { container } = render(PublicationImage, {
      props: { ...props, imageUrl: '/own.png', siteIconUrl: '/site.png' },
    })
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/own.png')
    expect(img.className).toContain('object-cover')
  })

  it("falls back to the website's icon, as another site's image on its plate", () => {
    const { container } = render(PublicationImage, {
      props: { ...props, siteIconUrl: '/site.png' },
    })
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/site.png')
    expect(img.parentElement).toHaveClass('source-mark')
  })

  it('falls back to a lettered tile with neither', () => {
    const { container } = render(PublicationImage, { props })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.source-letter')).toHaveTextContent('G')
  })

  it('fills the box with a site icon that is square to its corners, and keeps the others on the plate', () => {
    const square = render(PublicationImage, {
      props: { ...props, siteIconUrl: '/site.png', siteIconSquare: true },
    })
    expect(square.container.querySelector('.source-mark')).toHaveAttribute('data-fill', 'true')
    const other = render(PublicationImage, { props: { ...props, siteIconUrl: '/site.png' } })
    expect(other.container.querySelector('.source-mark')).not.toHaveAttribute('data-fill')
  })

  it('does the same for a feed icon, and never fills the writer’s own picture by that flag', () => {
    const feed = render(PublicationImage, {
      props: { ...props, imageUrl: '/feed.png', kind: 'source', square: true },
    })
    expect(feed.container.querySelector('.source-mark')).toHaveAttribute('data-fill', 'true')
    const own = render(PublicationImage, {
      props: { ...props, imageUrl: '/own.png', square: true, siteIconSquare: true },
    })
    expect(own.container.querySelector('[data-fill]')).toBeNull()
  })
})
