<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

/**
 * Where an account lands until the owner has approved it (#328): the one page it has, besides what lets it leave
 * (download, delete, sign out). The server refuses everything else, so there is nothing to explore.
 */
const session = useSessionStore()
const resend = useMutation({ mutationFn: () => api.resendVerification() })
</script>

<template>
  <section v-if="session.user" class="mx-auto max-w-xl">
    <template v-if="session.user.approval === 'declined'">
      <h1 class="h1 mb-4">No access for now</h1>
      <p>
        Thank you for your interest in Wordwright. We’re not able to give you access at the moment.
      </p>
    </template>
    <template v-else>
      <h1 class="h1 mb-4">Waiting for approval</h1>
      <p>
        Thanks for signing up. We’ll email you at <strong>{{ session.user.email }}</strong> when
        your account is approved.
      </p>
      <div v-if="!session.user.emailVerified" class="callout mt-4">
        <p>Your email address isn’t confirmed yet. Use the link in the email we sent you.</p>
        <button
          type="button"
          class="btn btn-outline btn-sm mt-3"
          :disabled="resend.isPending.value || resend.isSuccess.value"
          @click="resend.mutate()"
        >
          Send a new link
        </button>
        <p v-if="resend.isSuccess.value" role="status" class="mt-2 text-sm">
          A new link is on its way.
        </p>
        <p v-if="resend.isError.value" role="alert" class="mt-2 text-sm text-danger">
          {{ errorMessage(resend.error.value) }}
        </p>
      </div>
    </template>
    <p class="mt-6 text-sm">
      <RouterLink :to="{ name: 'help-waiting' }" class="link">Why is there a wait?</RouterLink>
    </p>
    <ul class="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
      <li>
        <RouterLink :to="{ name: 'account-download' }" class="link"
          >Download your writing</RouterLink
        >
      </li>
      <li>
        <RouterLink :to="{ name: 'account-delete' }" class="link">Delete your account</RouterLink>
      </li>
    </ul>
  </section>
</template>
