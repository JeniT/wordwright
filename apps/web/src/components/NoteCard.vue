<script setup lang="ts">
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { noteOriginPhrase } from '../lib/note-label'
import NoteOrigin from './NoteOrigin.vue'
import NoteTags from './NoteTags.vue'
import NoteText from './NoteText.vue'

/** A note as it is read: its text, tags, and where it came from. The Notes step and the landing pages share it. */
defineProps<{ note: IdeaNote; readingList: readonly IdeaLink[] }>()
defineSlots<{ tags?(): unknown }>()
</script>

<template>
  <div class="min-w-[12rem] flex-1">
    <NoteText :note="note" />
    <!-- Read-only tags by default; the Notes step puts the tag editor here. -->
    <slot name="tags"><NoteTags :tags="note.tags" /></slot>
    <p class="mt-1 text-xs text-ink-soft">
      <NoteOrigin :phrase="noteOriginPhrase(note, readingList)" :author-name="note.authorName" />
    </p>
  </div>
</template>
