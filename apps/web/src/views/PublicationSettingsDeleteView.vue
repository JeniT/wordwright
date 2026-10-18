<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, watchEffect } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DangerZone from '../components/DangerZone.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { api, errorMessage } from '../lib/api'
import { usePublication } from '../lib/usePublications'

const props = defineProps<{ publicationId: string }>()
const router = useRouter()
const queryClient = useQueryClient()
const { publication } = usePublication(() => props.publicationId)

// Only owners can delete. A member who types the address is sent to the first page that is theirs instead.
watchEffect(() => {
  if (publication.value && publication.value.role !== 'owner')
    void router.replace({
      name: 'publication-settings-description',
      params: { publicationId: props.publicationId },
    })
})

const confirmingDelete = ref(false)
const deletePublication = useMutation({
  mutationFn: () => api.deletePublication(props.publicationId),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: ['drafts'] })
    await queryClient.invalidateQueries({ queryKey: ['publications'] })
    await router.push('/')
  },
  onSettled: () => (confirmingDelete.value = false),
})
</script>

<template>
  <PublicationGate v-slot="{ publication: current }" :publication-id="publicationId">
    <div v-if="current.role === 'owner'" class="max-w-xl">
      <StepHeading>Delete publication</StepHeading>
      <DangerZone
        title="Delete publication"
        hide-title
        :error="
          deletePublication.isError.value ? errorMessage(deletePublication.error.value) : undefined
        "
      >
        <p class="mb-3">
          This permanently deletes the publication and all its drafts, for everyone it's shared
          with.
          <RouterLink
            :to="{ name: 'publication-settings-download', params: { publicationId } }"
            class="underline"
            >Download your writing</RouterLink
          >
          first.
        </p>
        <template #action>
          <button type="button" class="btn btn-danger-solid" @click="confirmingDelete = true">
            Delete publication
          </button>
        </template>
      </DangerZone>

      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete this publication?"
        confirm-label="Delete publication"
        busy-label="Deleting…"
        :busy="deletePublication.isPending.value"
        @confirm="deletePublication.mutate()"
        @cancel="confirmingDelete = false"
      >
        “{{ current.name }}” and all its drafts will be deleted for everyone who shares it. This
        can't be undone.
      </ConfirmDialog>
    </div>
  </PublicationGate>
</template>
