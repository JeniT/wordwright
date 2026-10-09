<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const resend = useMutation({ mutationFn: () => api.resendVerification() })
</script>

<template>
  <div
    v-if="session.user && !session.user.emailVerified"
    class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950"
    role="region"
    aria-label="Email confirmation"
  >
    <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
      <p>
        Please confirm your email address. We sent a link to
        <strong>{{ session.user.email }}</strong
        >.
      </p>
      <button
        v-if="!resend.isSuccess.value"
        type="button"
        class="underline disabled:opacity-60"
        :disabled="resend.isPending.value"
        @click="resend.mutate()"
      >
        Resend
      </button>
      <p v-else role="status">Sent. Check your inbox.</p>
      <p v-if="resend.isError.value" role="alert" class="text-red-800">
        {{ errorMessage(resend.error.value) }}
      </p>
    </div>
  </div>
</template>
