<script setup lang="ts">
import Explain from '../components/Explain.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationDescriptionFlow from '../components/PublicationDescriptionFlow.vue'

/** Describe a publication: a box to write it in, and a link to advice on what it needs. Optional; reachable from the publication. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <section aria-labelledby="describe-heading" class="max-w-xl">
      <h1 id="describe-heading" class="mb-1 font-display text-2xl font-semibold">
        Describe this publication
      </h1>
      <Explain tutorial-only class="mb-6">
        Your description is shown at the top of the publication and given to your AI, so it knows
        what you are writing for.
      </Explain>
      <PublicationDescriptionFlow :key="publication.id" :publication="publication" />
    </section>
  </PublicationGate>
</template>
