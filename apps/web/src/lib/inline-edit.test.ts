import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useInlineEdit } from './inline-edit'

afterEach(() => (document.body.innerHTML = ''))

function page() {
  document.body.innerHTML = `
    <button id="edit-a">Edit a</button><button id="edit-b">Edit b</button>
    <input id="field-a"><input id="field-b">`
  const el = (id: string) => document.getElementById(id)
  return useInlineEdit<'a' | 'b'>({
    field: (key) => el(`field-${key}`),
    trigger: (key) => el(`edit-${key}`),
  })
}

describe('useInlineEdit', () => {
  it('starts editing, then focuses the field', async () => {
    const edit = page()
    await edit.start('b')
    expect(edit.editing.value).toBe('b')
    expect(document.activeElement?.id).toBe('field-b')
  })

  it('stops editing, then gives focus back to the button that opened it', async () => {
    const edit = page()
    await edit.start('a')
    await edit.stop()
    expect(edit.editing.value).toBeNull()
    expect(document.activeElement?.id).toBe('edit-a')
  })

  it('moving from one thing to another focuses the new field', async () => {
    const edit = page()
    await edit.start('a')
    await edit.start('b')
    expect(edit.editing.value).toBe('b')
    expect(document.activeElement?.id).toBe('field-b')
  })

  it('stopping when nothing is being edited moves no focus', async () => {
    const edit = page()
    document.getElementById('field-a')!.focus()
    await edit.stop()
    await nextTick()
    expect(document.activeElement?.id).toBe('field-a')
  })
})
