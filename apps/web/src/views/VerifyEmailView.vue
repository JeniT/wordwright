<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const session = useSessionStore()
const token = typeof route.query.token === 'string' ? route.query.token : ''

const verify = useMutation({
  mutationFn: () => api.verifyEmail(token),
  onSuccess: async () => {
    // If they're signed in on this device, refresh so the "please confirm" banner goes away.
    if (session.user) session.set(await api.me())
  },
})
const resend = useMutation({ mutationFn: () => api.resendVerification() })

// Opening the link is the action; there is nothing for the person to click.
onMounted(() => token && verify.mutate())
</script>

<template>
  <AuthCard title="Confirm your email">
    <p v-if="!token" role="alert" class="text-danger">This confirmation link is incomplete.</p>
    <p v-else-if="verify.isPending.value || verify.isIdle.value">Confirming…</p>
    <template v-else-if="verify.isSuccess.value">
      <p role="status">Thanks, your email address is confirmed.</p>
      <p class="mt-4 text-sm">
        <RouterLink :to="session.user ? '/' : '/login'" class="text-accent underline">
          {{ session.user ? 'Continue writing' : 'Sign in' }}
        </RouterLink>
      </p>
    </template>
    <template v-else>
      <p role="alert" class="text-danger">{{ errorMessage(verify.error.value) }}</p>
      <div v-if="session.user" class="mt-4">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="resend.isPending.value || resend.isSuccess.value"
          @click="resend.mutate()"
        >
          Send me a new link
        </button>
        <p v-if="resend.isSuccess.value" role="status" class="mt-2 text-sm">
          A new link is on its way.
        </p>
        <p v-if="resend.isError.value" role="alert" class="mt-2 text-sm text-danger">
          {{ errorMessage(resend.error.value) }}
        </p>
      </div>
      <p v-else class="mt-4 text-sm">
        <RouterLink to="/login" class="text-accent underline">Sign in</RouterLink> to request a new
        link.
      </p>
    </template>
  </AuthCard>
</template>
