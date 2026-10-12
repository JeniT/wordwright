<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { api } from '../lib/api'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'

const session = useSessionStore()
// Follows the account if it is loaded after this section appears, or changed elsewhere.
const name = useSavedValue(() => session.user?.name, '')

const save = useMutation({
  mutationFn: () => api.changeName(name.value),
  onSuccess: (user) => session.set(user),
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="name-heading">
    <h2 id="name-heading" class="mb-3 font-display text-xl font-semibold">Your name</h2>
    <p class="mb-3 text-sm text-ink-soft">
      This is the name other people see: on the notes and brainstorm messages you write, in the
      lists of people in a profile, and in invitations you send. Changing it updates it everywhere
      it is shown. Emails already sent keep the old one.
    </p>
    <form @submit.prevent="save.mutate()">
      <TextField
        v-model="name"
        label="What should we call you?"
        autocomplete="given-name"
        :maxlength="100"
        required
      />
      <SaveStatus :mutation="save" class="mb-3">
        Saved. People now see <strong>{{ session.user.name }}</strong
        >.
      </SaveStatus>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="save.isPending.value || !name.trim() || name.trim() === session.user.name"
      >
        Change name
      </button>
    </form>
  </section>
</template>
