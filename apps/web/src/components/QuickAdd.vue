<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { IdeaLink, Publication } from '@wordwright/core'
import { api } from '../lib/api'
import { lastPublicationId, rememberPublication } from '../lib/last-publication'
import { invalidateRoots, refreshNotesEverywhere, useRecentDrafts } from '../lib/queries'
import { useQuoteTick } from '../lib/quote-tick'
import { readingBackRoute, readingRoute } from '../lib/reading'
import QuoteTick from './QuoteTick.vue'
import SaveStatus from './SaveStatus.vue'
import TabPanels from './TabPanels.vue'
import TextField from './TextField.vue'

/**
 * Add an idea, a note or something to read without first opening the place it goes (#192). On Home a note or reading
 * item goes to the chosen publication's own list, never into an idea. On a publication's landing page `publications`
 * is just that publication (so there is no picker); on an idea's, `ideaId` names the idea, notes and reading items go
 * to it, and there is no "New idea" tab.
 *
 * On a reading item's page (`fromItem`) it is the place to take notes from that item: "Add a note" comes first and
 * every note carries the item and, if ticked, the quotation flag; "Add something to read" says which item it added so
 * the writer can go on to it.
 */
const props = defineProps<{
  publications: Publication[]
  ideaId?: string
  /** On the page it adds to (a landing page): the result is showing below, so the message needn't say where it went. */
  inPlace?: boolean
  /** The reading item this is open beside, with the items on its list now (to tell which one an add made). */
  fromItem?: { id: string; known: IdeaLink[] }
}>()
const router = useRouter()
const queryClient = useQueryClient()

type Kind = 'idea' | 'note' | 'reading'

// Which publication: the one just picked, else the one last worked in, else the one with the newest draft to pick up
// (nothing records when a publication's content last changed), else the first.
const recentDrafts = useRecentDrafts(() => props.publications.length > 1)
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

const allTabs: { id: Kind; label: string }[] = [
  { id: 'idea', label: 'New idea' },
  { id: 'note', label: 'Add a note' },
  { id: 'reading', label: 'Add something to read' },
]
// Beside a reading item the note is what the writer came to do, so it comes first.
const ordered = props.fromItem
  ? [...allTabs.filter((t) => t.id !== 'idea'), ...allTabs.filter((t) => t.id === 'idea')]
  : allTabs
const tabs = props.ideaId ? ordered.filter((t) => t.id !== 'idea') : ordered
const quote = useQuoteTick()
const tab = ref<Kind>(tabs[0]!.id)
const forms = ref<Partial<Record<Kind, HTMLFormElement>>>({})
const focusField = (kind: Kind) =>
  forms.value[kind]?.querySelector<HTMLElement>('input, textarea')?.focus()

const ideaName = ref('')
const noteText = ref('')
const readingUrl = ref('')
/** What was last added, to say where it went. Cleared when another form opens. */
const added = ref<{
  kind: 'note' | 'reading'
  publication: Publication
  item?: { id: string; label: string }
}>()

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
  mutationFn: () =>
    api.addIdeaNote(
      selectedId.value,
      props.ideaId ?? null,
      noteText.value,
      props.fromItem
        ? { readingItemId: props.fromItem.id, quote: quote.isQuote.value || undefined }
        : {},
    ),
  onSuccess: async () => {
    added.value = { kind: 'note', publication: selected.value }
    noteText.value = ''
    quote.reset()
    // Taking a note from an item marks it read, which its list shows too.
    await Promise.all([
      refreshNotesEverywhere(queryClient),
      props.fromItem ? invalidateRoots(queryClient, 'reading') : undefined,
    ])
    focusField('note')
  },
})
const addReading = useMutation({
  mutationFn: async () => {
    const saved = props.ideaId
      ? await api.addIdeaLink(selectedId.value, props.ideaId, { url: readingUrl.value })
      : await api.addPublicationLink(selectedId.value, { url: readingUrl.value })
    // Which item the add made: the one that was not on the list before.
    const known = new Set(props.fromItem?.known.map((l) => l.id))
    const item = (Array.isArray(saved) ? saved : saved.links).find((l) => !known.has(l.id))
    return item ? { id: item.id, label: item.title || item.url } : undefined
  },
  onSuccess: async (item) => {
    added.value = { kind: 'reading', publication: selected.value, item }
    readingUrl.value = ''
    await invalidateRoots(queryClient, 'reading', 'idea', 'ideas')
    focusField('reading')
  },
})
const mutations = { idea: createIdea, note: addNote, reading: addReading }
const submitLabels: Record<Kind, string> = {
  idea: 'Create idea',
  note: 'Add note',
  // The name the reading lists use for the same action (#262).
  reading: props.fromItem ? 'Add item' : 'Add something to read',
}
const busy = computed(
  () => createIdea.isPending.value || addNote.isPending.value || addReading.isPending.value,
)
</script>

<template>
  <section class="panel p-5" aria-label="Quick add">
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
              maxlength="20000"
              required
              @paste="props.fromItem && quote.onPaste($event)"
            ></textarea>
            <QuoteTick
              v-if="fromItem"
              v-model="quote.isQuote.value"
              class="mt-2"
              :ticked-by-paste="quote.tickedByPaste.value"
              @ticked="quote.tickedByPaste.value = false"
            />
          </div>
          <!-- On an item's page a bare address (example.org/new) is accepted, as in the reading lists, so no url type. -->
          <TextField
            v-else
            v-model="readingUrl"
            label="Web address"
            :type="fromItem ? 'text' : 'url'"
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            :hint="fromItem ? 'For example, https://example.org/article' : undefined"
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
            <template v-if="added.kind === 'note' && fromItem">Note added.</template>
            <template v-else-if="added.kind === 'note'"
              >{{
                inPlace
                  ? 'Note added.'
                  : `Added to ${ideaId ? 'this idea’s' : `${added.publication.name}’s`} notes.`
              }}
              <RouterLink
                :to="
                  ideaId
                    ? {
                        name: 'idea-notes',
                        params: { publicationId: added.publication.id, id: ideaId },
                      }
                    : { name: 'publication-notes', params: { publicationId: added.publication.id } }
                "
                class="link"
                >{{ inPlace ? 'See all notes' : 'Open the notes' }}</RouterLink
              ></template
            >
            <template v-else-if="fromItem && added.item"
              >Added “{{ added.item.label }}”.
              <RouterLink
                :to="
                  readingRoute(
                    { publicationId: added.publication.id, ideaId: ideaId ?? null },
                    added.item.id,
                  )
                "
                class="link"
                >Read it</RouterLink
              ></template
            >
            <template v-else
              >{{
                inPlace
                  ? 'Added.'
                  : `Added to ${ideaId ? 'this idea’s' : `${added.publication.name}’s`} reading list.`
              }}
              <RouterLink
                :to="
                  readingBackRoute({ publicationId: added.publication.id, ideaId: ideaId ?? null })
                "
                class="link"
                >{{ inPlace ? 'See the reading list' : 'Open the reading list' }}</RouterLink
              ></template
            >
          </p>
        </form>
      </template>
    </TabPanels>
  </section>
</template>
