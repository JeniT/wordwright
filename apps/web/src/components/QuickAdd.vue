<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Publication } from '@wordwright/core'
import { api } from '../lib/api'
import { lastPublicationId, rememberPublication } from '../lib/last-publication'
import { invalidateRoots, useRecentDrafts } from '../lib/queries'
import SaveStatus from './SaveStatus.vue'
import TabPanels from './TabPanels.vue'
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

const tabs: { id: Kind; label: string }[] = [
  { id: 'idea', label: 'New idea' },
  { id: 'note', label: 'Add a note' },
  { id: 'reading', label: 'Add something to read' },
]
const tab = ref<Kind>('idea')
const forms = ref<Partial<Record<Kind, HTMLFormElement>>>({})
const focusField = (kind: Kind) =>
  forms.value[kind]?.querySelector<HTMLElement>('input, textarea')?.focus()

const ideaName = ref('')
const noteText = ref('')
const readingUrl = ref('')
/** What was last added, to say where it went. Cleared when another form opens. */
const added = ref<{ kind: 'note' | 'reading'; publication: Publication }>()

// Pick up may finish loading while someone types (the form locks the publication on first input) or after they
// move to another tab: keep adding to the publication they saw. Another tab starts clean: no old error or "Added to…".
watch(tab, () => {
  chosen.value ??= selectedId.value
  added.value = undefined
  createIdea.reset()
  addNote.reset()
  addReading.reset()
})

const createIdea = useMutation({
  mutationFn: () => api.createIdea(selectedId.value, { name: ideaName.value }),
  onSuccess: async (idea) => {
    await invalidateRoots(queryClient, 'ideas')
    ideaName.value = ''
    await router.push({ name: 'idea', params: { publicationId: idea.publicationId, id: idea.id } })
  },
})
const addNote = useMutation({
  mutationFn: () => api.addIdeaNote(selectedId.value, null, noteText.value),
  onSuccess: async () => {
    added.value = { kind: 'note', publication: selected.value }
    noteText.value = ''
    await invalidateRoots(queryClient, 'notes')
    focusField('note')
  },
})
const addReading = useMutation({
  mutationFn: () => api.addPublicationLink(selectedId.value, { url: readingUrl.value }),
  onSuccess: async () => {
    added.value = { kind: 'reading', publication: selected.value }
    readingUrl.value = ''
    await invalidateRoots(queryClient, 'reading')
    focusField('reading')
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
  <section class="mb-10 panel p-5" aria-label="Quick add">
    <TabPanels v-model="tab" :tabs="tabs" label="Quick add">
      <template v-for="kind in tabs.map((t) => t.id)" :key="kind" #[kind]>
        <form
          :ref="(el) => (forms[kind] = el as HTMLFormElement)"
          @submit.prevent="mutations[kind].mutate()"
          @input="chosen ??= selectedId"
        >
          <div v-if="publications.length > 1 && tab === kind" class="mb-4">
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
          <TextField v-if="kind === 'idea'" v-model="ideaName" label="Idea name" required />
          <div v-else-if="kind === 'note'" class="mb-4">
            <label for="quick-add-note" class="mb-1 block text-sm font-medium">Note</label>
            <textarea
              id="quick-add-note"
              v-model="noteText"
              class="field"
              rows="3"
              required
            ></textarea>
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
              {{ submitLabels[kind] }}
            </button>
            <SaveStatus
              :mutation="mutations[kind]"
              saved=""
              :saving="kind === 'idea' ? 'Creating…' : 'Adding…'"
            />
          </div>
          <p v-if="added && added.kind === kind" role="status" class="mt-3">
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
      </template>
    </TabPanels>
  </section>
</template>
