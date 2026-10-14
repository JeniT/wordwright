<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import type { IdeaLink } from '@lfwa/core'
import { errorMessage } from '../lib/api'

const props = defineProps<{
  readingList: readonly IdeaLink[]
  /** Puts a link to the item in the draft (asking first if it isn't marked read); rejects with a message if it fails. */
  insertLink: (item: IdeaLink) => Promise<void>
  /** The draft's editor, when that is not the person looking: only they can put links in the draft. */
  onlyEditor?: string
}>()

const inserting = useMutation({ mutationFn: (item: IdeaLink) => props.insertLink(item) })
const label = (item: IdeaLink) => item.title || item.url
</script>

<template>
  <section aria-labelledby="draft-reading-heading">
    <!-- The tab beside the draft already says "Reading list"; the heading is for screen readers moving by headings. -->
    <h2 id="draft-reading-heading" class="sr-only">Reading list</h2>
    <p v-if="onlyEditor" class="mb-3 text-sm text-ink-soft">
      Only {{ onlyEditor }}, the draft's editor, can put links in the draft.
    </p>
    <p v-else class="mb-3 text-sm text-ink-soft">
      Put a link to something you have read in the line you are writing. Anything you haven't marked
      as read, you'll be asked about first.
    </p>
    <p v-if="!readingList.length" class="text-ink-soft">Nothing on the reading list yet.</p>
    <ul v-else class="space-y-2">
      <li
        v-for="item in readingList"
        :key="item.id"
        class="rounded-ctl border border-line bg-surface p-3"
      >
        <p class="break-words">{{ label(item) }}</p>
        <p class="text-xs text-ink-soft">{{ item.readAt ? 'Read' : 'Not marked as read' }}</p>
        <button
          v-if="!onlyEditor"
          type="button"
          class="btn btn-sm btn-outline mt-2"
          :disabled="inserting.isPending.value"
          :aria-label="`Insert a link to ${label(item)}`"
          @click="inserting.mutate(item)"
        >
          Insert link
        </button>
      </li>
    </ul>
    <p v-if="inserting.isError.value" role="alert" class="mt-2 text-danger">
      {{ errorMessage(inserting.error.value) }}
    </p>
  </section>
</template>
