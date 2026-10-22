<script setup lang="ts">
import { PUBLICATION_DESCRIPTION_MAX, type Publication } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import NewTabLink from './NewTabLink.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'

/** Everyone who works in the publication can write this, so there is no owner-only branch (the page says what it is for). */
const props = defineProps<{ publication: Publication }>()
const queryClient = useQueryClient()
const helpPath = '/help/description'

const text = useSavedValue(() => props.publication.description ?? '', '')
const unsaved = computed(() => text.value !== (props.publication.description ?? ''))
// Over the limit is the one reason Save waits besides having nothing to save, and the editor says so beside the box.
const tooLong = computed(() => text.value.length > PUBLICATION_DESCRIPTION_MAX)

const save = useMutation({
  mutationFn: () =>
    api.setPublicationDescription(props.publication.id, { description: text.value }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['publications'] }),
})
</script>

<template>
  <div>
    <form @submit.prevent="save.mutate()">
      <DescriptionEditor v-model="text" label="Description" hide-label>
        <template #hint>
          This description is passed to your AI as context for your writing.
          <NewTabLink :to="helpPath" class="link">See what makes a useful description.</NewTabLink>
        </template>
      </DescriptionEditor>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || tooLong || !unsaved"
        >
          {{ save.isPending.value ? 'Saving…' : 'Save description' }}
        </button>
        <SaveStatus :mutation="save" :unsaved="unsaved" class="basis-full" />
      </div>
    </form>
  </div>
</template>
