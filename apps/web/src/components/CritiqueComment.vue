<script setup lang="ts">
import { useTemplateRef } from 'vue'
import type { CritiqueRound } from '@lfwa/core'
import SwitchField from './SwitchField.vue'

/**
 * One comment: its number, what it is about, the point and the reason, and a Read switch. A comment about a paragraph
 * that is still in the draft is a button (pressing it shows the paragraph); one about the whole piece, or about a
 * paragraph that has been rewritten, has nothing to show. A comment marked Read stays where it is, quieter.
 */
const props = defineProps<{
  entry: CritiqueRound['points'][number] & { number: number }
  /** `show`: pressing it shows its paragraph. `plain`: nothing to show. `changed`: the paragraph was rewritten. */
  kind: 'show' | 'plain' | 'changed'
  active?: boolean
}>()
const emit = defineEmits<{ show: []; setRead: [read: boolean] }>()
const read = () => props.entry.dismissed
const flip = useTemplateRef<InstanceType<typeof SwitchField>>('flip')
defineExpose({ revert: () => flip.value?.revert() })
</script>

<template>
  <div>
    <button
      v-if="kind === 'show'"
      :id="`critique-point-${entry.id}`"
      type="button"
      class="block w-full rounded-ctl border-2 bg-surface p-3 text-left hover:bg-sunken"
      :class="active ? 'border-accent' : read() ? 'border-line' : 'border-line-strong'"
      :aria-current="active ? 'true' : undefined"
      @click="emit('show')"
    >
      <span class="block text-sm text-ink-soft">
        <span class="chip mr-1" :class="read() ? 'chip-quiet' : 'chip-ai'">{{ entry.number }}</span
        >“{{ entry.excerpt }}”
      </span>
      <span class="block" :class="read() ? 'text-ink-soft' : 'font-medium'">{{ entry.point }}</span>
      <span class="block text-ink-soft">{{ entry.reason }}</span>
      <span class="sr-only">Press to show it in the draft.</span>
    </button>
    <div
      v-else
      class="rounded-ctl border-2 p-3"
      :class="read() || kind === 'changed' ? 'border-line' : 'border-line-strong'"
    >
      <p class="text-sm text-ink-soft">
        <span class="chip mr-1" :class="read() ? 'chip-quiet' : 'chip-ai'">{{ entry.number }}</span>
        <template v-if="kind === 'changed'">It was: “{{ entry.excerpt }}”</template>
        <template v-else>The whole piece</template>
      </p>
      <p :class="read() ? 'text-ink-soft' : 'font-medium'">{{ entry.point }}</p>
      <p class="text-ink-soft">{{ entry.reason }}</p>
    </div>
    <SwitchField
      ref="flip"
      :model-value="entry.dismissed"
      label="Read"
      :name="`Read: point ${entry.number}`"
      @update:model-value="emit('setRead', $event)"
    />
  </div>
</template>
