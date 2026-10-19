<script setup lang="ts">
import { computed } from 'vue'
import { usePublication } from '../lib/usePublications'

const props = defineProps<{ publicationId: string }>()
const { publication } = usePublication(() => props.publicationId)
/** Only when someone else can read the thread; a publication of one is private and needs no warning. */
const shared = computed(() => (publication.value?.members.length ?? 0) > 1)
</script>

<template>
  <div v-if="shared" class="callout mb-4" data-testid="shared-thread-notice">
    <p class="mb-1 font-medium">This conversation is shared</p>
    <p>
      Everyone in this publication can read this conversation. It’s sent to the AI provider of
      whoever writes each message. To think privately, use a publication with no other members.
    </p>
  </div>
</template>
