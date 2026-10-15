<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { invalidateRoots } from '../lib/queries'

/** Adds an untitled draft to an idea and opens it, for the Draft page and the idea's landing page. */
const props = defineProps<{ publicationId: string; ideaId: string; label?: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const addDraft = useMutation({
  mutationFn: () => api.createIdeaDraft(props.publicationId, props.ideaId, { title: 'Untitled' }),
  onSuccess: async (draft) => {
    await Promise.all([invalidateRoots(queryClient, 'idea'), invalidateRoots(queryClient, 'ideas')])
    await router.push({
      name: 'draft',
      params: { publicationId: props.publicationId, id: draft.id },
    })
  },
})
</script>

<template>
  <button
    type="button"
    class="btn btn-primary"
    :disabled="addDraft.isPending.value"
    @click="addDraft.mutate()"
  >
    {{ label ?? 'Add a draft' }}
  </button>
  <p v-if="addDraft.isError.value" role="alert" class="mt-2 w-full text-danger">
    Couldn't start a new draft. Please try again.
  </p>
</template>
