<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'

const session = useSessionStore()
// Follows the account if it is loaded after this section appears, or changed elsewhere.
const name = useSavedValue(() => session.user?.name, '')

const unsaved = computed(() => name.value.trim() !== session.user?.name)

const save = useMutation({
  mutationFn: () => api.changeName(name.value),
  onSuccess: (user) => session.set(user),
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="name-heading">
    <h2 id="name-heading" class="mb-3 font-display text-xl font-semibold">Name</h2>
    <form @submit.prevent="save.mutate()">
      <TextField
        v-model="name"
        label="Name"
        hide-label
        hint="Other people see this on your notes, messages and invitations."
        autocomplete="given-name"
        :maxlength="100"
        required
      />
      <SaveStatus :mutation="save" :unsaved="unsaved" class="mb-3" />
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="save.isPending.value || !name.trim() || !unsaved"
      >
        {{ save.isPending.value ? 'Saving…' : 'Save name' }}
      </button>
    </form>
  </section>
</template>
