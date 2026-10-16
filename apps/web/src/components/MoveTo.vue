<script setup lang="ts">
import { computed, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { NEW_IDEA, OTHER_PUBLICATION, type useMoveDestination } from '../lib/move'
import Explain from './Explain.vue'

/**
 * The picker for where to move reading items or notes: the publication's own list (when moving from an idea), the other
 * ideas, or a new idea named in the writer's own words. Someone with more than one publication can also choose "Another
 * publication…", which asks which, then where in it. `dest` comes from `useMoveDestination`.
 */
const props = defineProps<{
  dest: ReturnType<typeof useMoveDestination>
  /** The inside of an idea moves to the publication; the publication's own list has nowhere "up" to go. */
  fromIdea: boolean
  /** "The publication’s reading list" or "The publication’s notes". */
  publicationLabel: string
  /** Whether a new idea can be made to move into. */
  allowNew: boolean
  /** What happens to the new idea ("The items you move become its reading list."). */
  newIdeaHint: string
}>()
// What was chosen belongs to the page; this only edits it.
const destination = defineModel<string>('destination', { required: true })
const newIdeaName = defineModel<string>('newIdeaName', { required: true })
const otherPublication = defineModel<string>('otherPublication', { required: true })
const otherDestination = defineModel<string>('otherDestination', { required: true })

// A different publication has different ideas, so what was chosen in the last one no longer applies.
watch(otherPublication, () => (otherDestination.value = ''))
const otherName = computed(() => props.dest.otherPublication?.name ?? '')
</script>

<template>
  <p v-if="dest.ideas.isPending" class="text-sm">Loading your ideas…</p>
  <p v-else-if="dest.ideas.isError" role="alert" class="text-sm text-danger">
    We couldn't load your ideas, so there's nowhere to move to. Reload the page to try again.
  </p>
  <div v-else class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <label for="move-to" class="text-sm font-medium">Move to</label>
    <select id="move-to" v-model="destination" class="field field-compact max-w-full !w-auto">
      <option value="" disabled>Choose where…</option>
      <option v-if="fromIdea" value="publication">{{ publicationLabel }}</option>
      <option v-for="idea in dest.others" :key="idea.id" :value="idea.id">{{ idea.name }}</option>
      <option v-if="allowNew" :value="NEW_IDEA">A new idea…</option>
      <option v-if="dest.otherPublications.length" :value="OTHER_PUBLICATION">
        Another publication…
      </option>
    </select>
    <template v-if="destination === OTHER_PUBLICATION">
      <label for="move-publication" class="text-sm font-medium">Which publication</label>
      <select
        id="move-publication"
        v-model="otherPublication"
        class="field field-compact max-w-full !w-auto"
      >
        <option value="" disabled>Choose a publication…</option>
        <option v-for="p in dest.otherPublications" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <template v-if="otherPublication">
        <span v-if="dest.otherIdeas.isPending" class="text-sm">Loading its ideas…</span>
        <span v-else-if="dest.otherIdeas.isError" role="alert" class="text-sm text-danger">
          We couldn't load the ideas of “{{ otherName }}”. Choose it again, or reload the page.
        </span>
        <template v-else>
          <label for="move-other-to" class="text-sm font-medium">Move into</label>
          <select
            id="move-other-to"
            v-model="otherDestination"
            class="field field-compact max-w-full !w-auto"
          >
            <option value="" disabled>Choose where…</option>
            <option value="publication">{{ dest.otherListLabel }}</option>
            <option v-for="idea in dest.otherIdeas.data" :key="idea.id" :value="idea.id">
              {{ idea.name }}
            </option>
            <option :value="NEW_IDEA">A new idea…</option>
          </select>
        </template>
      </template>
    </template>
    <template v-if="dest.crossing ? otherDestination === NEW_IDEA : destination === NEW_IDEA">
      <label for="move-new-idea" class="text-sm font-medium">What's your core idea?</label>
      <input
        id="move-new-idea"
        v-model="newIdeaName"
        type="text"
        class="field field-compact !w-64 max-w-full"
        autocomplete="off"
        required
      />
      <Explain label="About the new idea">{{ newIdeaHint }}</Explain>
    </template>
    <p v-if="dest.makeIdea.isError" role="alert" class="w-full text-sm text-danger">
      {{ errorMessage(dest.makeIdea.error) }}
    </p>
  </div>
</template>
