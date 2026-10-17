<script setup lang="ts">
import { useMutation, useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { ApiError, api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const session = useSessionStore()
const token = typeof route.query.token === 'string' ? route.query.token : ''

const preview = useQuery({
  queryKey: ['invitation', token],
  queryFn: () => api.previewInvitation(token),
  enabled: !!token,
  retry: false,
})
const invalid = computed(
  () => !token || (preview.isError.value && preview.error.value instanceof ApiError),
)

type Choice = 'none' | 'sender' | 'all'
const choice = ref<Choice>('none')
// Declining needs a click, not just opening the link, so a mail scanner can't withdraw it.
const decline = useMutation({ mutationFn: () => api.declineInvitation(token, choice.value) })
// What was chosen when they submitted, for the confirmation message.
const done = ref<Choice>('none')
function submit() {
  done.value = choice.value
  decline.mutate()
}
</script>

<template>
  <AuthCard title="Decline an invitation">
    <p v-if="invalid && !decline.isSuccess.value" role="alert" class="text-danger">
      This invitation is no longer open: it may already be declined, accepted or expired. Nothing
      more is needed.
    </p>
    <p
      v-else-if="preview.isError.value && !decline.isSuccess.value"
      role="alert"
      class="text-danger"
    >
      We couldn't check this invitation. Please try again.
    </p>

    <template v-else-if="decline.isSuccess.value">
      <p role="status">
        <template v-if="done === 'all'">
          Declined. You won't receive invitations from anyone at this address.
        </template>
        <template v-else-if="done === 'sender'">
          Declined. You won't receive invitations from this person again.
        </template>
        <template v-else>Declined. The person who invited you isn't told.</template>
      </p>
      <p v-if="done !== 'none'" class="mt-3 text-sm">
        You can change this from your account page once you've signed in and confirmed your address.
      </p>
      <p class="mt-4 text-sm">
        <RouterLink :to="session.user ? '/' : '/login'" class="text-accent underline">
          {{ session.user ? 'Back to your publications' : 'Sign in' }}
        </RouterLink>
      </p>
    </template>

    <p v-else-if="preview.isPending.value">Checking your invitation…</p>

    <form v-else-if="preview.data.value" @submit.prevent="submit">
      <p>
        <strong>{{ preview.data.value.inviterName }}</strong> invited you to write together on
        <strong>{{ preview.data.value.publicationName }}</strong
        >. They won't be told that you declined.
      </p>
      <fieldset class="mt-4">
        <legend class="mb-2 text-sm font-medium">After declining</legend>
        <label class="mb-2 flex items-start gap-2 text-sm">
          <input v-model="choice" type="radio" name="block" value="none" />
          <span>Just decline this invitation</span>
        </label>
        <label class="mb-2 flex items-start gap-2 text-sm">
          <input v-model="choice" type="radio" name="block" value="sender" />
          <span>Also stop invitations from {{ preview.data.value.inviterName }}</span>
        </label>
        <label class="mb-2 flex items-start gap-2 text-sm">
          <input v-model="choice" type="radio" name="block" value="all" />
          <span>Stop invitations from everyone, to {{ preview.data.value.email }}</span>
        </label>
      </fieldset>
      <p v-if="decline.isError.value" role="alert" class="mt-3 text-sm text-danger">
        {{ errorMessage(decline.error.value) }}
      </p>
      <button type="submit" class="mt-4 btn btn-primary" :disabled="decline.isPending.value">
        Decline
      </button>
      <p class="mt-4 text-sm text-ink-soft">
        Changed your mind?
        <RouterLink :to="{ name: 'accept-invite', query: { token } }" class="text-accent underline">
          Back to the invitation
        </RouterLink>
      </p>
    </form>
  </AuthCard>
</template>
