<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'

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
      <p class="mb-3 text-sm text-ink-soft">
        Your address is <strong>{{ session.user.email }}</strong
        >. We'll email a link to the new one, and your address only changes once you open it.
      </p>
      <TextField
        v-model="newEmail"
        label="New email address"
        type="email"
        autocomplete="email"
        required
      />
      <TextField
        v-model="password"
        label="Confirm with your password"
        type="password"
        autocomplete="current-password"
        required
      />
      <p v-if="change.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(change.error.value) }}
      </p>
      <p v-if="change.isSuccess.value" role="status" class="mb-3 text-sm">
        We've emailed a link to <strong>{{ sentTo }}</strong
        >. Open it within 24 hours to finish. Until then you still sign in with
        {{ session.user.email }}.
      </p>
      <button type="submit" class="btn btn-primary" :disabled="change.isPending.value">
        Email me a link to confirm
      </button>
    </form>

    <!-- Signs in with Google only: a session alone isn't enough proof, so a password comes first -->
    <p v-else class="text-sm text-ink-soft">
      Your address is <strong>{{ session.user.email }}</strong
      >. To change it, first add a password in the section below; that keeps anyone who borrows your
      signed-in device from redirecting your account's email.
    </p>
  </section>
</template>
