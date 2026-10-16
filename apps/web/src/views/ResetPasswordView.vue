<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'

const route = useRoute()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const password = ref('')
const reset = useMutation({ mutationFn: () => api.resetPassword(token, password.value) })
</script>

<template>
  <AuthCard title="Choose a new password">
    <p v-if="!token" role="alert" class="text-danger">This reset link is incomplete.</p>
    <p v-else-if="reset.isSuccess.value" role="status">
      Your password has been changed.
      <RouterLink to="/login" class="text-accent underline">Sign in</RouterLink>
    </p>
    <form v-else @submit.prevent="reset.mutate()">
      <TextField
        v-model="password"
        label="New password"
        type="password"
        autocomplete="new-password"
        hint="At least 8 characters."
        required
      />
      <p v-if="reset.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(reset.error.value) }}
      </p>
      <button type="submit" class="btn btn-primary w-full" :disabled="reset.isPending.value">
        Change password
      </button>
    </form>
  </AuthCard>
</template>
