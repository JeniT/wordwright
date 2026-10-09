<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { useApi } from '../lib/useApi'

const api = useApi()
const router = useRouter()
const queryClient = useQueryClient()

const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.listDrafts() })
const create = useMutation({
  mutationFn: () => api.createDraft({ title: 'Untitled' }),
  onSuccess: async (draft) => {
    await queryClient.invalidateQueries({ queryKey: ['drafts'] })
    await router.push({ name: 'draft', params: { id: draft.id } })
  },
})
</script>

<template>
  <section>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif text-2xl font-semibold">Your drafts</h1>
      <button
        type="button"
        class="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :disabled="create.isPending.value"
        @click="create.mutate()"
      >
        New draft
      </button>
    </div>

    <p v-if="drafts.isPending.value">Loading…</p>
    <p v-else-if="drafts.isError.value" role="alert" class="text-red-700">Couldn't load drafts.</p>
    <p v-else-if="!drafts.data.value?.length" class="text-stone-600">
      Nothing here yet. Start a new draft to begin.
    </p>
    <ul v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
      <li v-for="draft in drafts.data.value" :key="draft.id">
        <RouterLink
          :to="{ name: 'draft', params: { id: draft.id } }"
          class="flex items-baseline justify-between px-4 py-3 hover:bg-stone-50"
        >
          <span class="font-serif text-lg">{{ draft.title || 'Untitled' }}</span>
          <time class="text-sm text-stone-600" :datetime="draft.updatedAt">
            {{ new Date(draft.updatedAt).toLocaleDateString() }}
          </time>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
