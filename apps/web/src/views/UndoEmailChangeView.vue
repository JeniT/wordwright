<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { RouterLink, useRoute } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const session = useSessionStore()
const token = typeof route.query.token === 'string' ? route.query.token : ''

// Unlike the other emailed links this needs a click: it signs everyone out, so a mail scanner
// opening the link must not trigger it.
const undo = useMutation({
  mutationFn: () => api.undoEmailChange(token),
  // Every device was signed out, this one included.
  onSuccess: () => session.set(null),
})
</script>

<template>
  <AuthCard title="Undo email change">
    <p v-if="!token" role="alert" class="text-red-700">This link is incomplete.</p>
    <template v-else-if="undo.isSuccess.value">
      <p role="status">
        Your old email address is back, and every device has been signed out. We've emailed a link
        to that address so you can choose a new password.
      </p>
      <p class="mt-4 text-sm">
        <RouterLink to="/login" class="text-accent underline">Sign in</RouterLink> once you've
        chosen a new password.
      </p>
    </template>
    <template v-else>
      <p class="mb-4">
        If you didn't change your email address, someone else knows your password. This puts your
        old address back, signs out every device and emails you a link to choose a new password.
      </p>
      <p v-if="undo.isError.value" role="alert" class="mb-4 text-red-700">
        {{ errorMessage(undo.error.value) }}
      </p>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="undo.isPending.value"
        @click="undo.mutate()"
      >
        Yes, this wasn't me
      </button>
      <p class="mt-4 text-sm text-stone-600">
        If you did make the change, you can just close this page.
      </p>
    </template>
  </AuthCard>
</template>
