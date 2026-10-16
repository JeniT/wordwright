<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Publication } from '@wordwright/core'
import { api } from '../lib/api'
import { useInlineEdit } from '../lib/inline-edit'
import { lastPublicationId, rememberPublication } from '../lib/last-publication'
import { invalidateRoots, useIdeas, useRecentDrafts } from '../lib/queries'
import SaveStatus from './SaveStatus.vue'
import TextField from './TextField.vue'

/**
 * Add an idea, a note or something to read without first opening a publication (#192). A note or reading item goes
 * to the publication's own list, never into an idea.
 */
const props = defineProps<{ publications: Publication[] }>()
const router = useRouter()
const queryClient = useQueryClient()

type Kind = 'idea' | 'note' | 'reading'

// Which publication: the one just picked, else the one last worked in, else the one with the newest draft to pick up
// (nothing records when a publication's content last changed), else the first.
const recentDrafts = useRecentDrafts()
const chosen = ref<string>()
const isKnown = (id: string | null | undefined): id is string =>
  !!id && props.publications.some((p) => p.id === id)
const selectedId = computed(() => {
  if (isKnown(chosen.value)) return chosen.value
  const remembered = lastPublicationId()
  if (isKnown(remembered)) return remembered
  const newest = recentDrafts.data.value?.[0]?.publicationId
  return isKnown(newest) ? newest : props.publications[0]!.id
})
const selected = computed(() => props.publications.find((p) => p.id === selectedId.value)!)
function pick(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  chosen.value = id
  rememberPublication(id)
}

// With no ideas yet in the publication, starting one is the obvious next step.
const ideas = useIdeas(() => selectedId.value)
const noIdeas = computed(() => ideas.isSuccess.value && ideas.data.value?.length === 0)

const form = ref<HTMLFormElement>()
const buttons = ref<Partial<Record<Kind, HTMLButtonElement>>>({})
const { editing, start, stop } = useInlineEdit<Kind>({
  field: () => form.value?.querySelector<HTMLElement>('input, textarea'),
  trigger: (kind) => buttons.value[kind],
})

const ideaName = ref('')
const noteText = ref('')
const readingUrl = ref('')
/** What was last added, to say where it went. Cleared when another form opens. */
const added = ref<{ kind: 'note' | 'reading'; publication: Publication }>()

function open(kind: Kind) {
  // Pick up may finish loading while a form is open: keep adding to the publication the person saw.
  chosen.value ??= selectedId.value
  added.value = undefined
  createIdea.reset()
  addNote.reset()
  addReading.reset()
  return start(kind)
}

const createIdea = useMutation({
  mutationFn: () => api.createIdea(selectedId.value, { name: ideaName.value }),
  onSuccess: async (idea) => {
    await invalidateRoots(queryClient, 'ideas')
    ideaName.value = ''
    editing.value = null
    await router.push({ name: 'idea', params: { publicationId: idea.publicationId, id: idea.id } })
  },
})
const addNote = useMutation({
  mutationFn: () => api.addIdeaNote(selectedId.value, null, noteText.value),
  onSuccess: async () => {
    added.value = { kind: 'note', publication: selected.value }
    noteText.value = ''
    await invalidateRoots(queryClient, 'notes')
    form.value?.querySelector<HTMLElement>('textarea')?.focus()
  },
})
const addReading = useMutation({
  mutationFn: () => api.addPublicationLink(selectedId.value, { url: readingUrl.value }),
  onSuccess: async () => {
    added.value = { kind: 'reading', publication: selected.value }
    readingUrl.value = ''
    await invalidateRoots(queryClient, 'reading')
    form.value?.querySelector<HTMLElement>('input')?.focus()
  },
})
const mutations = { idea: createIdea, note: addNote, reading: addReading }
const submitLabels: Record<Kind, string> = {
  idea: 'Create idea',
  note: 'Add note',
  reading: 'Add to reading list',
}
const busy = computed(
  () => createIdea.isPending.value || addNote.isPending.value || addReading.isPending.value,
)
</script>

<template>
  <section class="mb-10 panel p-5" aria-labelledby="quick-add-heading">
    <h2 id="quick-add-heading" class="mb-3 font-display text-xl font-semibold">Quick add</h2>
    <div v-if="publications.length > 1" class="mb-4">
      <label for="quick-add-publication" class="mb-1 block text-sm font-medium"
        >Add to publication</label
      >
      <select
        id="quick-add-publication"
        class="field"
        :value="selectedId"
        :disabled="busy"
        @change="pick"
      >
        <option v-for="p in publications" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <div class="flex flex-wrap gap-3">
      <button
        :ref="(el) => (buttons.idea = el as HTMLButtonElement)"
        type="button"
        class="btn"
        :class="noIdeas ? 'btn-primary' : 'btn-outline'"
        :aria-expanded="editing === 'idea'"
        @click="open('idea')"
      >
        New idea
      </button>
      <button
        :ref="(el) => (buttons.note = el as HTMLButtonElement)"
        type="button"
        class="btn btn-outline"
        :aria-expanded="editing === 'note'"
        @click="open('note')"
      >
        Add a note
      </button>
      <button
        :ref="(el) => (buttons.reading = el as HTMLButtonElement)"
        type="button"
        class="btn btn-outline"
        :aria-expanded="editing === 'reading'"
        @click="open('reading')"
      >
        Add something to read
      </button>
    </div>

    <form
      v-if="editing"
      ref="form"
      class="mt-4"
      @submit.prevent="editing && mutations[editing].mutate()"
      @keydown.esc="stop()"
    >
      <TextField v-if="editing === 'idea'" v-model="ideaName" label="Idea name" required />
      <div v-else-if="editing === 'note'" class="mb-4">
        <label for="quick-add-note" class="mb-1 block text-sm font-medium">Note</label>
        <textarea id="quick-add-note" v-model="noteText" class="field" rows="3" required></textarea>
      </div>
      <TextField
        v-else
        v-model="readingUrl"
        label="Web address"
        type="url"
        autocomplete="off"
        required
      />
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="busy">
          {{ editing && submitLabels[editing] }}
        </button>
        <button type="button" class="btn btn-quiet" @click="stop()">Cancel</button>
        <SaveStatus
          :mutation="mutations[editing]"
          saved=""
          :saving="editing === 'idea' ? 'Creating…' : 'Adding…'"
        />
      </div>
      <p v-if="added && added.kind === editing" role="status" class="mt-3">
        <template v-if="added.kind === 'note'"
          >Added to {{ added.publication.name }}’s notes.
          <RouterLink
            :to="{ name: 'publication-notes', params: { publicationId: added.publication.id } }"
            class="link"
            >Open the notes</RouterLink
          ></template
        >
        <template v-else
          >Added to {{ added.publication.name }}’s reading list.
          <RouterLink
            :to="{ name: 'read', params: { publicationId: added.publication.id } }"
            class="link"
            >Open the reading list</RouterLink
          ></template
        >
      </p>
    </form>
  </section>
</template>
