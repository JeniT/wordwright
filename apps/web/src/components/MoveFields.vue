<script setup lang="ts">
import { computed } from 'vue'
import type { useMoveDestination } from '../lib/move'
import MoveTo from './MoveTo.vue'

/**
 * Where to move articles or notes. It is the form in a list's toolbar for several selected rows, and the body of
 * the dialog for one row's Move button, so both ask the same way. The toolbar form says how many ("Move 4 notes to");
 * the dialog's title already names the one row, so it leaves `count` out.
 */
const props = defineProps<{
  dest: ReturnType<typeof useMoveDestination>
  fromIdea: boolean
  publicationLabel: string
  allowNew: boolean
  /** How many rows are selected, and what they are called, for the label. */
  count?: number
  noun?: 'note' | 'item'
}>()
// What was chosen lives in the page's reactive `dest`; this only edits it, as the picker does.
const choice = props.dest
const label = computed(() =>
  props.count && props.noun
    ? `Move ${props.count} ${props.noun}${props.count === 1 ? '' : 's'} to`
    : 'Move to',
)
</script>

<template>
  <MoveTo
    v-model:destination="choice.destination"
    v-model:new-idea-name="choice.newIdeaName"
    v-model:other-publication="choice.otherPublicationId"
    v-model:other-destination="choice.otherDestination"
    :dest="dest"
    :from-idea="fromIdea"
    :publication-label="publicationLabel"
    :allow-new="allowNew"
    :label="label"
  />
</template>
