import { render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useModal } from './modal'

describe('useModal', () => {
  it('gives the focus back to what opened it without scrolling the page to it (#450)', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const focus = vi.spyOn(opener, 'focus')

    const open = ref(true)
    const Dialog = defineComponent({
      setup() {
        const dialog = ref<HTMLElement | null>(null)
        useModal({
          open: () => open.value,
          dialog,
          onEscape: () => (open.value = false),
          initialFocus: () => dialog.value?.querySelector('input'),
        })
        return () => h('div', { ref: dialog }, [h('input')])
      },
    })
    render(Dialog)
    await nextTick()

    open.value = false
    await nextTick()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    opener.remove()
  })
})
