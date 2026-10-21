<script setup lang="ts">
import { useTemplateRef } from 'vue'
import type { DraftComment } from '@wordwright/core'
import PersonChip from './PersonChip.vue'
import SwitchField from './SwitchField.vue'

/**
 * One comment, in a plain box: its number (the same round marker as in the draft; the AI's in the highlighter), who
 * wrote it, what it says, and, for the draft's editor, a Resolved switch. The marker and the text together are one
 * button when the paragraph is still in the draft (pressing it shows the paragraph); a general comment (about the
 * whole draft, marked with a chip), or one about a paragraph that has been rewritten, has nothing to show. A resolved comment stays where it is, quieter.
 */
defineProps<{
  entry: DraftComment & { number: number }
  /** `show`: pressing it shows its paragraph. `plain`: nothing to show. `changed`: the paragraph was rewritten. */
  kind: 'show' | 'plain' | 'changed'
  active?: boolean
  /**
   * The viewer is the draft's editor: they see everyone's comments, so each names its author, and only they resolve
   * them. (A member sees only their own, so there is no need to name the author.)
   */
  isEditor?: boolean
}>()
const emit = defineEmits<{ show: []; setResolved: [resolved: boolean] }>()
const flip = useTemplateRef<InstanceType<typeof SwitchField>>('flip')
defineExpose({ revert: () => flip.value?.revert() })
</script>

<template>
  <div
    :id="`comment-${entry.id}`"
    class="panel p-3"
    :class="entry.resolved || kind === 'changed' ? 'text-ink-soft' : ''"
  >
    <component
      :is="kind === 'show' ? 'button' : 'div'"
      :type="kind === 'show' ? 'button' : undefined"
      class="flex w-full items-start gap-2 text-left"
      :class="kind === 'show' ? 'rounded-ctl hover:bg-sunken' : ''"
      :aria-current="active ? 'true' : undefined"
      :data-comment-button="kind === 'show' ? '' : undefined"
      @click="kind === 'show' && emit('show')"
    >
      <span
        class="comment-marker"
        :class="[entry.byAi && !entry.resolved ? 'is-ai' : '', active ? 'is-active' : '']"
        >{{ entry.number }}</span
      >
      <span class="block min-w-0 flex-1">
        <span v-if="isEditor || entry.byAi || kind === 'plain'" class="block text-sm">
          <span v-if="entry.byAi" class="chip chip-ai mr-1">Your AI</span>
          <PersonChip v-else-if="isEditor" class="mr-1" :name="entry.authorName" />
          <span v-if="kind === 'plain'" class="chip chip-quiet mr-1">General</span>
        </span>
        <span
          class="block whitespace-pre-wrap"
          :class="entry.resolved ? 'text-ink-soft' : entry.byAi ? 'font-medium' : ''"
          >{{ entry.text }}</span
        >
        <span v-if="entry.reason" class="block text-ink-soft">{{ entry.reason }}</span>
        <span v-if="kind === 'show'" class="sr-only">Press to show it in the draft.</span>
      </span>
    </component>
    <SwitchField
      v-if="isEditor"
      ref="flip"
      class="mt-2"
      :model-value="entry.resolved"
      label="Resolved"
      compact
      :name="`Resolved: comment ${entry.number}`"
      @update:model-value="emit('setResolved', $event)"
    />
  </div>
</template>
