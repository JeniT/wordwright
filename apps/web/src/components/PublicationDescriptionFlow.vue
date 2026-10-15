<script setup lang="ts">
import { PUBLICATION_DESCRIPTION_MAX, type Publication } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionGuidance from './DescriptionGuidance.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'

/**
 * Describing a publication: guidance on what a description needs, and a box to write it in. The writer's own words are the
 * only source of a description.
 */
const props = defineProps<{ publication: Publication }>()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['publications'] })
const toPublication = () =>
  router.push({ name: 'publication', params: { publicationId: props.publication.id } })

const text = useSavedValue(() => props.publication.description ?? '', '')

const tooLong = computed(() => text.value.length > PUBLICATION_DESCRIPTION_MAX)

const accept = useMutation({
  mutationFn: () =>
    api.setPublicationDescription(props.publication.id, { description: text.value }),
  onSuccess: async () => {
    await refresh()
    await toPublication()
  },
})
</script>

<template>
  <div>
    <section aria-labelledby="publication-description-heading">
      <h2 id="publication-description-heading" class="mb-2 font-display text-xl font-semibold">
        The description
      </h2>
      <DescriptionGuidance class="mb-4" open />
      <form @submit.prevent="accept.mutate()">
        <DescriptionEditor
          v-model="text"
          label="About this publication"
          hint="What the publication is, who reads it and what kinds of writing go here. The notes above say more."
        />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="accept.isPending.value || !text.trim() || tooLong"
          >
            {{ accept.isPending.value ? 'Saving…' : 'Save description' }}
          </button>
          <RouterLink
            :to="{ name: 'publication', params: { publicationId: publication.id } }"
            class="link text-sm"
          >
            {{ publication.description ? 'Cancel' : 'Skip for now' }}
          </RouterLink>
        </div>
        <SaveStatus :mutation="accept" saved="" class="mt-2" />
      </form>
    </section>
  </div>
</template>
