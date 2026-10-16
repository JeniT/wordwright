<script setup lang="ts">
import { computed } from 'vue'
import { usePublication } from '../lib/usePublications'

const props = defineProps<{ publicationId: string }>()
const { publication } = usePublication(() => props.publicationId)
/** Only when someone else can read the thread; a publication of one is private and needs no warning. */
const shared = computed(() => (publication.value?.members.length ?? 0) > 1)
</script>

<template>
  <div v-if="shared" class="callout mb-4 text-sm" data-testid="shared-thread-notice">
    <p class="mb-1 font-medium">This conversation is shared</p>
    <p>
      Everyone in this publication can read it. What is written here is sent to the AI provider of
      whoever sends the message, and that includes the earlier messages and notes by other members,
      because the whole conversation is sent each time.
    </p>
    <p class="mt-1">To think privately, use a publication with no other members.</p>
  </div>
</template>
