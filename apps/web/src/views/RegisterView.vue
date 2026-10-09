<script setup lang="ts">
import { safeNextPath, UsernameInputSchema } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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

// ---- username availability, checked as the person types
type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'unknown'
const availability = ref<Availability>('idle')
const formatProblem = computed(() => {
  if (!handle.value.trim()) return undefined
  const parsed = UsernameInputSchema.safeParse(handle.value)
  return parsed.success ? undefined : parsed.error.issues[0]?.message
})
let timer: ReturnType<typeof setTimeout> | undefined
let latest = 0
watch(handle, (value) => {
  clearTimeout(timer)
  const check = ++latest
  if (!value.trim() || formatProblem.value) {
    availability.value = 'idle'
    return
  }
  availability.value = 'checking'
  timer = setTimeout(async () => {
    try {
      const { available } = await api.handleAvailable(value)
      // Ignore answers to anything but the latest text.
      if (check === latest) availability.value = available ? 'available' : 'taken'
    } catch {
      // The server checks again on submit, so a failed check must not block signing up.
      if (check === latest) availability.value = 'unknown'
    }
  }, 400)
})
onBeforeUnmount(() => clearTimeout(timer))

const usernameHint = computed(() => {
  if (formatProblem.value) return formatProblem.value
  if (availability.value === 'taken') return 'That username is already taken. Try another.'
  if (availability.value === 'available')
    return `“${handle.value.trim().toLowerCase()}” is available.`
  if (availability.value === 'checking') return 'Checking…'
  return 'Letters and numbers only. It starts the address of each profile you create.'
})
const usernameInvalid = computed(() => !!formatProblem.value || availability.value === 'taken')
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
        hint="At least 10 characters."
        required
      />
      <p v-if="register.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(register.error.value) }}
      </p>
      <button
        type="submit"
        class="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
        :disabled="register.isPending.value || usernameInvalid"
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
