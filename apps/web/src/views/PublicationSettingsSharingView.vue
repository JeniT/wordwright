<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import HeadingRow from '../components/HeadingRow.vue'
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
          <HeadingRow label="About owners">
            <h2 id="people-heading" class="font-display text-xl font-semibold">People</h2>
            <!-- Only worth saying when there is someone else to say it about. -->
            <template
              v-if="publication.role === 'owner' && publication.members.length > 1"
              #explain
            >
              Owners can also {{ OWNER_ABILITIES_TEXT }}.
            </template>
          </HeadingRow>
          <PublicationPeople :publication="publication" />
        </section>
        <section v-if="publication.role === 'owner'" aria-labelledby="invitations-heading">
          <HeadingRow label="About members">
            <h2 id="invitations-heading" class="font-display text-xl font-semibold">Invitations</h2>
            <template v-if="session.user?.emailVerified" #explain>
              Members can {{ MEMBER_ABILITIES_TEXT }}.
            </template>
          </HeadingRow>
          <PublicationInvitations
            :publication-id="publication.id"
            :confirmed="session.user?.emailVerified ?? false"
          />
        </section>
      </div>
      <NextStep />
    </div>
  </PublicationGate>
</template>
