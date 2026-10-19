<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Publication } from '@wordwright/core'
import { api } from '../lib/api'
import { lastPublicationId, rememberPublication } from '../lib/last-publication'
import { invalidateRoots, refreshNotesEverywhere, useRecentDrafts } from '../lib/queries'
import { useQuoteTick } from '../lib/quote-tick'
import AddLinkForm from './AddLinkForm.vue'
import FieldWithAction from './FieldWithAction.vue'
import PublicationPicker from './PublicationPicker.vue'
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
 * On a reading item's page (`readingItemId`) it is the place to take notes from that item: "Add a note" comes first and
 * every note carries the item and, if ticked, the quotation flag; "Add to reading list" is the same form as at the
 * top of a reading list (`AddLinkForm`), so the two say and look alike.
 */
const props = defineProps<{
  publications: Publication[]
  ideaId?: string
  /** On the page it adds to (a landing page): the result is showing below, so the message needn't say where it went. */
  inPlace?: boolean
  /** The reading item this is open beside. */
  readingItemId?: string
}>()
const emit = defineEmits<{ 'note-added': [noteId: string] }>()
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
  { id: 'reading', label: 'Add to reading list' },
]
// Beside a reading item the note is what the writer came to do, so it comes first.
const ordered = props.readingItemId
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
/** What was last added, to say where it went. Cleared when another form opens. */
const added = ref<{ publication: Publication }>()

// Pick up may finish loading while someone types (the form locks the publication on first input) or after they
// move to another tab: keep adding to the publication they saw. Another tab starts clean: no old error or "Added to…".
watch(tab, () => {
  chosen.value ??= selectedId.value
  added.value = undefined
  createIdea.reset()
  addNote.reset()
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
      props.readingItemId
        ? { readingItemId: props.readingItemId, quote: quote.isQuote.value || undefined }
        : {},
    ),
  onSuccess: async (note) => {
    added.value = { publication: selected.value }
    noteText.value = ''
    emit('note-added', note.id)
    quote.reset()
    // Taking a note from an item marks it read, which its list shows too.
    await Promise.all([
      refreshNotesEverywhere(queryClient),
      props.readingItemId ? invalidateRoots(queryClient, 'reading') : undefined,
    ])
    focusField('note')
  },
})
/**
 * "Added to …" points to a place that isn't on screen, so it stays until the person starts the next entry, then goes.
 * The publication they saw is kept (the form locks it on first input, see above).
 */
function typing() {
  chosen.value ??= selectedId.value
  added.value = undefined
}
const mutations = { idea: createIdea, note: addNote }
const submitLabels = { idea: 'Create idea', note: 'Add note' }
const busy = computed(() => createIdea.isPending.value || addNote.isPending.value)
</script>

<template>
  <section class="panel p-5" aria-label="Quick add">
    <TabPanels v-model="tab" :tabs="tabs" label="Quick add">
      <template v-for="kind in tabs.map((t) => t.id)" :key="kind" #[kind]>
        <!-- The reading tab is the one form that sits above a reading list, wherever Quick add is. -->
        <div v-if="kind === 'reading'" @input="typing()">
          <PublicationPicker
            v-if="tab === kind"
            :publications="publications"
            :selected-id="selectedId"
            @change="pick"
          />
          <AddLinkForm
            :publication-id="selectedId"
            :idea-id="ideaId ?? null"
            :place="ideaId ? 'this idea' : selected.name"
          />
        </div>
        <form
          v-else
          :ref="(el) => (forms[kind] = el as HTMLFormElement)"
          @submit.prevent="mutations[kind].mutate()"
          @input="typing()"
        >
          <PublicationPicker
            v-if="tab === kind"
            :publications="publications"
            :selected-id="selectedId"
            :disabled="busy"
            @change="pick"
          />
          <FieldWithAction
            v-if="kind === 'idea'"
            :action="submitLabels.idea"
            busy-text="Creating…"
            :busy="busy"
            :primary="!readingItemId"
            class="mb-4"
          >
            <TextField v-model="ideaName" label="Idea name" required />
          </FieldWithAction>
          <div v-else-if="kind === 'note'" class="mb-4">
            <label for="quick-add-note" class="mb-1 block text-sm font-medium">Note</label>
            <textarea
              id="quick-add-note"
              v-model="noteText"
              class="field"
              rows="3"
              maxlength="20000"
              required
              @paste="props.readingItemId && quote.onPaste($event)"
            ></textarea>
            <QuoteTick
              v-if="readingItemId"
              v-model="quote.isQuote.value"
              class="mt-2"
              :ticked-by-paste="quote.tickedByPaste.value"
              @ticked="quote.tickedByPaste.value = false"
            />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button v-if="kind === 'note'" type="submit" class="btn btn-primary" :disabled="busy">
              {{ submitLabels.note }}
            </button>
            <SaveStatus
              :mutation="mutations[kind]"
              saved=""
              :saving="kind === 'idea' ? 'Creating…' : 'Adding…'"
            />
          </div>
          <!-- Beside a reading item the new note is right there in its list, so the words are for screen readers only. -->
          <p
            v-if="added && kind === 'note'"
            role="status"
            :class="readingItemId ? 'sr-only' : 'mt-3'"
          >
            <template v-if="readingItemId">Note added.</template>
            <template v-else
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
          </p>
        </form>
      </template>
    </TabPanels>
  </section>
</template>
