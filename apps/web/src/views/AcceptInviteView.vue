<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
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
  onSuccess: async ({ profileId }) => {
    // Their sign-in may have just been confirmed by the invitation, and they have a new profile.
    session.set(await api.me())
    await queryClient.invalidateQueries({ queryKey: ['profiles'] })
    await router.push({ name: 'profile', params: { profileId } })
  },
})

/** Where to come back to after signing in or registering. */
const here = computed(() => `/accept-invite?token=${encodeURIComponent(token)}`)
const invitedEmail = computed(() => preview.data.value?.email ?? '')
const wrongAccount = computed(() => !!session.user && session.user.email !== invitedEmail.value)
const invalid = computed(
  () => !token || (preview.isError.value && preview.error.value instanceof ApiError),
)
</script>

<template>
  <AuthCard title="You're invited">
    <p v-if="invalid" role="alert" class="text-red-700">
      This invitation is invalid or has expired. Ask the person who invited you to send a new one.
    </p>
    <p v-else-if="preview.isError.value" role="alert" class="text-red-700">
      We couldn't check this invitation. Please try again.
    </p>
    <p v-else-if="preview.isPending.value">Checking your invitation…</p>

    <template v-else-if="preview.data.value">
      <p>
        <strong>{{ preview.data.value.inviterName }}</strong> has invited you to write together on
        <strong>{{ preview.data.value.profileName }}</strong
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
            class="rounded bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Create an account
          </RouterLink>
          <RouterLink
            :to="{ name: 'login', query: { email: invitedEmail, next: here } }"
            class="rounded border border-accent px-4 py-2 text-sm font-medium text-accent"
          >
            I already have one
          </RouterLink>
        </div>
      </template>

      <!-- Signed in as someone else -->
      <p v-else-if="wrongAccount" role="alert" class="mt-3 text-sm text-red-700">
        This invitation was sent to <strong>{{ invitedEmail }}</strong
        >, but you're signed in as {{ session.user.email }}. Sign out, then sign in or sign up with
        the invited address.
      </p>

      <!-- Signed in as the invitee -->
      <template v-else>
        <button
          type="button"
          class="mt-4 rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          :disabled="accept.isPending.value"
          @click="accept.mutate()"
        >
          Join {{ preview.data.value.profileName }}
        </button>
        <p v-if="accept.isError.value" role="alert" class="mt-3 text-sm text-red-700">
          {{ errorMessage(accept.error.value) }}
        </p>
      </template>
      <p class="mt-6 text-sm text-stone-600">
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
