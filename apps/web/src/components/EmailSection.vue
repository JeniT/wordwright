<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api } from '../lib/api'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

const session = useSessionStore()

const newEmail = ref('')
const password = ref('')

// Nothing changes until the emailed link is opened, so on success we only say where it went.
const sentTo = ref('')
const change = useMutation({
  mutationFn: () => api.changeEmail(newEmail.value, password.value),
  onSuccess: () => {
    sentTo.value = newEmail.value.trim().toLowerCase()
    newEmail.value = ''
    password.value = ''
  },
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="email-heading">
    <h2 id="email-heading" class="mb-3 font-display text-xl font-semibold">Email address</h2>

    <!-- Has a password: ask for it, then confirm the new address by email -->
    <form v-if="session.user.hasPassword" @submit.prevent="change.mutate()">
      <TextField
        v-model="newEmail"
        label="New email address"
        :placeholder="session.user.email"
        hint="We'll email a link to the new address. It changes once you open it."
        type="email"
        autocomplete="email"
        required
      />
      <TextField
        v-model="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        required
      />
      <SaveStatus :mutation="change" :unsaved="!!newEmail || !!password" class="mb-3">
        Link sent to <strong>{{ sentTo }}</strong
        >. Open it within 24 hours.
      </SaveStatus>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="change.isPending.value || !newEmail.trim() || !password"
      >
        {{ change.isPending.value ? 'Saving…' : 'Send confirmation link' }}
      </button>
    </form>

    <!-- Signs in with Google only: a session alone isn't enough proof, so a password comes first -->
    <template v-else>
      <p class="mb-3 break-words">{{ session.user.email }}</p>
      <p class="text-sm text-ink-soft">
        To change it, first add a password in
        <RouterLink :to="{ name: 'account-security' }" class="link">Sign-in and security</RouterLink
        >.
      </p>
    </template>
  </section>
</template>
