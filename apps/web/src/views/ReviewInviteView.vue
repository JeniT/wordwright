<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { ApiError, api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

/**
 * The page behind the emailed link asking someone to review a draft. It says what is being asked (one draft, read and
 * comment, nothing else), then lets a new person make a reviewer account with just a name and password, an existing
 * one sign in, or anyone decline (and stop such invitations).
 */
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const session = useSessionStore()
const token = typeof route.query.token === 'string' ? route.query.token : ''

const preview = useQuery({
  queryKey: ['review-invitation', token],
  queryFn: () => api.previewReviewInvitation(token),
  enabled: !!token,
  retry: false,
})
const invitedEmail = computed(() => preview.data.value?.email ?? '')
const here = computed(() => `/review-invite?token=${encodeURIComponent(token)}`)
const wrongAccount = computed(() => !!session.user && session.user.email !== invitedEmail.value)
const invalid = computed(
  () => !token || (preview.isError.value && preview.error.value instanceof ApiError),
)

const name = ref('')
const password = ref('')
const create = useMutation({
  mutationFn: () => api.registerReviewer({ token, name: name.value, password: password.value }),
  onSuccess: async (user) => {
    queryClient.clear()
    session.set(user)
    await router.push({ name: 'reviews' })
  },
})
const accept = useMutation({
  mutationFn: () => api.acceptReviewInvitation(token),
  onSuccess: async ({ reviewId }) => {
    await queryClient.invalidateQueries({ queryKey: ['reviews'] })
    await router.push({ name: 'review', params: { id: reviewId } })
  },
})

const block = ref<'none' | 'sender' | 'all'>('none')
const declined = ref(false)
const decline = useMutation({
  mutationFn: () => api.declineReviewInvitation(token, block.value),
  onSuccess: () => (declined.value = true),
})
</script>

<template>
  <AuthCard title="Can you read a draft?">
    <p v-if="declined" role="status">
      Thanks, we've let it go. Nothing was sent to {{ preview.data.value?.inviterName }}.
    </p>
    <p v-else-if="invalid" role="alert" class="text-danger">
      This invitation is invalid or has expired. Ask the person who invited you to send a new one.
    </p>
    <p v-else-if="preview.isError.value" role="alert" class="text-danger">
      We couldn't check this invitation. Please try again.
    </p>
    <p v-else-if="preview.isPending.value">Checking your invitation…</p>

    <template v-else-if="preview.data.value">
      <p>
        <strong>{{ preview.data.value.inviterName }}</strong> would like your comments on
        <strong>{{ preview.data.value.draftTitle || 'a draft' }}</strong> in
        {{ preview.data.value.publicationName }}.
      </p>
      <p class="mt-2 text-sm text-ink-soft">
        You will see that one draft and can write comments on it, and nothing else. Nobody sees your
        comments except you and the draft's editor. You can stop whenever you like.
      </p>

      <!-- Signed out: a new person makes a reviewer account; someone with an account signs in -->
      <template v-if="!session.user">
        <form class="mt-4" @submit.prevent="create.mutate()">
          <p class="mb-3 text-sm">
            Use the address this was sent to: <strong>{{ invitedEmail }}</strong
            >.
          </p>
          <TextField
            v-model="name"
            label="What should we call you?"
            autocomplete="given-name"
            required
          />
          <TextField
            v-model="password"
            label="Choose a password"
            type="password"
            autocomplete="new-password"
            hint="At least 8 characters."
            required
          />
          <p v-if="create.isError.value" role="alert" class="mb-3 text-sm text-danger">
            {{ errorMessage(create.error.value) }}
          </p>
          <button type="submit" class="btn btn-primary" :disabled="create.isPending.value">
            Read the draft
          </button>
        </form>
        <p class="mt-4 text-sm">
          Already have an account?
          <RouterLink
            :to="{ name: 'login', query: { email: invitedEmail, next: here } }"
            class="text-accent underline"
            >Sign in</RouterLink
          >
        </p>
      </template>

      <p v-else-if="wrongAccount" role="alert" class="mt-3 text-sm text-danger">
        This invitation was sent to <strong>{{ invitedEmail }}</strong
        >, but you're signed in as {{ session.user.email }}. Sign out, then sign in or create an
        account with the invited address.
      </p>

      <template v-else>
        <button
          type="button"
          class="mt-4 btn btn-primary"
          :disabled="accept.isPending.value"
          @click="accept.mutate()"
        >
          Read the draft
        </button>
        <p v-if="accept.isError.value" role="alert" class="mt-3 text-sm text-danger">
          {{ errorMessage(accept.error.value) }}
        </p>
      </template>

      <details class="mt-6 text-sm">
        <summary class="cursor-pointer text-ink-soft">Not for you?</summary>
        <form class="mt-3" @submit.prevent="decline.mutate()">
          <fieldset>
            <legend class="mb-2 font-medium">Decline, and</legend>
            <label class="mb-2 flex items-start gap-2">
              <input v-model="block" type="radio" name="block" value="none" />
              <span>Just decline this one</span>
            </label>
            <label class="mb-2 flex items-start gap-2">
              <input v-model="block" type="radio" name="block" value="sender" />
              <span>Stop invitations from {{ preview.data.value.inviterName }}</span>
            </label>
            <label class="mb-2 flex items-start gap-2">
              <input v-model="block" type="radio" name="block" value="all" />
              <span>Stop invitations from everyone, to {{ invitedEmail }}</span>
            </label>
          </fieldset>
          <p v-if="decline.isError.value" role="alert" class="mb-2 text-danger">
            {{ errorMessage(decline.error.value) }}
          </p>
          <button type="submit" class="btn btn-outline" :disabled="decline.isPending.value">
            Decline
          </button>
          <p class="mt-2 text-ink-soft">
            {{ preview.data.value.inviterName }} isn't told that you declined.
          </p>
        </form>
      </details>
    </template>
  </AuthCard>
</template>
