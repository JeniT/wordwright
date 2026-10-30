<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
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
    await router.push({ path: '/register', query: { deleted: '1' } })
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
    <DangerZone title="Delete account" hide-title>
      <p class="mb-2">
        This can't be undone.
        <template v-if="!session.user.reviewerOnly">
          <RouterLink :to="{ name: 'account-download' }" class="underline"
            >Download your writing</RouterLink
          >
          first.
        </template>
      </p>
      <p class="mb-4 text-sm">
        Deletes your account and any publication only you belong to. You're removed from shared
        publications. If you're the only owner of one, you can't delete your account until you make
        someone else an owner.
      </p>
      <p v-if="!session.user.hasPassword" class="text-sm">
        To delete your account, first add a password in
        <RouterLink :to="{ name: 'account-security' }" class="underline"
          >Sign-in and security</RouterLink
        >.
      </p>
      <form v-else @submit.prevent="confirmingDelete = true">
        <fieldset class="mb-4" aria-describedby="keep-name-hint">
          <legend class="mb-1 text-sm font-medium">Your name on what you wrote</legend>
          <p id="keep-name-hint" class="mb-2 text-sm text-ink-soft">
            Your notes and comments stay in publications that continue. “A former member” is what
            other members of a publication see in place of your name.
          </p>
          <label class="mb-2 flex items-start gap-2 text-sm">
            <input v-model="keepName" type="radio" name="keep-name" :value="true" />
            <span>Keep my display name on my notes and comments in publications that continue</span>
          </label>
          <label class="mb-2 flex items-start gap-2 text-sm">
            <input v-model="keepName" type="radio" name="keep-name" :value="false" />
            <span>Show them as “a former member”</span>
          </label>
        </fieldset>
        <TextField
          v-model="deletePassword"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
        />
        <p v-if="deleteAccount.isError.value" role="alert" class="mb-3 text-danger">
          {{ errorMessage(deleteAccount.error.value) }}
        </p>
        <button type="submit" class="btn btn-danger-solid">Delete account</button>
      </form>
      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete your account?"
        confirm-label="Delete account"
        busy-label="Deleting…"
        :busy="deleteAccount.isPending.value"
        @confirm="deleteAccount.mutate()"
        @cancel="confirmingDelete = false"
      >
        <p class="mb-2">This can't be undone. Deleting your account removes:</p>
        <ul class="mb-2 list-disc pl-5">
          <li>every publication only you belong to</li>
          <li>the ideas, notes and drafts in that publication</li>
          <li>your account details, including the saved AI key</li>
        </ul>
        <p>
          You're removed from shared publications. If you are a member of a shared publication, what
          you wrote there stays.
          {{
            keepName
              ? 'Your name stays on your notes and comments there.'
              : 'Your notes and comments there show as “a former member”.'
          }}
        </p>
      </ConfirmDialog>
    </DangerZone>
    <NextStep v-if="!session.user.reviewerOnly" />
  </div>
</template>
