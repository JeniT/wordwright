<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

/**
 * Asks someone to confirm their email address until they have. The first page they see it on has the whole notice (the
 * sentence, the address, Resend); after that, on later pages and visits, it is one line that opens for the address, so
 * it doesn't push the page down (#457). It is never hidden: confirming still matters. "Seen" is remembered per account
 * in this browser; where storage is blocked, the whole notice shows each visit, which is the safe way round.
 */
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const resend = useMutation({ mutationFn: () => api.resendVerification() })

const seenKey = (userId: string) => `wordwright:email-notice-seen:${userId}`
function seenBefore(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) !== null
  } catch {
    return false
  }
}
function rememberSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), '1')
  } catch {
    // A convenience only: the whole notice shows again next time.
  }
}

/** The whole notice, on the first page it is seen on; the one line otherwise. */
const full = ref(false)
watch(
  () => (session.user && !session.user.emailVerified ? session.user.id : null),
  (userId) => {
    if (!userId) return
    full.value = !seenBefore(userId)
    rememberSeen(userId)
  },
  { immediate: true },
)
// Moving to another page folds it. Only once the first navigation is over, which can finish after this mounts.
void router.isReady().then(() =>
  watch(
    () => route.path,
    () => (full.value = false),
  ),
)
</script>

<template>
  <section
    v-if="session.user && !session.user.emailVerified"
    class="notice notice-warn"
    :class="{ 'py-2': !full }"
    aria-label="Email confirmation"
    :data-compact="!full || undefined"
  >
    <template v-if="full">
      <p>
        Please confirm your email address. We sent a link to
        <strong>{{ session.user.email }}</strong>.
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
      </div>
    </template>
    <div v-else class="flex flex-wrap items-start gap-x-3 gap-y-1">
      <details class="min-w-0 flex-1">
        <summary class="cursor-pointer leading-8">Please confirm your email.</summary>
        <p class="mb-1">
          We sent a link to <strong>{{ session.user.email }}</strong>.
        </p>
      </details>
      <button
        v-if="!resend.isSuccess.value"
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="resend.isPending.value"
        @click="resend.mutate()"
      >
        Resend
      </button>
      <p v-else role="status" class="leading-8">Sent. Check your inbox.</p>
    </div>
    <p v-if="resend.isError.value" role="alert" class="mt-1 text-danger">
      {{ errorMessage(resend.error.value) }}
    </p>
  </section>
</template>
