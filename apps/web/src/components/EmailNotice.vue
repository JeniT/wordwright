<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const resend = useMutation({ mutationFn: () => api.resendVerification() })
</script>

<template>
  <section
    v-if="session.user && !session.user.emailVerified"
    class="notice notice-warn"
    aria-label="Email confirmation"
  >
    <p>
      Please confirm your email address. We sent a link to
      <strong>{{ session.user.email }}</strong
      >.
    </p>
    <div class="mt-2 flex flex-wrap items-center gap-3">
      <button
        v-if="!resend.isSuccess.value"
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="resend.isPending.value"
        @click="resend.mutate()"
      >
        Resend
      </button>
      <p v-else role="status">Sent. Check your inbox.</p>
      <p v-if="resend.isError.value" role="alert" class="text-danger">
        {{ errorMessage(resend.error.value) }}
      </p>
    </div>
  </section>
</template>
