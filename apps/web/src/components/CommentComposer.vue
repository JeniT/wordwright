<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { COMMENT_MAX_LENGTH, WHOLE_DRAFT, type CommentInput } from '@wordwright/core'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

/**
 * Writing one comment, from the Comment button: about the paragraph (or the words in it) that was chosen, or, with the
 * General comment switch, about the draft as a whole. A comment is words about the writing, never words to put in it,
 * so there is no way to offer replacement text here. The field starts as one line and grows as the comment does, up
 * to a limit (smaller on a phone). The new comment's card is the confirmation, so there is no "added" message.
 */
const props = defineProps<{
  /** The paragraph being commented on, if there is one: its id (`b4`), its number (4), and the selected words in it. */
  target: { block: string; number: number; quote: string | null; excerpt?: string } | null
  /** Adds the comment; a failure is shown here. */
  add: (input: CommentInput) => Promise<unknown>
  /** Whom it will be shown to, said above the field (members; the editor sees everything and needs no line). */
  audience?: string
}>()
const emit = defineEmits<{ done: []; cancel: [] }>()

const general = ref(!props.target)
watch(
  () => props.target,
  (target) => (general.value = !target),
)
const text = ref('')
const id = useId()
const field = useTemplateRef<HTMLTextAreaElement>('field')

const heading = computed(() =>
  general.value || !props.target
    ? 'General comment'
    : `Comment on paragraph ${props.target.number}`,
)
const post = useMutation({
  mutationFn: () =>
    props.add({
      block: general.value || !props.target ? WHOLE_DRAFT : props.target.block,
      text: text.value,
      ...(!general.value && props.target?.quote ? { quote: props.target.quote } : {}),
    }),
  onSuccess: () => {
    text.value = ''
    emit('done')
  },
})

/** One line to start with, then as tall as the words need; the CSS caps it and the field scrolls beyond that. */
function grow() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(text, () => nextTick(grow))
onMounted(() => field.value?.focus())
defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <form
    class="panel space-y-2 p-3"
    :aria-labelledby="`${id}-heading`"
    @submit.prevent="post.mutate()"
  >
    <h3 :id="`${id}-heading`" class="font-medium">{{ heading }}</h3>
    <p
      v-if="!general && (target?.quote || target?.excerpt)"
      class="border-l-2 border-line-strong pl-2 text-sm text-ink-soft"
    >
      “{{ target.quote || target.excerpt }}”
    </p>
    <SwitchField v-model="general" compact label="General comment" :unavailable="!target" />
    <p v-if="audience" class="text-sm text-ink-soft">{{ audience }}</p>
    <div>
      <label class="text-sm" :for="`${id}-text`">Your comment</label>
      <textarea
        :id="`${id}-text`"
        ref="field"
        v-model="text"
        class="field max-h-28 resize-none overflow-y-auto sm:max-h-52"
        rows="1"
        :maxlength="COMMENT_MAX_LENGTH"
        required
      ></textarea>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        class="btn btn-outline"
        :disabled="post.isPending.value || !text.trim()"
      >
        Add comment
      </button>
      <button type="button" class="btn btn-neutral" @click="emit('cancel')">Cancel</button>
      <SaveStatus :mutation="post" saved="" saving="Adding…" />
    </div>
  </form>
</template>
