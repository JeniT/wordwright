<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useSavedValue } from '../lib/forms'
import { api } from '../lib/api'
import { useUsernameCheck } from '../lib/useUsernameCheck'
import { useSessionStore } from '../stores/session'
import InfoTip from './InfoTip.vue'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

/** `prompt`: shown once on the landing page to someone given a generated username, who may keep it. */
const props = defineProps<{ prompt?: boolean }>()

const session = useSessionStore()
// Account settings show the current username in the field; the one-time prompt starts empty.
const saved = useSavedValue(() => (props.prompt ? undefined : (session.user?.handle ?? '')), '')
const promptValue = ref('')
const handle = computed({
  get: () => (props.prompt ? promptValue.value : saved.value),
  set: (value: string) => {
    if (props.prompt) promptValue.value = value
    else saved.value = value
  },
})
const current = computed(() => session.user?.handle ?? undefined)
const { hint, invalid, isCurrent } = useUsernameCheck(handle, current)
// In settings the field starts as the current username, so say what it is for until something is typed.
const shownHint = computed(() =>
  props.prompt || (handle.value.trim() && !isCurrent.value)
    ? hint.value
    : 'Used in URLs, for example ada-substack',
)

const save = useMutation({
  mutationFn: (chosen: string) => api.changeHandle(chosen),
  onSuccess: (user) => {
    session.set(user)
    promptValue.value = ''
  },
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="username-heading">
    <div v-if="prompt">
      <h2 id="username-heading" class="mb-3 font-display text-xl font-semibold">
        Choose your username
      </h2>
      <p class="mb-3 text-sm text-ink-soft">
        We gave you <strong>{{ session.user.handle }}</strong
        >. It starts the address of each publication you create, for example
        <code class="rounded-ctl bg-sunken px-1">{{ session.user.handle }}-substack</code>. Pick
        your own, or keep this one.
      </p>
    </div>
    <div v-else class="mb-3 flex items-center gap-2">
      <h2 id="username-heading" class="font-display text-xl font-semibold">Username</h2>
      <InfoTip label="About usernames"
        >Existing publications keep their addresses. A username you stop using can't be taken by
        anyone else.</InfoTip
      >
    </div>
    <form @submit.prevent="save.mutate(handle)">
      <TextField
        v-model="handle"
        label="Username"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :maxlength="30"
        :hint="shownHint"
        :invalid="invalid"
      />
      <SaveStatus :mutation="save" :saved="prompt ? '' : 'Saved'" class="mb-3" />
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !handle.trim() || invalid || isCurrent"
        >
          {{ prompt ? 'Use this username' : 'Save username' }}
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
