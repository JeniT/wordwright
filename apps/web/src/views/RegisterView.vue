<script setup lang="ts">
import { safeNextPath } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const queryClient = useQueryClient()

const route = useRoute()
const next = safeNextPath(route.query.next)
const name = ref('')
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')

const register = useMutation({
  mutationFn: () =>
    api.register({ name: name.value, email: email.value, password: password.value }),
  onSuccess: async (user) => {
    queryClient.clear()
    session.set(user)
    await router.push(next ?? '/')
  },
})
</script>

<template>
  <AuthCard title="Create your account">
    <form @submit.prevent="register.mutate()">
      <TextField v-model="name" label="Name" autocomplete="name" required />
      <TextField v-model="email" label="Email" type="email" autocomplete="email" required />
      <TextField
        v-model="password"
        label="Password"
        type="password"
        autocomplete="new-password"
        hint="At least 10 characters."
        required
      />
      <p v-if="register.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(register.error.value) }}
      </p>
      <button
        type="submit"
        class="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
        :disabled="register.isPending.value"
      >
        Create account
      </button>
    </form>
    <p class="mt-4 text-sm">
      Already have an account?
      <RouterLink :to="{ name: 'login', query: route.query }" class="text-accent underline"
        >Sign in</RouterLink
      >
    </p>
  </AuthCard>
</template>
