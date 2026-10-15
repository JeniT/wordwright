<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Publication } from '@lfwa/core'
import { usePublication } from '../lib/usePublications'

/** Loading, error and not-found states for any page about one publication; the page itself is the slot. */
const props = defineProps<{ publicationId: string }>()
defineSlots<{ default(props: { publication: Publication }): unknown }>()
const { publications, publication } = usePublication(() => props.publicationId)
</script>

<template>
  <p v-if="publications.isPending.value">Loading…</p>
  <p v-else-if="publications.isError.value" role="alert" class="text-danger">
    We couldn't load this publication. Check your connection and try again.
  </p>
  <div v-else-if="!publication" role="alert" class="panel p-6">
    <h1 class="text-lg font-semibold">We couldn't find that publication</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or it may belong to someone who hasn't shared it with you.
    </p>
    <RouterLink to="/" class="link mt-3 inline-block">Back to your publications</RouterLink>
  </div>
  <slot v-else :publication="publication" />
</template>
