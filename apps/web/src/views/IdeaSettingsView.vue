<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DangerZone from '../components/DangerZone.vue'
import IdeaGate from '../components/IdeaGate.vue'
import StepHeading from '../components/StepHeading.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys, useIdea } from '../lib/queries'

/** An idea's settings: its name, and deleting it. */
const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useIdea(
  () => props.profileId,
  () => props.id,
)

// Fill the form once per idea. Later refreshes must not wipe unsaved typing.
const name = ref('')
let filledFor = ''
watch(
  () => idea.data.value,
  (loaded) => {
    if (loaded && filledFor !== loaded.id) {
      filledFor = loaded.id
      name.value = loaded.name
    }
  },
  { immediate: true },
)

const refreshLists = () => invalidateRoots(queryClient, 'ideas')

const save = useMutation({
  mutationFn: () => api.updateIdea(props.profileId, props.id, { name: name.value }),
  onSuccess: (saved) => {
    queryClient.setQueryData(queryKeys.idea(props.profileId, props.id), saved)
    return refreshLists()
  },
})

const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteIdea(props.profileId, props.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: queryKeys.idea(props.profileId, props.id) })
    await refreshLists()
    await router.push({ name: 'profile-ideas', params: { profileId: props.profileId } })
  },
  onSettled: () => (confirmingDelete.value = false),
})
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea: loaded }" :profile-id="profileId">
    <StepHeading>Idea settings</StepHeading>

    <form class="mb-10" @submit.prevent="save.mutate()">
      <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
      <div class="flex items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value">Save</button>
        <p role="status" class="meta">
          <template v-if="save.isPending.value">Saving…</template>
          <template v-else-if="save.isSuccess.value">Saved</template>
        </p>
      </div>
      <p v-if="save.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(save.error.value) }}
      </p>
    </form>

    <DangerZone
      title="Delete this idea"
      :error="remove.isError.value ? errorMessage(remove.error.value) : undefined"
    >
      <p class="mb-3 text-sm">
        This permanently deletes the idea, its links and
        {{ loaded.drafts.length ? 'all its drafts' : 'any drafts' }}.
      </p>
      <template #action>
        <button type="button" class="btn btn-danger-solid" @click="confirmingDelete = true">
          Delete idea
        </button>
      </template>
    </DangerZone>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this idea?"
      confirm-label="Yes, delete it"
      busy-label="Deleting…"
      :busy="remove.isPending.value"
      @confirm="remove.mutate()"
      @cancel="confirmingDelete = false"
    >
      “{{ loaded.name }}” will be deleted along with its links and drafts. This can't be undone.
    </ConfirmDialog>
  </IdeaGate>
</template>
