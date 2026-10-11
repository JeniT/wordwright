<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import IdeaGate from '../components/IdeaGate.vue'
import StepHeading from '../components/StepHeading.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useQuery } from '@tanstack/vue-query'

/** An idea's settings: its name, and deleting it. */
const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})

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

const refreshLists = () => queryClient.invalidateQueries({ queryKey: ['ideas'] })

const save = useMutation({
  mutationFn: () => api.updateIdea(props.profileId, props.id, { name: name.value }),
  onSuccess: (saved) => {
    queryClient.setQueryData(['idea', props.profileId, props.id], saved)
    return refreshLists()
  },
})

const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteIdea(props.profileId, props.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: ['idea', props.profileId, props.id] })
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

    <section
      aria-labelledby="delete-idea-heading"
      class="rounded-ctl border border-danger bg-surface p-4"
    >
      <h2 id="delete-idea-heading" class="mb-1 text-lg font-semibold text-danger">
        Delete this idea
      </h2>
      <p class="meta mb-3">
        This permanently deletes the idea, its links and
        {{ loaded.drafts.length ? 'all its drafts' : 'any drafts' }}.
      </p>
      <p v-if="remove.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(remove.error.value) }}
      </p>
      <button type="button" class="btn btn-danger" @click="confirmingDelete = true">
        Delete idea
      </button>
    </section>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this idea?"
      confirm-label="Yes, delete it"
      :busy="remove.isPending.value"
      @confirm="remove.mutate()"
      @cancel="confirmingDelete = false"
    >
      “{{ loaded.name }}” will be deleted along with its links and drafts. This can't be undone.
    </ConfirmDialog>
  </IdeaGate>
</template>
