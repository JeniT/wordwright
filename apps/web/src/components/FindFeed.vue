<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import {
  FEED_GUIDES,
  FEED_RECIPES,
  RECIPE_GROUP_LABELS,
  findRecipe,
  type RecipeGroup,
  type SourcePreview,
} from '@lfwa/core'
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'
import TextField from './TextField.vue'

const props = defineProps<{ profileId: string }>()
const queryClient = useQueryClient()

const GROUPS = Object.keys(RECIPE_GROUP_LABELS) as RecipeGroup[]
const choice = ref('') // a recipe id, a guide id, or '' for none yet
const values = ref<Record<string, string>>({})
const problem = ref('') // the recipe couldn't make an address from what was typed
const found = ref<SourcePreview | null>(null)
const notice = ref('')

const recipe = computed(() => findRecipe(choice.value))
const guide = computed(() => FEED_GUIDES.find((g) => g.id === choice.value))

// Start each choice afresh, with the first option of each list chosen.
watch(choice, () => {
  values.value = {}
  for (const field of recipe.value?.fields ?? []) {
    values.value[field.id] = field.kind === 'select' ? field.options[0]!.value : ''
  }
  problem.value = ''
  found.value = null
  look.reset()
  add.reset()
})

const look = useMutation({
  mutationFn: (url: string) => api.previewSource(props.profileId, url),
  onSuccess: (feed) => (found.value = feed),
})

const add = useMutation({
  mutationFn: (feed: SourcePreview) => api.addSource(props.profileId, feed.url),
  onSuccess: async (added) => {
    notice.value = `Added ${added.title ?? added.url}`
    found.value = null
    choice.value = ''
    await queryClient.invalidateQueries({ queryKey: ['sources'] })
  },
})

function find() {
  const r = recipe.value
  if (!r) return
  problem.value = ''
  found.value = null
  look.reset()
  add.reset()
  const result = r.build(values.value)
  if (!result.ok) {
    problem.value = result.message
    return
  }
  look.mutate(result.url)
}

const selectClass =
  'w-full rounded border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent'
</script>

<template>
  <details class="mt-6 rounded border border-stone-200 bg-white p-4">
    <summary class="cursor-pointer font-medium">Find a feed</summary>
    <p class="mt-2 mb-4 text-sm text-stone-600">
      Not sure where a site’s feed is? Choose where you’d like to follow something, say what, and
      we’ll work out the address and check it before you add it.
    </p>

    <div class="mb-4">
      <label for="find-feed-where" class="mb-1 block text-sm font-medium">Where from</label>
      <select id="find-feed-where" v-model="choice" :class="selectClass">
        <option value="">Choose…</option>
        <optgroup v-for="g in GROUPS" :key="g" :label="RECIPE_GROUP_LABELS[g]">
          <option v-for="r in FEED_RECIPES.filter((x) => x.group === g)" :key="r.id" :value="r.id">
            {{ r.name }}
          </option>
        </optgroup>
        <optgroup label="No feed to build">
          <option v-for="g in FEED_GUIDES" :key="g.id" :value="g.id">{{ g.name }}</option>
        </optgroup>
      </select>
    </div>

    <section v-if="guide" :aria-label="guide.name" class="text-sm">
      <p class="mb-2">{{ guide.summary }}</p>
      <ol class="list-decimal space-y-1 pl-5">
        <li v-for="step in guide.steps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <form v-else-if="recipe" :aria-label="recipe.name" @submit.prevent="find">
      <p class="mb-3 text-sm text-stone-700">{{ recipe.summary }}</p>
      <template v-for="field in recipe.fields" :key="field.id">
        <TextField
          v-if="field.kind === 'text'"
          v-model="values[field.id]!"
          :label="field.label"
          :hint="field.hint"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
        />
        <div v-else class="mb-4">
          <label :for="`find-feed-${field.id}`" class="mb-1 block text-sm font-medium">
            {{ field.label }}
          </label>
          <select :id="`find-feed-${field.id}`" v-model="values[field.id]" :class="selectClass">
            <option v-for="o in field.options" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </div>
      </template>
      <p v-if="recipe.broad" class="mb-3 text-sm text-stone-700">
        This kind of feed covers a lot, so most of what it lists won’t matter to you.
      </p>
      <p v-if="recipe.caveat" class="mb-3 text-sm text-stone-700">{{ recipe.caveat }}</p>
      <button
        type="submit"
        class="rounded border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
        :disabled="look.isPending.value"
      >
        {{ look.isPending.value ? 'Checking…' : 'Find feed' }}
      </button>
    </form>

    <p v-if="problem" role="alert" class="mt-3 text-red-700">{{ problem }}</p>
    <p v-if="look.isError.value" role="alert" class="mt-3 text-red-700">
      {{ errorMessage(look.error.value) }}
      Check what you typed, or try a different choice above.
    </p>

    <div v-if="found" class="mt-4 rounded border border-stone-200 bg-stone-50 p-3">
      <p class="font-medium">{{ found.title }}</p>
      <p v-if="found.description" class="line-clamp-3 text-sm text-stone-700">
        {{ found.description }}
      </p>
      <p class="break-all text-xs text-stone-500">{{ found.url }}</p>
      <p v-if="found.alreadyAdded" class="mt-2 text-sm">This feed is already in your list.</p>
      <button
        v-else
        type="button"
        class="mt-2 rounded border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
        :disabled="add.isPending.value"
        @click="add.mutate(found)"
      >
        {{ add.isPending.value ? 'Adding…' : 'Add this feed' }}
      </button>
    </div>
    <p v-if="add.isError.value" role="alert" class="mt-3 text-red-700">
      {{ errorMessage(add.error.value) }}
    </p>
    <p aria-live="polite" aria-atomic="true" class="sr-only">{{ notice }}</p>
  </details>
</template>
