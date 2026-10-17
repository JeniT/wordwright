<script setup lang="ts">
import NewTabLink from '../components/NewTabLink.vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import NoteOrigin from '../components/NoteOrigin.vue'
import NoteText from '../components/NoteText.vue'
import SwitchField from '../components/SwitchField.vue'
import TextAreaField from '../components/TextAreaField.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, useIdeaNotes } from '../lib/queries'
import { nameList, noteOriginPhrase } from '../lib/note-label'
import { readingBackRoute, readingRoute, useReadingList } from '../lib/reading'
import QueryState from '../components/QueryState.vue'
import { useInlineEdit } from '../lib/inline-edit'

/** Reading one item of an idea's reading list, or (no `id`) of the publication's own, and taking notes from it. */
const props = defineProps<{ publicationId: string; id?: string; linkId: string }>()
const queryClient = useQueryClient()
const owner = computed(() => ({ publicationId: props.publicationId, ideaId: props.id ?? null }))

const list = useReadingList(() => owner.value)
const item = computed(() => list.links.value?.find((l) => l.id === props.linkId))
const backTo = computed(() => readingBackRoute(owner.value))
const backLabel = '← Back to the reading list'

const {
  notes,
  append: appendNote,
  refreshIdea,
} = useIdeaNotes(
  () => props.publicationId,
  () => props.id,
)
/**
 * Only what was taken from this item (the idea page has all of the idea's notes), newest first: the box for a new
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

// ---- other pages found on this one: straight onto the reading list
const linkUrl = ref('')
/** The item just added, so the writer can go on to read it. */
const justAdded = ref<{ id: string; label: string } | null>(null)
// On failure what was typed stays in the field, with the reason shown under it.
const addLink = list.add
function submitLink() {
  const before = new Set(list.links.value?.map((l) => l.id))
  addLink.mutate(linkUrl.value, {
    onSuccess: (saved) => {
      const added = list.listOf(saved).find((l) => !before.has(l.id))
      justAdded.value = added ? { id: added.id, label: added.title || added.url } : null
      linkUrl.value = ''
    },
  })
}

const text = ref('')
const isQuote = ref(false)
/** The box was ticked by a paste, not by the writer: said out loud, so it can be undone. */
const tickedByPaste = ref(false)
/**
 * Words pasted into an empty box (or over all of what's there) are almost always someone else's, and a quotation
 * stored as the writer's own is the one mistake this page must not make easily. Typing never ticks the box, nor does
 * pasting into the middle of the writer's own words.
 */
function onPaste(event: ClipboardEvent) {
  const box = event.target as HTMLTextAreaElement
  const pasted = event.clipboardData?.getData('text') ?? ''
  const replacesAll =
    !box.value.trim() || (box.selectionStart === 0 && box.selectionEnd === box.value.length)
  if (!pasted.trim() || !replacesAll || isQuote.value) return
  isQuote.value = true
  tickedByPaste.value = true
}
const addBox = ref<HTMLElement>()
const add = useMutation({
  mutationFn: () =>
    api.addIdeaNote(props.publicationId, props.id ?? null, text.value, {
      readingItemId: props.linkId,
      quote: isQuote.value || undefined,
    }),
  onSuccess: async (note) => {
    text.value = ''
    isQuote.value = false
    tickedByPaste.value = false
    appendNote(note)
    // Taking a note marks the item read, which the list shows too.
    await Promise.all([refreshIdea(), invalidateRoots(queryClient, 'reading')])
    addBox.value?.querySelector('textarea')?.focus()
  },
})
</script>

<template>
  <p v-if="list.isPending.value">Loading…</p>
  <div v-else-if="list.isError.value || !item" role="alert" class="panel p-6">
    <h1 class="font-display text-lg">We couldn't open that reading-list item</h1>
    <p class="mt-1 text-ink-soft">
      It may have been removed from the reading list, or the connection may have dropped. Try
      reloading the page.
    </p>
    <RouterLink :to="backTo" class="mt-3 inline-block underline">
      Back to the reading list
    </RouterLink>
  </div>

  <article v-else aria-labelledby="reading-heading" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="backTo" class="underline">{{ backLabel }}</RouterLink>
    </p>
    <div class="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <h1
        id="reading-heading"
        class="min-w-[12rem] flex-1 font-display text-2xl font-semibold break-words"
      >
        {{ label }}
      </h1>
      <button
        v-if="!editingTitle"
        ref="titleButton"
        type="button"
        class="btn btn-neutral"
        @click="startEditingTitle"
      >
        Edit title and authors
      </button>
    </div>
    <p v-if="item.authors.length" class="mb-2 text-ink">By {{ nameList(item.authors) }}</p>
    <p
      v-if="(!item.title || !item.authors.length) && !editingTitle"
      class="mb-3 text-sm text-ink-soft"
    >
      <template v-if="!item.title">
        We couldn't find this page's title, so it is shown by its address.
      </template>
      <template v-if="!item.authors.length">
        We don't know who wrote it. Add the authors if you can see them on the page.
      </template>
    </p>
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
        hint="Who wrote it. Separate names with commas."
      />
      <div class="flex gap-2">
        <button type="submit" class="btn btn-primary" :disabled="saveTitle.isPending.value">
          {{ saveTitle.isPending.value ? 'Saving…' : 'Save details' }}
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

    <section aria-labelledby="page-heading" class="mb-8">
      <h2 id="page-heading" class="sr-only">The page</h2>
      <p class="mb-2">
        <NewTabLink :href="item.url" class="underline">Open the page</NewTabLink>
        <span class="block truncate text-sm text-ink-soft">{{ item.url }}</span>
      </p>
      <p class="mb-3 text-sm text-ink-soft">
        Most websites can't be shown inside another page, so it opens in its own tab. Put the two
        tabs side by side if you can, and keep this one open to write down what you find.
      </p>
      <SwitchField
        ref="readSwitch"
        :model-value="!!item.readAt"
        label="I have read this"
        :disabled="setRead.isPending.value"
        @update:model-value="toggleRead"
      />
      <p v-if="setRead.isError.value" role="alert" class="mt-1 text-sm text-danger">
        Couldn't save that. Please try again.
      </p>
    </section>

    <section aria-labelledby="more-links-heading" class="mb-8">
      <h2 id="more-links-heading" class="mb-1 font-display text-xl font-semibold">
        Other pages worth reading
      </h2>
      <p class="mb-3 text-sm text-ink-soft">
        Does this page link to something else you should read? Paste its web address to put it on
        the reading list, and carry on here.
      </p>
      <form @submit.prevent="submitLink">
        <TextField
          v-model="linkUrl"
          label="Web address"
          required
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :invalid="addLink.isError.value"
          :hint="
            addLink.isError.value
              ? errorMessage(addLink.error.value)
              : 'For example, https://example.org/article. We look up its title for you.'
          "
          @update:model-value="addLink.isError.value && addLink.reset()"
        />
        <button type="submit" class="btn btn-outline" :disabled="addLink.isPending.value">
          {{ addLink.isPending.value ? 'Adding…' : 'Add to reading list' }}
        </button>
      </form>
      <p role="status" class="mt-2 text-sm">
        <template v-if="justAdded">
          Added “{{ justAdded.label }}” to the reading list.
          <RouterLink :to="readingRoute(owner, justAdded.id)" class="underline">
            Read it and take notes
          </RouterLink>
        </template>
      </p>
    </section>

    <section aria-labelledby="reading-notes-heading">
      <h2 id="reading-notes-heading" class="mb-1 font-display text-xl font-semibold">
        Notes from this page
      </h2>
      <p class="mb-3 text-sm text-ink-soft">
        Paste a quote, or put it in your own words. Each note keeps a link back to this page, and
        joins the rest of {{ id ? 'the idea’s' : 'the publication’s' }} notes. The newest is listed
        first. Say when something is a direct quote, so it can't be mistaken for your own words
        later.
      </p>

      <QueryState :query="notes" what="the notes" loading="Loading notes…">
        <!-- Above the notes, so it stays where it is as they pile up beneath it. -->
        <form ref="addBox" class="mb-6" @submit.prevent="add.mutate()">
          <TextAreaField
            v-model="text"
            label="Add a note from this page"
            :rows="4"
            :maxlength="20000"
            :hint="add.isError.value ? errorMessage(add.error.value) : undefined"
            @paste="onPaste"
          />
          <label class="mb-1 flex items-start gap-2 text-sm">
            <input
              v-model="isQuote"
              type="checkbox"
              class="mt-0.5 size-4 accent-accent"
              @change="tickedByPaste = false"
            />
            <span>
              This is a direct quote.
              <span class="block text-ink-soft">
                It is kept word for word: it can't be edited afterwards, and goes into a draft as a
                quotation, with a link to this page.
              </span>
            </span>
          </label>
          <p aria-live="polite" class="mb-3 ml-6 text-sm text-ink-soft" data-paste-note>
            <template v-if="tickedByPaste && isQuote">
              Ticked because you pasted this. Untick it if these are your own words.
            </template>
          </p>
          <button
            type="submit"
            class="btn btn-outline"
            :disabled="add.isPending.value || !text.trim()"
          >
            {{ add.isPending.value ? 'Adding…' : 'Add note' }}
          </button>
        </form>

        <p v-if="!itemNotes.length" class="mb-4 text-ink-soft">
          No notes from this page yet. Add the first above.
        </p>
        <ul v-else class="mb-4 divide-y divide-line rounded-ctl border border-line bg-surface">
          <li v-for="note in itemNotes" :key="note.id" class="px-4 py-3">
            <NoteText :note="note" />
            <p class="mt-1 text-xs text-ink-soft">
              <NoteOrigin
                :phrase="noteOriginPhrase(note, list.links.value ?? [])"
                :author-name="note.authorName"
              />
            </p>
          </li>
        </ul>
      </QueryState>
    </section>
  </article>
</template>
