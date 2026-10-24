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
  <section id="download" :aria-label="publication ? 'Download' : 'Download your writing'">
    <div class="mb-3 flex items-start gap-2">
      <p class="text-sm text-ink-soft">
        <template v-if="publication"
          >This publication as a zip of Markdown files: its ideas, notes, lists of articles and
          drafts. Comments, reviews and brainstorming aren't included.</template
        >
        <template v-else
          >A zip of Markdown files: your ideas, notes, lists of articles and drafts. Comments,
          reviews, brainstorming and keys aren't included.</template
        >
      </p>
      <InfoTip label="About what you get"
        >Owners get every draft{{ publication ? '' : ' in a publication' }}. Members get the drafts
        they edit or started.</InfoTip
      >
    </div>
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
