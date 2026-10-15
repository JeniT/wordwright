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
})
