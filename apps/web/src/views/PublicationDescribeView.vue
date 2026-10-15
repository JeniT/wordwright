<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationDescriptionFlow from '../components/PublicationDescriptionFlow.vue'

/** Describe a publication: guidance on what a description needs, and a box to write it in. Optional; reachable from the publication. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <section aria-labelledby="describe-heading" class="max-w-xl">
      <p class="mb-2 text-sm">
        <RouterLink
          :to="{ name: 'publication', params: { publicationId: publication.id } }"
          class="underline"
        >
          ← {{ publication.name }}
        </RouterLink>
      </p>
      <h1 id="describe-heading" class="mb-1 font-display text-2xl font-semibold">
        Describe this publication
      </h1>
      <p class="mb-6 text-ink-soft">
        What it is, who reads it and what kinds of writing go there. It is shown at the top of the
        publication and helps the assistants understand what you are writing for. You write it
        yourself, and you can skip this and come back to it.
      </p>
      <PublicationDescriptionFlow :key="publication.id" :publication="publication" />
    </section>
  </PublicationGate>
</template>
