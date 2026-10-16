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

const confirm = useMutation({
  mutationFn: () => api.confirmEmailChange(token),
  onSuccess: async () => {
    // If they're signed in on this device, show the new address straight away.
    if (session.user) session.set(await api.me())
  },
})

// Opening the link is the action; there is nothing for the person to click.
onMounted(() => token && confirm.mutate())
</script>

<template>
  <AuthCard title="Confirm your new email">
    <p v-if="!token" role="alert" class="text-danger">This link is incomplete.</p>
    <p v-else-if="confirm.isPending.value || confirm.isIdle.value">Confirming…</p>
    <template v-else-if="confirm.isSuccess.value">
      <p role="status">
        Thanks, your email address has been changed. Use it to sign in from now on.
      </p>
      <p class="mt-4 text-sm">
        <RouterLink
          :to="session.user ? '/account/details' : '/login'"
          class="text-accent underline"
        >
          {{ session.user ? 'Back to your account' : 'Sign in' }}
        </RouterLink>
      </p>
    </template>
    <template v-else>
      <p role="alert" class="text-danger">{{ errorMessage(confirm.error.value) }}</p>
      <p class="mt-4 text-sm">
        <RouterLink
          :to="session.user ? '/account/details' : '/login'"
          class="text-accent underline"
        >
          {{ session.user ? 'Go to your account' : 'Sign in' }}
        </RouterLink>
        {{
          session.user ? 'to ask for a new link.' : 'and ask for a new link from your account page.'
        }}
      </p>
    </template>
  </AuthCard>
</template>
