<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import RichEditor from '../components/RichEditor.vue'
import { RouterLink } from 'vue-router'
import { ApiError, api, errorMessage } from '../lib/api'

const props = defineProps<{ profileId: string; id: string }>()
const queryClient = useQueryClient()

const draft = useQuery({
  queryKey: ['draft', () => props.profileId, () => props.id],
  queryFn: () => api.getDraft(props.profileId, props.id),
})
// Every draft develops an idea, which it links back to.
const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => draft.data.value?.ideaId],
  queryFn: () => api.getIdea(props.profileId, draft.data.value!.ideaId!),
  enabled: () => !!draft.data.value?.ideaId,
})
const title = ref('')
const body = ref('')
watch(
  () => draft.data.value,
  (d) => {
    if (d) {
      title.value = d.title
      body.value = d.body
    }
  },
  { immediate: true },
)

const save = useMutation({
  mutationFn: () =>
    api.updateDraft(props.profileId, props.id, { title: title.value, body: body.value }),
  onSuccess: (saved) => queryClient.setQueryData(['draft', props.profileId, props.id], saved),
})
const critique = useMutation({ mutationFn: () => api.critique(props.profileId, props.id) })

async function requestCritique() {
  await save.mutateAsync() // critique the latest text
  critique.mutate()
}
</script>

<template>
  <p v-if="draft.isPending.value">Loading…</p>
  <p v-else-if="draft.isError.value" role="alert" class="text-red-700">Couldn't load this draft.</p>
  <article v-else>
    <p v-if="draft.data.value?.ideaId" class="mb-4 text-sm">
      <RouterLink
        :to="{
          name: 'idea',
          params: { profileId: props.profileId, id: draft.data.value.ideaId },
        }"
        class="underline"
      >
        ← {{ idea.data.value ? `Back to “${idea.data.value.name}”` : 'Back to the idea' }}
      </RouterLink>
    </p>
    <label class="sr-only" for="title">Title</label>
    <input
      id="title"
      v-model="title"
      class="mb-6 w-full bg-transparent font-serif text-3xl font-semibold outline-none placeholder:text-stone-500"
      placeholder="Title"
    />

    <RichEditor v-model="body" />

    <div class="mt-6 flex items-center gap-3 border-t border-stone-200 pt-4">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="save.isPending.value"
        @click="save.mutate()"
      >
        Save
      </button>
      <button
        type="button"
        class="rounded border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-stone-100 disabled:opacity-60"
        :disabled="critique.isPending.value"
        @click="requestCritique"
      >
        Critique
      </button>
      <p role="status" class="text-sm text-stone-600">
        <template v-if="save.isPending.value">Saving…</template>
        <template v-else-if="save.isSuccess.value">Saved</template>
        <template v-else-if="save.isError.value">Couldn't save</template>
      </p>
    </div>

    <section
      v-if="critique.isPending.value || critique.data.value || critique.isError.value"
      class="mt-6 rounded border border-stone-200 bg-white p-4"
      aria-labelledby="critique-heading"
    >
      <h2 id="critique-heading" class="mb-2 font-semibold">Critique</h2>
      <p v-if="critique.isPending.value">Reading your draft…</p>
      <p v-else-if="critique.isError.value" role="alert" class="text-red-700">
        {{ errorMessage(critique.error.value) }}
        <RouterLink
          v-if="
            critique.error.value instanceof ApiError &&
            [400, 409].includes(critique.error.value.status)
          "
          to="/account"
          class="underline"
          >Go to account settings</RouterLink
        >
      </p>
      <p v-else class="whitespace-pre-wrap">{{ critique.data.value?.text }}</p>
    </section>
  </article>
</template>
