<script setup lang="ts">
import type { useMoveDestination } from '../lib/move'
import Explain from './Explain.vue'
import MoveTo from './MoveTo.vue'

/**
 * Where to move reading items or notes, with a note on what moving does. It is the form in a list's toolbar for
 * several selected rows, and the body of the dialog for one row's Move button, so both ask the same way.
 */
const props = defineProps<{
  dest: ReturnType<typeof useMoveDestination>
  fromIdea: boolean
  publicationLabel: string
  allowNew: boolean
  newIdeaHint: string
  /** Names the info icon ("About moving notes"). */
  explainLabel: string
}>()
// What was chosen lives in the page's reactive `dest`; this only edits it, as the picker does.
const choice = props.dest
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <MoveTo
      v-model:destination="choice.destination"
      v-model:new-idea-name="choice.newIdeaName"
      v-model:other-publication="choice.otherPublicationId"
      v-model:other-destination="choice.otherDestination"
      :dest="dest"
      :from-idea="fromIdea"
      :publication-label="publicationLabel"
      :allow-new="allowNew"
      :new-idea-hint="newIdeaHint"
    />
    <Explain :label="explainLabel"><slot /></Explain>
  </div>
</template>
