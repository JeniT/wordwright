<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { errorMessage } from '../lib/api'
import { articleBackRoute, articleRoute, useArticleActions, useArticleList } from '../lib/articles'
import FieldWithAction from './FieldWithAction.vue'
import TextField from './TextField.vue'

/**
 * The box that adds a web address to the articles of an idea, or (no `ideaId`) of the publication. It sits above
 * the list, so it stays where it is as items pile up; what was just added is said under it, with a way to open it.
 * It is the only such form: Quick add shows it too, and passes `place` because there the list isn't on screen.
 */
const props = defineProps<{
  publicationId: string
  ideaId: string | null
  /** Whose list it went to ("Blog", "this idea"), said only when the list isn't the page being looked at. */
  place?: string
}>()
const emit = defineEmits<{ added: [] }>()
const owner = () => ({ publicationId: props.publicationId, ideaId: props.ideaId })
const { add, listOf } = useArticleActions(owner)
const list = useArticleList(owner)

const linkUrl = ref('')
// `id` is null when the new item couldn't be told apart (the list hadn't loaded), so the link goes to the list.
const justAdded = ref<{ id: string | null; label: string | null; place?: string } | null>(null)
// The message points to the list, so it stays until the next address is started, then goes.
function typing() {
  justAdded.value = null
  if (add.isError.value) add.reset()
}
// On failure what was typed stays in the field, with the reason shown under it.
function submit() {
  const before = list.articles.value && new Set(list.articles.value.map((l) => l.id))
  const typed = linkUrl.value
  const place = props.place
  justAdded.value = null
  add.mutate(linkUrl.value, {
    onSuccess: (saved) => {
      const after = listOf(saved)
      // Quick add can add before the list was ever loaded; then the address typed is the best clue to the new item.
      const item = before
        ? after.find((l) => !before.has(l.id))
        : after.find((l) => l.url === typed)
      justAdded.value = item
        ? { id: item.id, label: item.title || item.url, place }
        : { id: null, label: null, place }
      linkUrl.value = ''
      emit('added')
    },
  })
}
</script>

<template>
  <form @submit.prevent="submit">
    <FieldWithAction action="Add article" busy-text="Adding…" :busy="add.isPending.value">
      <TextField
        v-model="linkUrl"
        label="Web address"
        required
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :invalid="add.isError.value"
        :hint="add.isError.value ? errorMessage(add.error.value) : 'We will look up its title.'"
        @update:model-value="typing"
      />
    </FieldWithAction>
    <p aria-live="polite" class="mt-2 text-sm">
      <template v-if="justAdded">
        <template v-if="justAdded.id && justAdded.label">
          Added “{{ justAdded.label }}”{{
            justAdded.place ? ` to ${justAdded.place}’s articles` : ''
          }}.
          <RouterLink :to="articleRoute(owner(), justAdded.id)" class="underline">
            Open “{{ justAdded.label }}”
          </RouterLink>
        </template>
        <template v-else>
          Added{{ justAdded.place ? ` to ${justAdded.place}’s articles` : '' }}.
          <RouterLink :to="articleBackRoute(owner())" class="underline">
            Open the articles
          </RouterLink>
        </template>
      </template>
    </p>
  </form>
</template>
