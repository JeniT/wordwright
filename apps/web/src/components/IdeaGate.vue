<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import type { Idea } from '@lfwa/core'
import { api } from '../lib/api'

/** Loading and error states for any page about one idea; the page itself is the slot. */
const props = defineProps<{ profileId: string; id: string }>()
defineSlots<{ default(props: { idea: Idea }): unknown }>()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})
</script>

<template>
  <p v-if="idea.isPending.value">Loading…</p>
  <div v-else-if="idea.isError.value" role="alert" class="panel p-6">
    <h1 class="text-lg font-semibold">We couldn't open that idea</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or the connection may have dropped. Try reloading the page.
    </p>
    <RouterLink
      :to="{ name: 'profile-ideas', params: { profileId } }"
      class="link mt-3 inline-block"
    >
      Back to the profile
    </RouterLink>
  </div>
  <slot v-else-if="idea.data.value" :idea="idea.data.value" />
</template>
