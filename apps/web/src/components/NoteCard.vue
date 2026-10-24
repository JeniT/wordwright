<script setup lang="ts">
import type { Article, IdeaNote } from '@wordwright/core'
import type { RouteLocationRaw } from 'vue-router'
import { noteOrigin } from '../lib/note-label'
import { useSessionStore } from '../stores/session'
import NoteOrigin from './NoteOrigin.vue'
import NoteTags from './NoteTags.vue'
import NoteText from './NoteText.vue'

/**
 * A note as it is read: its text and tags, with where it came from beside it (under the text on a phone). The Note
 * step puts the origin under its row buttons instead (`hideOrigin`), and the landing page shares the rest.
 */
const session = useSessionStore()

const { refineTo = null } = defineProps<{
  note: IdeaNote
  articleList: readonly Article[]
  hideOrigin?: boolean
  /** The idea's Refine page, which a note from a conversation links to. */
  refineTo?: RouteLocationRaw | null
}>()
defineSlots<{ tags?(): unknown }>()
</script>

<template>
  <div class="flex min-w-[12rem] flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-1">
    <div class="min-w-[12rem] flex-1">
      <NoteText :note="note" />
      <!-- Read-only tags by default; the Note step puts the tag editor here. -->
      <slot name="tags"><NoteTags :tags="note.tags" /></slot>
    </div>
    <p v-if="!hideOrigin" class="meta max-w-full sm:max-w-[16rem] sm:text-right">
      <NoteOrigin
        v-bind="noteOrigin(note, articleList, session.user?.id ?? null, refineTo)"
        :author-name="note.authorName"
        class="sm:items-end"
      />
    </p>
  </div>
</template>
