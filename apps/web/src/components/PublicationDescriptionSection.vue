<script setup lang="ts">
import { PUBLICATION_DESCRIPTION_MAX, type Publication } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionGuidance from './DescriptionGuidance.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'

/** Everyone who works in the publication can write this, so there is no owner-only branch. */
const props = defineProps<{ publication: Publication }>()
const queryClient = useQueryClient()

const text = useSavedValue(() => props.publication.description ?? '', '')
const changed = computed(() => text.value.trim() !== (props.publication.description ?? ''))
const tooLong = computed(() => text.value.length > PUBLICATION_DESCRIPTION_MAX)

const save = useMutation({
  mutationFn: () =>
    api.setPublicationDescription(props.publication.id, { description: text.value }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['publications'] }),
})
</script>

<template>
  <section aria-labelledby="description-heading">
    <h2 id="description-heading" class="mb-3 font-display text-xl font-semibold">Description</h2>
    <p class="mb-3 text-sm text-ink-soft">
      What this publication is, who reads it, and what kinds of writing go here. It can be as short
      as “Personal weeknotes, mostly for me”. Everyone who shares this publication can change it,
      and it's the first thing people see on the publication page.
    </p>
    <DescriptionGuidance class="mb-4" />
    <form @submit.prevent="save.mutate()">
      <DescriptionEditor v-model="text" label="About this publication" />
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !changed || tooLong"
        >
          {{ save.isPending.value ? 'Saving…' : 'Save description' }}
        </button>
        <SaveStatus :mutation="save" class="basis-full" />
      </div>
    </form>
  </section>
</template>
