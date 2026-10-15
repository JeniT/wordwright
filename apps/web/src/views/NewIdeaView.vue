<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TextAreaField from '../components/TextAreaField.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'

const props = defineProps<{ publicationId: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const name = ref('')
const notes = ref('')

const create = useMutation({
  mutationFn: () => api.createIdea(props.publicationId, { name: name.value, notes: notes.value }),
  onSuccess: async (idea) => {
    await invalidateRoots(queryClient, 'ideas')
    await router.push({ name: 'idea', params: { publicationId: props.publicationId, id: idea.id } })
  },
})
</script>

<template>
  <section aria-labelledby="new-idea-heading" class="max-w-xl">
    <h1 id="new-idea-heading" class="mb-1 font-display text-2xl font-semibold">New idea</h1>
    <p class="mb-6 text-ink-soft">
      Capture it while it's fresh. You can add links, brainstorm and start drafts afterwards.
    </p>

    <form @submit.prevent="create.mutate()">
      <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
      <TextAreaField v-model="notes" label="Expand on your idea here" :rows="8" />

      <p v-if="create.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(create.error.value) }}
      </p>
      <div class="flex items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="create.isPending.value">
          {{ create.isPending.value ? 'Saving…' : 'Save idea' }}
        </button>
        <RouterLink
          :to="{ name: 'publication-ideas', params: { publicationId } }"
          class="link text-sm"
        >
          Cancel
        </RouterLink>
      </div>
    </form>
  </section>
</template>
