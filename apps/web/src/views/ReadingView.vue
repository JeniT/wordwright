<script setup lang="ts">
import NewTabLink from '../components/NewTabLink.vue'
import { computed, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import Explain from '../components/Explain.vue'
import Icon from '../components/Icon.vue'
import NoteOrigin from '../components/NoteOrigin.vue'
import NoteText from '../components/NoteText.vue'
import QuickAdd from '../components/QuickAdd.vue'
import SwitchField from '../components/SwitchField.vue'
import TextField from '../components/TextField.vue'
import { errorMessage } from '../lib/api'
import { useIdeaNotes } from '../lib/queries'
import { nameList, noteOriginPhrase } from '../lib/note-label'
import { readingBackRoute, useReadingList } from '../lib/reading'
import { displayHost, usePublication } from '../lib/usePublications'
import { vTip } from '../lib/tip'
import QueryState from '../components/QueryState.vue'
import RowList from '../components/RowList.vue'
import { useInlineEdit } from '../lib/inline-edit'

/** Reading one item of an idea's reading list, or (no `id`) of the publication's own, and taking notes from it. */
const props = defineProps<{ publicationId: string; id?: string; linkId: string }>()
const owner = computed(() => ({ publicationId: props.publicationId, ideaId: props.id ?? null }))

const list = useReadingList(() => owner.value)
const item = computed(() => list.links.value?.find((l) => l.id === props.linkId))
const backTo = computed(() => readingBackRoute(owner.value))
const backLabel = '← Back to the reading list'

const { publication } = usePublication(() => props.publicationId)

const { notes } = useIdeaNotes(
  () => props.publicationId,
  () => props.id,
)
/**
 * Only what was taken from this item (the idea page has all of the idea's notes), newest first: the panel for a new
 * note is above them, so a note added now has to appear right under it, in sight, rather than at the bottom.
 */
const itemNotes = computed(() =>
  (notes.data.value ?? [])
    .filter((n) => n.readingItemId === props.linkId)
    .reverse()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)

const label = computed(() => item.value?.title || item.value?.url || '')

// ---- the title: often missing, when it couldn't be looked up from the page
const title = ref('')
const authors = ref('')
const titleForm = useTemplateRef<HTMLFormElement>('titleForm')
const titleButton = useTemplateRef<HTMLButtonElement>('titleButton')
const {
  editing: editingTitleKey,
  start,
  stop: stopEditingTitle,
} = useInlineEdit<'title'>({
  field: () => titleForm.value?.querySelector('input'),
  trigger: () => titleButton.value,
})
const editingTitle = computed(() => editingTitleKey.value !== null)
function startEditingTitle() {
  title.value = item.value?.title ?? ''
  authors.value = item.value?.authors.join(', ') ?? ''
  saveTitle.reset()
  return start('title')
}
// Only the title changes; a blank one asks the server to look it up again, as on the idea page.
const saveTitle = list.update
function submitTitle() {
  saveTitle.mutate(
    {
      linkId: props.linkId,
      url: item.value!.url,
      title: title.value,
      // Names are separated by commas. Blank authors with a blank title look both up again; with a title, they clear.
      authors: authors.value
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    },
    { onSuccess: stopEditingTitle },
  )
}

// Whether it has been read is the writer's say-so (they may have read it offline), as on the idea page.
const setRead = list.setRead
const readSwitch = useTemplateRef<InstanceType<typeof SwitchField>>('readSwitch')
function toggleRead(read: boolean) {
  setRead.mutate(
    { linkId: props.linkId, read },
    // The switch has already flipped under the person's finger; put it back to what is saved.
    { onError: () => readSwitch.value?.revert() },
  )
}
</script>

<template>
  <QueryState :query="list" what="this item">
    <div v-if="!item" role="alert" class="panel p-6">
      <h1 class="font-display text-lg">Sorry, we couldn’t open that</h1>
      <p class="mt-1 text-ink-soft">
        It may have been removed from the reading list. Try reloading the page.
      </p>
      <RouterLink :to="backTo" class="mt-3 inline-block underline">
        Back to the reading list
      </RouterLink>
    </div>

    <article v-else aria-labelledby="reading-heading" class="max-w-2xl">
      <p class="mb-2 text-sm">
        <RouterLink :to="backTo" class="underline">{{ backLabel }}</RouterLink>
      </p>
      <div class="mb-2 flex items-start gap-x-2">
        <h1 id="reading-heading" class="min-w-0 font-display text-2xl font-semibold break-words">
          {{ label }}
        </h1>
        <button
          v-if="!editingTitle"
          ref="titleButton"
          v-tip="'Edit title and authors'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost shrink-0"
          aria-label="Edit title and authors"
          @click="startEditingTitle"
        >
          <Icon name="edit" />
        </button>
      </div>
      <p v-if="item.authors.length" class="mb-2 text-ink">By {{ nameList(item.authors) }}</p>
      <form
        v-if="editingTitle"
        ref="titleForm"
        class="mb-4"
        @submit.prevent="submitTitle"
        @keydown.esc="stopEditingTitle"
      >
        <TextField
          v-model="title"
          label="Title"
          autocomplete="off"
          :maxlength="200"
          :invalid="saveTitle.isError.value"
          :hint="
            saveTitle.isError.value
              ? errorMessage(saveTitle.error.value)
              : 'Leave this blank to look the title and authors up again.'
          "
        />
        <TextField
          v-model="authors"
          label="Authors"
          autocomplete="off"
          hint="Separate names with commas."
        />
        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary" :disabled="saveTitle.isPending.value">
            {{ saveTitle.isPending.value ? 'Saving…' : 'Save' }}
          </button>
          <button
            type="button"
            class="btn btn-neutral"
            :disabled="saveTitle.isPending.value"
            @click="stopEditingTitle"
          >
            Cancel
          </button>
        </div>
      </form>

      <section aria-labelledby="page-heading" class="mb-6">
        <h2 id="page-heading" class="sr-only">The page</h2>
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div class="min-w-[16rem] flex-1">
            <NewTabLink :href="item.url" class="btn btn-primary">Open the page</NewTabLink>
            <div class="mt-1 flex flex-wrap items-center gap-x-2">
              <span class="meta break-all">{{ displayHost(item.url) }}</span>
              <Explain label="About opening the page">
                Arrange this page and the page you’re reading side-by-side in a split view to make
                taking notes easier.
              </Explain>
            </div>
          </div>
          <SwitchField
            ref="readSwitch"
            :model-value="!!item.readAt"
            label="Read"
            :disabled="setRead.isPending.value"
            @update:model-value="toggleRead"
          />
        </div>
        <p v-if="setRead.isError.value" role="alert" class="mt-1 text-sm text-danger">
          Sorry, we couldn’t save that. Please try again.
        </p>
      </section>

      <!-- Keyed by item: going on to another one starts again on Add a note, with nothing half-typed carried over. -->
      <QuickAdd
        v-if="publication"
        :key="linkId"
        class="mb-8"
        in-place
        :publications="[publication]"
        :idea-id="id"
        :from-item="{ id: linkId, known: list.links.value ?? [] }"
      />

      <section aria-labelledby="reading-notes-heading">
        <h2 id="reading-notes-heading" class="mb-3 font-display text-xl font-semibold">
          Notes from this page
        </h2>

        <QueryState :query="notes" what="the notes" loading="Loading notes…">
          <p v-if="!itemNotes.length" class="mb-4 text-ink-soft">No notes from this page yet.</p>
          <RowList v-else :items="itemNotes" label="Notes from this page" bare class="mb-4">
            <template #default="{ item: note }">
              <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div class="min-w-[12rem] flex-1">
                  <NoteText :note="note" />
                </div>
                <p class="meta max-w-full sm:max-w-[16rem] sm:text-right">
                  <NoteOrigin
                    :phrase="noteOriginPhrase(note, list.links.value ?? [])"
                    :author-name="note.authorName"
                    class="sm:justify-end"
                  />
                </p>
              </div>
            </template>
          </RowList>
        </QueryState>
      </section>
    </article>
  </QueryState>
</template>
