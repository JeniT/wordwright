<script setup lang="ts">
import { safeNextPath } from '@wordwright/core'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

// An invitation link can send people here with their address filled in and a place to return to.
const next = safeNextPath(route.query.next)
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')

const config = useQuery({ queryKey: queryKeys.authConfig(), queryFn: () => api.authConfig() })
const login = useMutation({
  mutationFn: () => api.login({ email: email.value, password: password.value }),
  onSuccess: async (user) => {
    session.set(user)
    await router.push(next ?? '/')
  },
})

const OAUTH_ERRORS: Record<string, string> = {
  oauth_failed: "We couldn't sign you in with that provider. Please try again.",
  email_not_verified: 'That provider has not verified your email address.',
  too_many_signups: 'A lot of people have signed up in the last hour. Please try again later.',
}
const oauthError =
  typeof route.query.error === 'string' ? (OAUTH_ERRORS[route.query.error] ?? null) : null
</script>

<template>
  <AuthCard title="Sign in">
    <p class="mb-4 text-ink-soft">Wordwright helps people who love writing to do more of it.</p>
    <p v-if="oauthError" role="alert" class="mb-4 text-danger">{{ oauthError }}</p>

    <div v-if="config.data.value?.providers.length" class="mb-4 space-y-2">
      <a
        v-for="provider in config.data.value.providers"
        :key="provider.id"
        :href="`/api/auth/oauth/${provider.id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`"
        class="btn btn-neutral w-full"
      >
        Continue with {{ provider.label }}
      </a>
      <p class="text-center text-sm text-ink-soft">or use your email</p>
    </div>

    <form @submit.prevent="login.mutate()">
      <TextField v-model="email" label="Email" type="email" autocomplete="email" required />
      <TextField
        v-model="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        required
      />
      <p v-if="login.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(login.error.value) }}
      </p>
      <button type="submit" class="btn btn-primary w-full" :disabled="login.isPending.value">
        Sign in
      </button>
    </form>

    <p class="mt-4 text-sm">
      <RouterLink to="/forgot-password" class="text-accent underline"
        >Forgot your password?</RouterLink
      >
    </p>
    <p class="mt-2 text-sm">
      New here?
      <RouterLink :to="{ name: 'register', query: route.query }" class="text-accent underline"
        >Create an account</RouterLink
      >
    </p>
  </AuthCard>
</template>
