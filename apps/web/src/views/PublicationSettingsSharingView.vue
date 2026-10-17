<script setup lang="ts">
import Explain from '../components/Explain.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationInvitations from '../components/PublicationInvitations.vue'
import PublicationPeople from '../components/PublicationPeople.vue'
import StepHeading from '../components/StepHeading.vue'
import { MEMBER_ABILITIES_TEXT, OWNER_ABILITIES_TEXT } from '../lib/publication-roles'
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
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="people-heading" class="font-display text-xl font-semibold">People</h2>
            <!-- Only worth saying when there is someone else to say it about. -->
            <Explain v-if="publication.members.length > 1" label="About owners">
              Owners can also {{ OWNER_ABILITIES_TEXT }}.
            </Explain>
          </div>
          <PublicationPeople :publication="publication" />
        </section>
        <section v-if="publication.role === 'owner'" aria-labelledby="invitations-heading">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="invitations-heading" class="font-display text-xl font-semibold">Invitations</h2>
            <Explain v-if="session.user?.emailVerified" label="About members"
              >Members can {{ MEMBER_ABILITIES_TEXT }}.</Explain
            >
          </div>
          <PublicationInvitations
            :publication-id="publication.id"
            :confirmed="session.user?.emailVerified ?? false"
          />
        </section>
      </div>
    </div>
  </PublicationGate>
</template>
