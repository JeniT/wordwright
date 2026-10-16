<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ListToolbar from '../components/ListToolbar.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { errorMessage } from '../lib/api'
import { ideaMoveContents, useIdeaMovePreview, useMoveIdeas } from '../lib/move'
import { useIdeas } from '../lib/queries'
import { usePublications } from '../lib/usePublications'
import QueryState from '../components/QueryState.vue'

/** Step 03 of a publication: choose which idea to work on next. */
const props = defineProps<{ publicationId: string }>()
const ideas = useIdeas(() => props.publicationId)
const router = useRouter()

// ---- selecting ideas, to move them to another publication
const selected = ref<string[]>([])
/** The selected ideas that still exist (one that was moved or deleted meanwhile is not counted). */
const chosen = computed(() =>
  (ideas.data.value ?? []).filter((i) => selected.value.includes(i.id)).map((i) => i.id),
)
const toggle = (id: string, on: boolean) =>
  (selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id))
const selectAll = (on: boolean) =>
  (selected.value = on ? (ideas.data.value ?? []).map((i) => i.id) : [])

// Moving is offered only to someone with another publication to move to.
const publications = usePublications()
const others = computed(() =>
  (publications.data.value ?? []).filter((p) => p.id !== props.publicationId),
)
const moving = ref(false)
const target = ref('')
const preview = useIdeaMovePreview(
  () => props.publicationId,
  () => chosen.value,
  () => (moving.value ? target.value : ''),
)
const mover = useMoveIdeas(() => props.publicationId)
const targetName = computed(() => others.value.find((p) => p.id === target.value)?.name ?? '')
function toggleMoving() {
  moving.value = !moving.value
  target.value = ''
  mover.reset()
}
const canMove = computed(
  () =>
    !!preview.data.value &&
    !preview.data.value.problem &&
    !preview.isFetching.value &&
    !mover.isPending.value,
)
const plural = (n: number) => `${n} ${n === 1 ? 'idea' : 'ideas'}`
const confirmLabel = computed(() =>
  mover.isPending.value ? 'Moving…' : `Move ${plural(chosen.value.length)}`,
)
function move() {
  if (!canMove.value) return
  const ids = chosen.value
  const to = target.value
  mover.mutate(
    { ids, to },
    {
      onSuccess: () => {
        moving.value = false
        selected.value = []
        // Land on the idea where it is now (or on the list, for several).
        void router.push(
          ids.length === 1
            ? { name: 'idea', params: { publicationId: to, id: ids[0]! } }
            : { name: 'publication-ideas', params: { publicationId: to } },
        )
      },
    },
  )
}
/** Names, as a sentence: "Bob", "Bob and Cy", "Bob, Cy and Di". */
const nameList = (names: string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <StepHeading>Ideas</StepHeading>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <p class="max-w-prose text-ink-soft">Choose what to work on next.</p>
      <RouterLink :to="{ name: 'new-idea', params: { publicationId } }" class="btn btn-primary">
        New idea
      </RouterLink>
    </div>
    <QueryState :query="ideas" what="ideas">
      <p v-if="!ideas.data.value?.length" class="text-ink-soft">
        No ideas yet. When one occurs to you, note it down here, then draft it from there.
      </p>
      <div v-else class="mb-4 overflow-hidden rounded-ctl border border-line bg-surface">
        <ListToolbar
          :page-size="ideas.data.value.length"
          :total="ideas.data.value.length"
          :selected="chosen.length"
          :selected-on-page="chosen.length"
          noun="ideas"
          :form-open="moving"
          :confirm-label="confirmLabel"
          :can-confirm="canMove"
          @toggle-page="selectAll"
          @select-everything="selectAll(true)"
          @confirm="move"
          @cancel="toggleMoving"
        >
          <template #actions>
            <button
              v-if="others.length"
              type="button"
              class="btn btn-sm btn-neutral"
              @click="toggleMoving"
            >
              Move to…
            </button>
          </template>
          <template #form>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label for="move-ideas-to" class="text-sm font-medium">Move to</label>
              <select
                id="move-ideas-to"
                v-model="target"
                class="field field-compact max-w-full !w-auto"
              >
                <option value="" disabled>Choose a publication…</option>
                <option v-for="p in others" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div v-if="target" class="mt-2 text-sm" aria-live="polite" data-move-says>
              <p v-if="preview.isPending.value">Checking what will move…</p>
              <p v-else-if="preview.isError.value" role="alert" class="text-danger">
                {{ errorMessage(preview.error.value) }}
              </p>
              <template v-else-if="preview.data.value">
                <p v-if="preview.data.value.problem" role="alert" class="text-danger">
                  {{ preview.data.value.problem }}
                </p>
                <template v-else>
                  <p>{{ ideaMoveContents(preview.data.value) }} will move to “{{ targetName }}”.</p>
                  <p v-if="preview.data.value.losingAccess.length" class="mt-1 text-ink-soft">
                    {{ nameList(preview.data.value.losingAccess) }}
                    {{
                      preview.data.value.losingAccess.length === 1
                        ? 'isn’t a member'
                        : 'aren’t members'
                    }}
                    of “{{ targetName }}”, so will no longer be able to see
                    {{ chosen.length === 1 ? 'it' : 'them' }}. Their comments stay.
                  </p>
                </template>
              </template>
            </div>
            <p v-if="mover.isError.value" role="alert" class="mt-2 text-sm text-danger">
              {{ errorMessage(mover.error.value) }}
            </p>
          </template>
        </ListToolbar>
        <ul class="divide-y divide-line">
          <li v-for="idea in ideas.data.value" :key="idea.id" class="flex items-stretch">
            <div class="list-rail">
              <input
                type="checkbox"
                :checked="selected.includes(idea.id)"
                :aria-label="`Select ${idea.name}`"
                @change="toggle(idea.id, ($event.target as HTMLInputElement).checked)"
              />
            </div>
            <RouterLink
              :to="{ name: 'idea', params: { publicationId, id: idea.id } }"
              class="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
            >
              <span class="text-lg font-semibold">{{ idea.name }}</span>
              <span class="meta shrink-0">
                {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </QueryState>
  </PublicationGate>
</template>
