<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import { COMMENT_MAX_LENGTH, type CommentInput } from '@lfwa/core'
import SaveStatus from './SaveStatus.vue'

/**
 * Adds a comment about one paragraph of the draft or about the whole of it. A comment is words about the writing, never
 * words to put in it, so there is no way to offer replacement text here. Choosing the paragraph from a list keeps it
 * usable from a keyboard and a phone alike.
 */
const props = defineProps<{
  /** The draft's paragraphs as saved, which is what a comment's paragraph is found in. */
  blocks: { id: string; text: string }[]
  /** Adds the comment; a failure is shown here. */
  add: (input: CommentInput) => Promise<unknown>
  /** Whom it will be shown to, said above the field. */
  audience: string
}>()
const about = ref('whole')
const text = ref('')
const id = useId()

const options = computed(() => [
  { id: 'whole', label: 'The whole draft' },
  ...props.blocks.map((b, i) => {
    const plain = b.text.replace(/\s+/g, ' ').trim()
    return { id: b.id, label: `${i + 1}. ${plain.length > 50 ? `${plain.slice(0, 49)}…` : plain}` }
  }),
])
const post = useMutation({
  mutationFn: () => props.add({ block: about.value, text: text.value }),
  onSuccess: () => (text.value = ''),
})
</script>

<template>
  <form class="mt-6 space-y-2 border-t border-line pt-4" @submit.prevent="post.mutate()">
    <h3 class="font-medium">Add a comment</h3>
    <p class="text-sm text-ink-soft">{{ audience }}</p>
    <div>
      <label class="text-sm" :for="`${id}-about`">About</label>
      <select :id="`${id}-about`" v-model="about" class="field">
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
    </div>
    <div>
      <label class="text-sm" :for="`${id}-text`">Your comment</label>
      <textarea
        :id="`${id}-text`"
        v-model="text"
        class="field"
        rows="3"
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
      <SaveStatus :mutation="post" saved="Comment added" saving="Adding…" />
    </div>
  </form>
</template>
