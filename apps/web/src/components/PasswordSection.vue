<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

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
  onSuccess: () => invalidateRoots(queryClient, 'me'),
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="password-heading">
    <h2 id="password-heading" class="mb-3 font-display text-xl font-semibold">Password</h2>

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
        hint="At least 8 characters. Your other devices will be signed out."
        required
      />
      <SaveStatus
        :mutation="change"
        saved="Password changed. We've signed out your other devices and emailed you a notice."
        :unsaved="!!currentPassword || !!newPassword"
        class="mb-3"
      />
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="change.isPending.value || !currentPassword || !newPassword"
      >
        {{ change.isPending.value ? 'Saving…' : 'Save password' }}
      </button>
    </form>

    <!-- Signs in with Google only: add a password via an emailed link -->
    <div v-else>
      <p class="mb-3 text-sm text-ink-soft">
        Add a password to sign in with email too. We'll email a link to
        <strong>{{ session.user.email }}</strong
        >.
      </p>
      <SaveStatus
        :mutation="setup"
        saved="Link sent. Opening it signs you out of your devices."
        class="mb-3"
      />
      <button
        v-if="!setup.isSuccess.value"
        type="button"
        class="btn btn-outline"
        :disabled="setup.isPending.value"
        @click="setup.mutate()"
      >
        Email me a link
      </button>
    </div>
  </section>
</template>
