<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { ApiError, api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const session = useSessionStore()
const token = typeof route.query.token === 'string' ? route.query.token : ''

const preview = useQuery({
  queryKey: ['invitation', token],
  queryFn: () => api.previewInvitation(token),
  enabled: !!token,
  retry: false,
})

const accept = useMutation({
  mutationFn: () => api.acceptInvitation(token),
  onSuccess: async ({ publicationId }) => {
    // Their sign-in may have just been confirmed by the invitation, and they have a new publication.
    session.set(await api.me())
    await queryClient.invalidateQueries({ queryKey: ['publications'] })
    await router.push({ name: 'publication', params: { publicationId } })
  },
})

/**
 * Where to come back to after signing in or registering. `join=1` says they came through the sign-in or sign-up
 * this page sent them to, so they are joined at once; someone who was already signed in still presses the button.
 */
const here = computed(() => `/accept-invite?token=${encodeURIComponent(token)}&join=1`)
const cameFromSignIn = route.query.join === '1'
const invitedEmail = computed(() => preview.data.value?.email ?? '')
const wrongAccount = computed(() => !!session.user && session.user.email !== invitedEmail.value)
const invalid = computed(
  () => !token || (preview.isError.value && preview.error.value instanceof ApiError),
)
// Joins once the invitation has loaded and they are signed in as the person it was sent to. A failure leaves the
// button below, with the reason, so they can try again.
watch(
  () => [preview.data.value, session.user] as const,
  () => {
    if (
      cameFromSignIn &&
      preview.data.value &&
      !wrongAccount.value &&
      session.user &&
      accept.isIdle.value
    ) {
      accept.mutate()
    }
  },
  { immediate: true },
)
</script>

<template>
  <AuthCard title="You're invited">
    <p v-if="invalid" role="alert" class="text-danger">
      This invitation is invalid or has expired. Ask the person who invited you to send a new one.
    </p>
    <p v-else-if="preview.isError.value" role="alert" class="text-danger">
      We couldn't check this invitation. Please try again.
    </p>
    <p v-else-if="preview.isPending.value">Checking your invitation…</p>

    <template v-else-if="preview.data.value">
      <p>
        <strong>{{ preview.data.value.inviterName }}</strong> has invited you to write together on
        <strong>{{ preview.data.value.publicationName }}</strong
        >.
      </p>

      <!-- Signed out: sign in or sign up with the invited address -->
      <template v-if="!session.user">
        <p class="mt-3 text-sm">
          Use the email address this was sent to (<strong>{{ invitedEmail }}</strong
          >).
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <RouterLink
            :to="{ name: 'register', query: { email: invitedEmail, next: here } }"
            class="btn btn-primary"
          >
            Create an account
          </RouterLink>
          <RouterLink
            :to="{ name: 'login', query: { email: invitedEmail, next: here } }"
            class="btn btn-outline"
          >
            I already have one
          </RouterLink>
        </div>
      </template>

      <!-- Signed in as someone else -->
      <p v-else-if="wrongAccount" role="alert" class="mt-3 text-sm text-danger">
        This invitation was sent to <strong>{{ invitedEmail }}</strong
        >, but you're signed in as {{ session.user.email }}. Sign out, then sign in or sign up with
        the invited address.
      </p>

      <!-- Signed in as the invitee -->
      <template v-else>
        <button
          type="button"
          class="mt-4 btn btn-primary"
          :disabled="accept.isPending.value"
          @click="accept.mutate()"
        >
          Join {{ preview.data.value.publicationName }}
        </button>
        <p v-if="accept.isError.value" role="alert" class="mt-3 text-sm text-danger">
          {{ errorMessage(accept.error.value) }}
        </p>
      </template>
      <p class="mt-6 text-sm text-ink-soft">
        Not for you?
        <RouterLink
          :to="{ name: 'decline-invite', query: { token } }"
          class="text-accent underline"
        >
          Decline, or stop invitations
        </RouterLink>
      </p>
    </template>
  </AuthCard>
</template>
