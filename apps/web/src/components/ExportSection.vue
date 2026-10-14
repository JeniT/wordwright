<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { api } from '../lib/api'
import { saveFile } from '../lib/download'
import SaveStatus from './SaveStatus.vue'

/** Everything of the person's own, as Markdown: all their profiles (the account page) or just one (its settings). */
const props = defineProps<{ profile?: { id: string; role: 'owner' | 'member' } }>()

const download = useMutation({
  mutationFn: () => (props.profile ? api.exportProfile(props.profile.id) : api.exportAccount()),
  onSuccess: ({ blob, filename }) => saveFile(blob, filename),
})
</script>

<template>
  <section id="download" aria-labelledby="download-heading">
    <h2 id="download-heading" class="mb-1 font-display text-xl font-semibold">
      Download your writing
    </h2>
    <p v-if="!profile" class="mb-3 text-sm text-ink-soft">
      Everything you have written in your profiles, as a zip of Markdown files: ideas, notes,
      reading lists and drafts. As an owner you get every draft in a profile; as a member, the
      drafts you edit or started. Comments, reviews, brainstorming conversations and API keys are
      not included.
    </p>
    <p v-else-if="profile.role === 'owner'" class="mb-3 text-sm text-ink-soft">
      This profile as a zip of Markdown files: its ideas, notes, reading lists and drafts. As an
      owner you get every draft in this profile, including other members' drafts.
    </p>
    <p v-else class="mb-3 text-sm text-ink-soft">
      This profile as a zip of Markdown files: its ideas, notes, reading lists and the drafts you
      edit or started. Other members' drafts are theirs to download.
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="btn btn-outline"
        :disabled="download.isPending.value"
        @click="download.mutate()"
      >
        {{ download.isPending.value ? 'Preparing…' : 'Download as a zip' }}
      </button>
      <SaveStatus :mutation="download" saved="Downloaded" />
    </div>
  </section>
</template>
