<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import SaveStatus from '../components/SaveStatus.vue'
import TextField from '../components/TextField.vue'
import { api } from '../lib/api'
import { useUsernameCheck } from '../lib/useUsernameCheck'
import { useSessionStore } from '../stores/session'

/** A reviewer turns their account into a full one by choosing a username; the home page then helps them set up. */
const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()
const handle = ref('')
const { hint, invalid } = useUsernameCheck(handle)
const ready = computed(() => !!handle.value.trim() && !invalid.value)

const start = useMutation({
  mutationFn: () => api.startWriting(handle.value),
  onSuccess: async (user) => {
    session.set(user)
    await queryClient.invalidateQueries()
    await router.push('/')
  },
})
</script>

<template>
  <div class="max-w-md">
    <p class="mb-4 text-sm">
      <RouterLink :to="{ name: 'reviews' }" class="underline">← Back to your reviews</RouterLink>
    </p>
    <h1 class="mb-2 font-display text-3xl font-semibold">Start writing</h1>
    <p class="mb-4 text-ink-soft">
      Choose a username and your account becomes a full one, with profiles and ideas of your own.
      The drafts you were asked to review stay on your reviews page.
    </p>
    <form @submit.prevent="ready && start.mutate()">
      <TextField
        v-model="handle"
        label="Username"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :maxlength="30"
        :hint="hint"
        :invalid="invalid"
        required
      />
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="start.isPending.value || !ready">
          Start writing
        </button>
        <SaveStatus :mutation="start" saved="" saving="Setting up your account…" />
      </div>
    </form>
  </div>
</template>
