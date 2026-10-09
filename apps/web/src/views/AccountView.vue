<script setup lang="ts">
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '@lfwa/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PasswordSection from '../components/PasswordSection.vue'

import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()

// ---- AI provider (bring your own key)
const llm = useQuery({ queryKey: ['llm'], queryFn: () => api.getLlmSettings() })
// A valid default, so the form can never submit an empty model before settings arrive.
const model = ref<string>(DEFAULT_LLM_MODEL.anthropic)
const apiKey = ref('')
watch(
  () => llm.data.value,
  (settings) => {
    if (settings) model.value = settings.model
  },
  { immediate: true },
)
const saveLlm = useMutation({
  mutationFn: () =>
    api.saveLlmSettings({
      provider: 'anthropic',
      model: model.value,
      apiKey: apiKey.value.trim() || undefined,
    }),
  onSuccess: (settings) => {
    apiKey.value = ''
    queryClient.setQueryData(['llm'], settings)
  },
})
const removeLlmKey = useMutation({
  mutationFn: () => api.removeLlmKey(),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm'] }),
})

// ---- account deletion
const confirmEmail = ref('')
const deletePassword = ref('')
const deleteAccount = useMutation({
  mutationFn: () => api.deleteAccount(confirmEmail.value, deletePassword.value || undefined),
  onSuccess: async () => {
    session.set(null)
    queryClient.clear()
    await router.push('/register')
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

    <section aria-labelledby="llm-heading">
      <h2 id="llm-heading" class="mb-1 font-serif text-xl font-semibold">AI assistant</h2>
      <p class="mb-3 text-sm text-stone-700">
        AI features use your own Anthropic account, so usage is billed to you, not to this service.
        Create a key in the
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener"
          class="underline"
          >Anthropic Console</a
        >
        and paste it below. It's stored encrypted and never shown again.
      </p>
      <p v-if="llm.data.value" role="status" class="mb-3 text-sm">
        <template v-if="llm.data.value.hasKey"
          >Anthropic key saved ({{ llm.data.value.keyHint }}).</template
        >
        <template v-else>No API key yet.</template>
      </p>
      <form @submit.prevent="saveLlm.mutate()">
        <div class="mb-4">
          <label for="llm-model" class="mb-1 block text-sm font-medium">Model</label>
          <select
            id="llm-model"
            v-model="model"
            class="w-full rounded border border-stone-300 bg-white px-3 py-2"
          >
            <option v-for="m in LLM_MODELS.anthropic" :key="m.id" :value="m.id">
              {{ m.label }}
            </option>
          </select>
        </div>
        <TextField
          v-model="apiKey"
          :label="
            llm.data.value?.hasKey
              ? 'Replace API key (leave blank to keep the current one)'
              : 'Anthropic API key'
          "
          type="password"
          autocomplete="off"
          :required="!llm.data.value?.hasKey"
        />
        <p v-if="saveLlm.isError.value" role="alert" class="mb-3 text-red-700">
          {{ errorMessage(saveLlm.error.value) }}
        </p>
        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            :disabled="saveLlm.isPending.value || llm.isPending.value"
          >
            {{ saveLlm.isPending.value ? 'Checking key…' : 'Save' }}
          </button>
          <button
            v-if="llm.data.value?.hasKey"
            type="button"
            class="text-sm text-red-700 underline"
            @click="removeLlmKey.mutate()"
          >
            Remove key
          </button>
          <p v-if="saveLlm.isSuccess.value" role="status" class="text-sm text-stone-700">Saved</p>
        </div>
      </form>
    </section>

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
      <form @submit.prevent="deleteAccount.mutate()">
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
    </section>
  </div>
</template>
