<script setup lang="ts">
import SwitchField from './SwitchField.vue'

/** What moving the chosen notes does to the pages they came from, and the choice to bring the other notes along. */
defineProps<{
  /** How many pages the notes were taken from. */
  sourceCount: number
  /** Other notes taken from those same pages, which stay behind unless asked for. */
  othersCount: number
}>()
const bringAll = defineModel<boolean>('bringAll', { required: true })
</script>

<template>
  <p v-if="sourceCount" class="meta mt-1" data-move-says>
    {{ sourceCount === 1 ? 'The page' : `The ${sourceCount} pages` }}
    they were taken from will be copied to its articles.
  </p>
  <div v-if="othersCount" class="mt-1">
    <SwitchField
      v-model="bringAll"
      compact
      :label="`Also bring the ${othersCount} other ${othersCount === 1 ? 'note' : 'notes'} taken from those pages`"
    />
  </div>
</template>
