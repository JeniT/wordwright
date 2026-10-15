<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import type { DraftComment } from '@wordwright/core'
import SwitchField from './SwitchField.vue'

/**
 * One comment: its number, who wrote it (the AI's is marked with the highlighter), what it is about, what it says,
 * and, for the draft's editor, a Resolved switch. A comment about a paragraph that is still in the draft is a button
 * (pressing it shows the paragraph); one about the whole draft, or about a paragraph that has been rewritten, has
 * nothing to show. A resolved comment stays where it is, quieter.
 */
const props = defineProps<{
  entry: DraftComment & { number: number }
  /** `show`: pressing it shows its paragraph. `plain`: nothing to show. `changed`: the paragraph was rewritten. */
  kind: 'show' | 'plain' | 'changed'
  active?: boolean
  /**
   * The viewer is the draft's editor: they see everyone's comments, so each names its author, and only they resolve
   * them. (A member sees only their own, so there is no need to name the author.)
   */
  isEditor?: boolean
  /** The signed-in person, so their own comments say "You". */
  viewerId?: string
}>()
const emit = defineEmits<{ show: []; setResolved: [resolved: boolean] }>()
const flip = useTemplateRef<InstanceType<typeof SwitchField>>('flip')
defineExpose({ revert: () => flip.value?.revert() })

const author = computed(() => {
  const e = props.entry
  if (e.byAi) return 'AI critique'
  if (e.authorId !== null && e.authorId === props.viewerId) return 'You'
  return e.authorName ?? 'A former member'
})
</script>

<template>
  <div>
    <component
      :is="kind === 'show' ? 'button' : 'div'"
      :id="`comment-${entry.id}`"
      :type="kind === 'show' ? 'button' : undefined"
      class="block w-full rounded-ctl border-2 bg-surface p-3 text-left"
      :class="[
        kind === 'show' ? 'hover:bg-sunken' : '',
        active
          ? 'border-accent'
          : entry.resolved || kind === 'changed'
            ? 'border-line'
            : 'border-line-strong',
      ]"
      :aria-current="active ? 'true' : undefined"
      @click="kind === 'show' && emit('show')"
    >
      <span class="block text-sm text-ink-soft">
        <span class="chip mr-1" :class="entry.byAi && !entry.resolved ? 'chip-ai' : 'chip-quiet'">{{
          entry.number
        }}</span>
        <template v-if="isEditor || entry.byAi">
          <span :class="entry.byAi ? 'chip chip-ai mr-1' : 'font-medium text-ink'">{{
            author
          }}</span>
          <span v-if="!entry.byAi">: </span>
        </template>
        <template v-if="kind === 'show'">“{{ entry.excerpt }}”</template>
        <template v-else-if="kind === 'changed'">It was: “{{ entry.excerpt }}”</template>
        <template v-else>The whole draft</template>
      </span>
      <span
        class="block whitespace-pre-wrap"
        :class="entry.resolved ? 'text-ink-soft' : entry.byAi ? 'font-medium' : ''"
        >{{ entry.text }}</span
      >
      <span v-if="entry.reason" class="block text-ink-soft">{{ entry.reason }}</span>
      <span v-if="kind === 'show'" class="sr-only">Press to show it in the draft.</span>
    </component>
    <SwitchField
      v-if="isEditor"
      ref="flip"
      :model-value="entry.resolved"
      label="Resolved"
      :name="`Resolved: comment ${entry.number}`"
      @update:model-value="emit('setResolved', $event)"
    />
  </div>
</template>
