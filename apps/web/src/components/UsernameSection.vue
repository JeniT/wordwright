<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { useUsernameCheck } from '../lib/useUsernameCheck'
import { useSessionStore } from '../stores/session'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

/** `prompt`: shown once on the landing page to someone given a generated username, who may keep it. */
defineProps<{ prompt?: boolean }>()

const session = useSessionStore()
const handle = ref('')
const current = computed(() => session.user?.handle ?? undefined)
const { hint, invalid, isCurrent } = useUsernameCheck(handle, current)

const savedAs = ref('')
const save = useMutation({
  mutationFn: (chosen: string) => api.changeHandle(chosen),
  onSuccess: (user) => {
    session.set(user)
    savedAs.value = user.handle ?? ''
    handle.value = ''
  },
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="username-heading">
    <h2 id="username-heading" class="mb-3 font-display text-xl font-semibold">
      {{ prompt ? 'Choose your username' : 'Username' }}
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      <template v-if="prompt">
        We gave you <strong>{{ session.user.handle }}</strong
        >. </template
      ><template v-else>
        Your username is <strong>{{ session.user.handle }}</strong
        >. </template
      >It starts the address of each publication you create, for example
      <code class="rounded-ctl bg-sunken px-1">{{ session.user.handle }}-substack</code>.
      <template v-if="prompt">Pick your own, or keep this one.</template>
      <template v-else>
        Publications you already have keep their addresses; new ones use your new username. A
        username you stop using can't be taken by anyone else.
      </template>
    </p>
    <form @submit.prevent="save.mutate(handle)">
      <TextField
        v-model="handle"
        :label="prompt ? 'Username' : 'New username'"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :maxlength="30"
        :hint="hint"
        :invalid="invalid"
      />
      <SaveStatus :mutation="save" :saved="prompt ? '' : 'Saved'" class="mb-3">
        <template v-if="!prompt">
          Your username is now <strong>{{ savedAs }}</strong
          >.
        </template>
      </SaveStatus>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !handle.trim() || invalid || isCurrent"
        >
          {{ prompt ? 'Use this username' : 'Change username' }}
        </button>
        <button
          v-if="prompt"
          type="button"
          class="btn btn-outline"
          :disabled="save.isPending.value"
          @click="save.mutate(session.user.handle ?? '')"
        >
          Keep {{ session.user.handle }}
        </button>
      </div>
    </form>
  </section>
</template>
