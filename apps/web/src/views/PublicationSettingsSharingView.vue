<script setup lang="ts">
import PublicationGate from '../components/PublicationGate.vue'
import PublicationInvitations from '../components/PublicationInvitations.vue'
import PublicationPeople from '../components/PublicationPeople.vue'
import StepHeading from '../components/StepHeading.vue'
import { useSessionStore } from '../stores/session'

defineProps<{ publicationId: string }>()
const session = useSessionStore()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Sharing</StepHeading>
      <div class="space-y-10">
        <section aria-labelledby="people-heading">
          <h2 id="people-heading" class="mb-3 font-display text-xl font-semibold">People</h2>
          <PublicationPeople :publication="publication" />
        </section>
        <section v-if="publication.role === 'owner'" aria-labelledby="invitations-heading">
          <h2 id="invitations-heading" class="mb-3 font-display text-xl font-semibold">
            Invitations
          </h2>
          <PublicationInvitations
            :publication-id="publication.id"
            :confirmed="session.user?.emailVerified ?? false"
          />
        </section>
      </div>
    </div>
  </PublicationGate>
</template>
