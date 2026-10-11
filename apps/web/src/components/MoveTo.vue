<script setup lang="ts">
import { errorMessage } from '../lib/api'
import { NEW_IDEA, type useMoveDestination } from '../lib/move'
import TextField from './TextField.vue'

/**
 * The picker for where to move reading items or notes: the profile's own list (when moving from an idea), the other
 * ideas, or a new idea named in the writer's own words. `dest` comes from `useMoveDestination`.
 */
defineProps<{
  dest: ReturnType<typeof useMoveDestination>
  /** The inside of an idea moves to the profile; the profile's own list has nowhere "up" to go. */
  fromIdea: boolean
  /** "The profile’s reading list" or "The profile’s notes". */
  profileLabel: string
  /** Whether a new idea can be made to move into. */
  allowNew: boolean
  /** What happens to the new idea ("The items you move become its reading list."). */
  newIdeaHint: string
}>()
// What was chosen belongs to the page; this only edits it.
const destination = defineModel<string>('destination', { required: true })
const newIdeaName = defineModel<string>('newIdeaName', { required: true })
</script>

<template>
  <p v-if="dest.ideas.isPending" class="text-sm">Loading your ideas…</p>
  <p v-else-if="dest.ideas.isError" role="alert" class="text-sm text-danger">
    We couldn't load your ideas, so there's nowhere to move to. Reload the page to try again.
  </p>
  <template v-else>
    <label for="move-to" class="mb-1 block text-sm font-medium">Move to</label>
    <select id="move-to" v-model="destination" class="field field-compact mb-3 max-w-full">
      <option value="" disabled>Choose where…</option>
      <option v-if="fromIdea" value="profile">{{ profileLabel }}</option>
      <option v-for="idea in dest.others" :key="idea.id" :value="idea.id">{{ idea.name }}</option>
      <option v-if="allowNew" :value="NEW_IDEA">A new idea…</option>
    </select>
    <TextField
      v-if="destination === NEW_IDEA"
      v-model="newIdeaName"
      label="What's your core idea?"
      autocomplete="off"
      required
      :hint="newIdeaHint"
    />
    <p v-if="dest.makeIdea.isError" role="alert" class="mb-2 text-sm text-danger">
      {{ errorMessage(dest.makeIdea.error) }}
    </p>
  </template>
</template>
