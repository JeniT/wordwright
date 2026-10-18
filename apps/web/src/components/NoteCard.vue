<script setup lang="ts">
import type { IdeaLink, IdeaNote } from '@wordwright/core'
import { noteOriginPhrase } from '../lib/note-label'
import NoteOrigin from './NoteOrigin.vue'
import NoteTags from './NoteTags.vue'
import NoteText from './NoteText.vue'

/**
 * A note as it is read: its text and tags, with where it came from beside it (under the text on a phone). The Notes
 * step puts the origin under its row buttons instead (`hideOrigin`), and the landing page shares the rest.
 */
defineProps<{ note: IdeaNote; readingList: readonly IdeaLink[]; hideOrigin?: boolean }>()
defineSlots<{ tags?(): unknown }>()
</script>

<template>
  <div class="flex min-w-[12rem] flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-1">
    <div class="min-w-[12rem] flex-1">
      <NoteText :note="note" />
      <!-- Read-only tags by default; the Notes step puts the tag editor here. -->
      <slot name="tags"><NoteTags :tags="note.tags" /></slot>
    </div>
    <p v-if="!hideOrigin" class="meta max-w-full sm:max-w-[16rem] sm:text-right">
      <NoteOrigin
        :phrase="noteOriginPhrase(note, readingList)"
        :author-name="note.authorName"
        class="sm:justify-end"
      />
    </p>
  </div>
</template>
