<script setup lang="ts">
import SwitchField from './SwitchField.vue'

/** What moving the chosen notes will do, and the choice to bring the other notes from the same pages along. */
defineProps<{
  /** How many notes will move, where to (`destination`), and how many pages they were taken from. */
  count: number
  destination: string
  sourceCount: number
  /** Other notes taken from those same pages, which stay behind unless asked for. */
  othersCount: number
}>()
const bringAll = defineModel<boolean>('bringAll', { required: true })
</script>

<template>
  <p class="mt-1 text-xs text-ink-soft" data-move-says>
    {{ count }} {{ count === 1 ? 'note' : 'notes' }} will move to {{ destination }}.
    <template v-if="sourceCount">
      {{ sourceCount === 1 ? 'The page' : `The ${sourceCount} pages` }}
      they were taken from will be copied to its reading list (or the copy already there is used);
      the originals stay where they are.
    </template>
  </p>
  <div v-if="othersCount" class="mt-1">
    <SwitchField
      v-model="bringAll"
      compact
      :label="`Also bring the ${othersCount} other ${othersCount === 1 ? 'note' : 'notes'} taken from those pages`"
    />
    <p class="meta">Otherwise they stay here, still pointing at the pages here.</p>
  </div>
</template>
