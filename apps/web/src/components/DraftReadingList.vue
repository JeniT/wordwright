<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import type { IdeaLink } from '@wordwright/core'
import { errorMessage } from '../lib/api'
import { READING_DRAG_TYPE } from '../lib/note-drag'
import { nameList } from '../lib/note-label'
import DraftCard from './DraftCard.vue'
import Explain from './Explain.vue'

const props = defineProps<{
  publicationId: string
  ideaId: string
  readingList: readonly IdeaLink[]
  /** Puts a link to the item in the draft (asking first if it isn't marked read); rejects with a message if it fails. */
  insertLink: (item: IdeaLink) => Promise<void>
  /** The person may put links in the draft (only the draft's editor may). */
  canAdd: boolean
}>()

const inserting = useMutation({ mutationFn: (item: IdeaLink) => props.insertLink(item) })
const label = (item: IdeaLink) => item.title || item.url
</script>

<template>
  <section aria-labelledby="draft-reading-heading">
    <!-- The tab beside the draft already says "Reading list"; the heading is for screen readers moving by headings. -->
    <h2 id="draft-reading-heading" class="sr-only">Reading list</h2>
    <Explain tutorial-only class="mb-3">
      Add a link to something you have read, in the line you are writing.
    </Explain>
    <p v-if="!readingList.length" class="text-ink-soft">
      Nothing on the reading list yet.
      <RouterLink
        :to="{ name: 'idea-read', params: { publicationId, id: ideaId } }"
        class="underline"
      >
        Add to it on the idea page.
      </RouterLink>
    </p>
    <ul v-else aria-label="Reading items to add" class="space-y-2">
      <DraftCard
        v-for="item in readingList"
        :key="item.id"
        :can-add="canAdd"
        :drag="{ type: READING_DRAG_TYPE, id: item.id }"
        :label="`“${label(item)}”`"
        :add-name="`Add a link to “${label(item)}” to the draft`"
        :busy="inserting.isPending.value && inserting.variables.value?.id === item.id"
        @add="inserting.mutate(item)"
      >
        <p class="break-words">{{ label(item) }}</p>
        <p v-if="item.authors.length" class="text-xs text-ink-soft">
          by {{ nameList(item.authors) }}
        </p>
        <p v-if="!item.readAt" class="mt-1">
          <span class="chip chip-quiet">Not marked as read</span>
        </p>
      </DraftCard>
    </ul>
    <p v-if="inserting.isError.value" role="alert" class="mt-2 text-danger">
      {{ errorMessage(inserting.error.value) }}
    </p>
  </section>
</template>
