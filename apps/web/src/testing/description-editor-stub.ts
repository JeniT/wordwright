import { defineComponent, h, useId } from 'vue'

/**
 * Stands in for `DescriptionEditor` in page tests: jsdom cannot type into a rich-text editor, and those tests are
 * about what the page does with the words, not about editing them (`DescriptionEditor.test.ts` covers that). It keeps
 * the same label and `v-model`, so a page test writes and reads the description as it did with a plain box.
 *
 * Use it with `vi.mock('../components/DescriptionEditor.vue', () => import('../testing/description-editor-stub'))`.
 */
export default defineComponent({
  props: {
    modelValue: { type: String, required: true },
    label: { type: String, default: '' },
    hint: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const id = useId()
    return () =>
      h('div', [
        h('label', { for: id }, props.label),
        h('textarea', {
          id,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        }),
      ])
  },
})
