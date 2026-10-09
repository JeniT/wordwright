<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'

const email = ref('')
const request = useMutation({ mutationFn: () => api.forgotPassword(email.value) })
</script>

<template>
  <AuthCard title="Reset your password">
    <p v-if="request.isSuccess.value" role="status">
      If there's an account with a password for that address, we've emailed a link to reset it.
    </p>
    <form v-else @submit.prevent="request.mutate()">
      <TextField v-model="email" label="Email" type="email" autocomplete="email" required />
      <p v-if="request.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(request.error.value) }}
      </p>
      <button
        type="submit"
        class="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
        :disabled="request.isPending.value"
      >
        Send reset link
      </button>
    </form>
    <p class="mt-4 text-sm">
      <RouterLink to="/login" class="text-accent underline">Back to sign in</RouterLink>
    </p>
  </AuthCard>
</template>
