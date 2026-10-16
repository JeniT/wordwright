<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { api } from '../lib/api'
import { saveFile } from '../lib/download'
import InfoTip from './InfoTip.vue'
import SaveStatus from './SaveStatus.vue'

/** Everything of the person's own, as Markdown: all their publications (the account page) or just one (its settings). */
const props = defineProps<{ publication?: { id: string; role: 'owner' | 'member' } }>()

const download = useMutation({
  mutationFn: () =>
    props.publication ? api.exportPublication(props.publication.id) : api.exportAccount(),
  onSuccess: ({ blob, filename }) => saveFile(blob, filename),
})
</script>

<template>
  <section
    id="download"
    :aria-labelledby="publication ? 'download-heading' : undefined"
    :aria-label="publication ? undefined : 'Download your writing'"
  >
    <h2 v-if="publication" id="download-heading" class="mb-1 font-display text-xl font-semibold">
      Download your writing
    </h2>
    <div v-if="!publication" class="mb-3 flex items-start gap-2">
      <p class="text-sm text-ink-soft">
        A zip of Markdown files: your ideas, notes, reading lists and drafts. Comments, reviews,
        brainstorming and keys aren't included.
      </p>
      <InfoTip label="About what you get"
        >Owners get every draft in a publication. Members get the drafts they edit or
        started.</InfoTip
      >
    </div>
    <p v-else-if="publication.role === 'owner'" class="mb-3 text-sm text-ink-soft">
      This publication as a zip of Markdown files: its ideas, notes, reading lists and drafts. As an
      owner you get every draft in this publication, including other members' drafts.
    </p>
    <p v-else class="mb-3 text-sm text-ink-soft">
      This publication as a zip of Markdown files: its ideas, notes, reading lists and the drafts
      you edit or started. Other members' drafts are theirs to download.
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
