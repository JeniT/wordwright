<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DangerZone from '../components/DangerZone.vue'
import IdeaGate from '../components/IdeaGate.vue'
import StepHeading from '../components/StepHeading.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys, useIdea } from '../lib/queries'
import SaveStatus from '../components/SaveStatus.vue'
import { useSavedValue } from '../lib/forms'

/** An idea's settings: its name, and deleting it. */
const props = defineProps<{ publicationId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useIdea(
  () => props.publicationId,
  () => props.id,
)

// Fill the form once per idea. Later refreshes must not wipe unsaved typing.
const name = useSavedValue(
  () => idea.data.value?.name,
  '',
  () => idea.data.value?.id,
)

const refreshLists = () => invalidateRoots(queryClient, 'ideas')

const save = useMutation({
  mutationFn: () => api.updateIdea(props.publicationId, props.id, { name: name.value }),
  onSuccess: (saved) => {
    queryClient.setQueryData(queryKeys.idea(props.publicationId, props.id), saved)
    return refreshLists()
  },
})

const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteIdea(props.publicationId, props.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: queryKeys.idea(props.publicationId, props.id) })
    await refreshLists()
    await router.push({ name: 'publication', params: { publicationId: props.publicationId } })
  },
  onSettled: () => (confirmingDelete.value = false),
})
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea: loaded }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Idea settings</StepHeading>

      <form class="mb-10" @submit.prevent="save.mutate()">
        <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="save.isPending.value">
            {{ save.isPending.value ? 'Saving…' : 'Save idea' }}
          </button>
          <SaveStatus :mutation="save" class="basis-full" />
        </div>
      </form>

      <DangerZone
        title="Delete idea"
        :error="remove.isError.value ? errorMessage(remove.error.value) : undefined"
      >
        <p class="mb-3">
          This can’t be undone. Its notes, reading items and drafts go too.
          <RouterLink
            :to="{ name: 'publication-settings-download', params: { publicationId } }"
            class="underline"
            >Download your writing</RouterLink
          >
          first.
        </p>
        <template #action>
          <button type="button" class="btn btn-danger-solid" @click="confirmingDelete = true">
            Delete idea
          </button>
        </template>
      </DangerZone>

      <ConfirmDialog
        :open="confirmingDelete"
        :title="`Delete “${loaded.name}”?`"
        confirm-label="Delete idea"
        busy-label="Deleting…"
        :busy="remove.isPending.value"
        @confirm="remove.mutate()"
        @cancel="confirmingDelete = false"
      >
        This can’t be undone. Its notes, reading items and drafts go too.
      </ConfirmDialog>
    </div>
  </IdeaGate>
</template>
