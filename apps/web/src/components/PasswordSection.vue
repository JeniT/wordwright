<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'

const session = useSessionStore()
const queryClient = useQueryClient()

const currentPassword = ref('')
const newPassword = ref('')

const change = useMutation({
  mutationFn: () => api.changePassword(currentPassword.value, newPassword.value),
  onSuccess: () => {
    currentPassword.value = ''
    newPassword.value = ''
  },
})
const setup = useMutation({
  mutationFn: () => api.requestPasswordSetup(),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="password-heading">
    <h2 id="password-heading" class="mb-3 font-serif text-xl font-semibold">Password</h2>

    <!-- Has a password: change it -->
    <form v-if="session.user.hasPassword" @submit.prevent="change.mutate()">
      <TextField
        v-model="currentPassword"
        label="Current password"
        type="password"
        autocomplete="current-password"
        required
      />
      <TextField
        v-model="newPassword"
        label="New password"
        type="password"
        autocomplete="new-password"
        hint="At least 10 characters. Your other devices will be signed out."
        required
      />
      <p v-if="change.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(change.error.value) }}
      </p>
      <p v-if="change.isSuccess.value" role="status" class="mb-3 text-sm">
        Password changed. We've signed out your other devices and emailed you a notice.
      </p>
      <button type="submit" class="btn btn-primary" :disabled="change.isPending.value">
        Change password
      </button>
    </form>

    <!-- Signs in with Google only: add a password via an emailed link -->
    <div v-else>
      <p class="mb-3 text-sm text-stone-700">
        You sign in with {{ session.user.linkedProviders.join(' / ') || 'a linked account' }}. You
        can also add a password, to sign in with your email too. For your security we email a link
        to <strong>{{ session.user.email }}</strong> to choose it.
      </p>
      <p v-if="setup.isSuccess.value" role="status" class="mb-3 text-sm">
        We've emailed you a link. Opening it signs you out of your devices so you can choose a
        password.
      </p>
      <p v-if="setup.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(setup.error.value) }}
      </p>
      <button
        v-if="!setup.isSuccess.value"
        type="button"
        class="rounded border border-accent px-4 py-2 text-sm font-medium text-accent disabled:opacity-60"
        :disabled="setup.isPending.value"
        @click="setup.mutate()"
      >
        Email me a link to set a password
      </button>
    </div>
  </section>
</template>
