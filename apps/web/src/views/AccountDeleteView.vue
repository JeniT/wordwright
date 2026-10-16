<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DangerZone from '../components/DangerZone.vue'
import StepHeading from '../components/StepHeading.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()

// ---- account deletion
const deletePassword = ref('')
const keepName = ref(true)
const confirmingDelete = ref(false)
const deleteAccount = useMutation({
  mutationFn: () => api.deleteAccount(deletePassword.value, keepName.value),
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
  <div v-if="session.user">
    <StepHeading>Delete account</StepHeading>
    <DangerZone title="Delete account">
      <p class="mb-4 text-sm">
        Deleting can't be undone, so
        <RouterLink :to="{ name: 'account-download' }" class="underline"
          >download your writing first</RouterLink
        >
        if you want to keep it.
      </p>
      <p class="mb-4 text-sm">
        This permanently deletes your account, and every publication (with its drafts) that only you
        belong to. In publications you share, you're removed, and the others keep their work. If
        you're the only owner of a shared publication, make someone else an owner first (in that
        publication's settings), or delete the publication.
      </p>
      <form @submit.prevent="confirmingDelete = true">
        <fieldset class="mb-4">
          <legend class="mb-1 text-sm font-medium">Your name on what you wrote</legend>
          <p class="mb-2 text-sm text-ink-soft">
            In publications that continue, your notes and brainstorming messages stay. Only your
            display name can stay with them, never your email address or username.
          </p>
          <label class="mb-2 flex items-start gap-2 text-sm">
            <input v-model="keepName" type="radio" name="keep-name" :value="true" class="mt-1" />
            <span>Keep my name on my notes (and comments) in publications that continue</span>
          </label>
          <label class="mb-2 flex items-start gap-2 text-sm">
            <input v-model="keepName" type="radio" name="keep-name" :value="false" class="mt-1" />
            <span>Show them as “a former member”, with no trace of my name</span>
          </label>
        </fieldset>
        <TextField
          v-if="session.user.hasPassword"
          v-model="deletePassword"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
        />
        <p v-else class="mb-3 text-sm">
          To delete your account, first add a password in
          <RouterLink :to="{ name: 'account-security' }" class="underline"
            >Sign-in and security</RouterLink
          >; that keeps anyone who borrows your signed-in device from deleting it.
        </p>
        <p v-if="deleteAccount.isError.value" role="alert" class="mb-3 text-danger">
          {{ errorMessage(deleteAccount.error.value) }}
        </p>
        <button type="submit" class="btn btn-danger-solid" :disabled="!session.user.hasPassword">
          Delete my account
        </button>
      </form>
      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete your account?"
        confirm-label="Yes, delete my account"
        busy-label="Deleting…"
        :busy="deleteAccount.isPending.value"
        @confirm="deleteAccount.mutate()"
        @cancel="confirmingDelete = false"
      >
        <p>
          This can't be undone. Your account and the publications (with their drafts) that only you
          belong to will be permanently deleted.
        </p>
      </ConfirmDialog>
    </DangerZone>
  </div>
</template>
