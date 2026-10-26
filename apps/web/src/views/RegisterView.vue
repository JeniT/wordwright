<script setup lang="ts">
import { safeNextPath } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useUsernameCheck } from '../lib/useUsernameCheck'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const queryClient = useQueryClient()

const route = useRoute()
const next = safeNextPath(route.query.next)
const name = ref('')
const handle = ref('')
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')

const register = useMutation({
  mutationFn: () =>
    api.register({
      name: name.value,
      handle: handle.value,
      email: email.value,
      password: password.value,
    }),
  onSuccess: async (user) => {
    queryClient.clear()
    session.set(user)
    await router.push(next ?? '/')
  },
})

const { hint: usernameHint, invalid: usernameInvalid } = useUsernameCheck(handle)
</script>

<template>
  <AuthCard title="Create your account">
    <form @submit.prevent="register.mutate()">
      <!-- "given-name" asks browsers to autofill just their first name, which is what we use. -->
      <TextField
        v-model="name"
        label="What should we call you?"
        autocomplete="given-name"
        required
      />
      <TextField
        v-model="handle"
        label="Username"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :maxlength="30"
        :hint="usernameHint"
        :invalid="usernameInvalid"
        required
      />
      <TextField v-model="email" label="Email" type="email" autocomplete="email" required />
      <TextField
        v-model="password"
        label="Password"
        type="password"
        autocomplete="new-password"
        hint="At least 8 characters."
        required
      />
      <p v-if="register.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(register.error.value) }}
      </p>
      <p class="mb-3">
        By creating an account you agree to the
        <RouterLink :to="{ name: 'help-terms' }" class="link">terms of use</RouterLink>. The
        <RouterLink :to="{ name: 'help-privacy-notice' }" class="link">privacy notice</RouterLink>
        says what we keep.
      </p>
      <button
        type="submit"
        class="btn btn-primary w-full"
        :disabled="register.isPending.value || usernameInvalid"
      >
        Create account
      </button>
      <p class="mt-3 text-sm text-ink-soft">
        Wordwright is for writers of any age. The AI features need your own key from an AI provider,
        and providers require adult account holders.
      </p>
    </form>
    <p class="mt-4 text-sm">
      Already have an account?
      <RouterLink :to="{ name: 'login', query: route.query }" class="text-accent underline"
        >Sign in</RouterLink
      >
    </p>
  </AuthCard>
</template>
