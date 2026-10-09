<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TextAreaField from '../components/TextAreaField.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'

const props = defineProps<{ profileId: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const name = ref('')
const notes = ref('')

const create = useMutation({
  mutationFn: () => api.createIdea(props.profileId, { name: name.value, notes: notes.value }),
  onSuccess: async (idea) => {
    await queryClient.invalidateQueries({ queryKey: ['ideas'] })
    await router.push({ name: 'idea', params: { profileId: props.profileId, id: idea.id } })
  },
})
</script>

<template>
  <section aria-labelledby="new-idea-heading" class="max-w-xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'profile', params: { profileId } }" class="underline">
        ← Back to the profile
      </RouterLink>
    </p>
    <h1 id="new-idea-heading" class="mb-1 font-serif text-2xl font-semibold">New idea</h1>
    <p class="mb-6 text-stone-700">
      Capture it while it's fresh. You can add links, brainstorm and start drafts afterwards.
    </p>

    <form @submit.prevent="create.mutate()">
      <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
      <TextAreaField v-model="notes" label="Expand on your idea here" :rows="8" />

      <p v-if="create.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(create.error.value) }}
      </p>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          :disabled="create.isPending.value"
        >
          {{ create.isPending.value ? 'Saving…' : 'Save idea' }}
        </button>
        <RouterLink :to="{ name: 'profile', params: { profileId } }" class="text-sm underline">
          Cancel
        </RouterLink>
      </div>
    </form>
  </section>
</template>
