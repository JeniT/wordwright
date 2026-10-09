<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LlmSettingsSection from '../components/LlmSettingsSection.vue'
import PasswordSection from '../components/PasswordSection.vue'

import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()

// ---- account deletion
const confirmEmail = ref('')
const deletePassword = ref('')
const confirmingDelete = ref(false)
const deleteAccount = useMutation({
  mutationFn: () => api.deleteAccount(confirmEmail.value, deletePassword.value || undefined),
  onSuccess: async () => {
    session.set(null)
    queryClient.clear()
    await router.push('/register')
  },
  // Back to the form, where the error (e.g. a wrong password) is shown.
  onError: () => {
    confirmingDelete.value = false
  },
})
</script>

<template>
  <div v-if="session.user" class="space-y-10">
    <section aria-labelledby="account-heading">
      <h1 id="account-heading" class="font-serif text-2xl font-semibold">Your account</h1>
      <p class="mt-2 text-stone-700">{{ session.user.name }} · {{ session.user.email }}</p>
      <p v-if="session.user.linkedProviders.length" class="text-sm text-stone-600">
        Linked sign-in: {{ session.user.linkedProviders.join(', ') }}
      </p>
    </section>

    <PasswordSection />

    <LlmSettingsSection />

    <section aria-labelledby="profiles-heading">
      <h2 id="profiles-heading" class="mb-1 font-serif text-xl font-semibold">Profiles</h2>
      <p class="text-sm text-stone-700">
        Create, share and manage profiles from
        <RouterLink to="/" class="underline">your profiles</RouterLink>. Profile addresses start
        with your handle, <code class="rounded bg-stone-100 px-1">{{ session.user.handle }}</code
        >.
      </p>
    </section>

    <section aria-labelledby="delete-heading" class="rounded border border-red-200 bg-red-50 p-4">
      <h2 id="delete-heading" class="mb-2 font-serif text-xl font-semibold text-red-900">
        Delete account
      </h2>
      <p class="mb-4 text-sm">
        This permanently deletes your account, and every profile (with its drafts) that only you
        belong to. In profiles you share, you're removed, and the others keep their work.
      </p>
      <form @submit.prevent="confirmingDelete = true">
        <TextField
          v-model="confirmEmail"
          :label="`Type your email (${session.user.email}) to confirm`"
          type="email"
          required
        />
        <TextField
          v-if="session.user.hasPassword"
          v-model="deletePassword"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
        />
        <p v-if="deleteAccount.isError.value" role="alert" class="mb-3 text-red-700">
          {{ errorMessage(deleteAccount.error.value) }}
        </p>
        <button type="submit" class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white">
          Delete my account
        </button>
      </form>
      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete your account?"
        confirm-label="Yes, delete my account"
        :busy="deleteAccount.isPending.value"
        @confirm="deleteAccount.mutate()"
        @cancel="confirmingDelete = false"
      >
        <p>
          This can't be undone. Your account and the profiles (with their drafts) that only you
          belong to will be permanently deleted.
        </p>
      </ConfirmDialog>
    </section>
  </div>
</template>
