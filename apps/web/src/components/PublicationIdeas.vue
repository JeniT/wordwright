<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ConfirmDialog from './ConfirmDialog.vue'
import Icon from './Icon.vue'
import ListToolbar from './ListToolbar.vue'
import MoveIdeasFields from './MoveIdeasFields.vue'
import LandingSection from './LandingSection.vue'
import { plural, useMoveIdeasFlow } from '../lib/move'
import { useIdeas } from '../lib/queries'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'
import { vTip } from '../lib/tip'

/**
 * The publication's ideas, for its landing page: all of them, to choose what to work on next, with the toolbar for
 * moving some to another publication. New ideas start in Quick add, above.
 */
const props = defineProps<{ publicationId: string }>()
const ideas = useIdeas(() => props.publicationId)
const flow = useMoveIdeasFlow(
  () => props.publicationId,
  () => ideas.data.value ?? [],
)
</script>

<template>
  <LandingSection
    title="Ideas"
    explain="An idea is something you want to write about. You can add notes, keep a reading list and have several drafts under each idea."
  >
    <QueryState :query="ideas" what="ideas">
      <p v-if="!ideas.data.value?.length" class="text-ink-soft">No ideas yet.</p>
      <RowList v-else :items="ideas.data.value" label="Ideas" bare class="mb-4">
        <template #toolbar>
          <!-- The whole list is one page, so the page and the total are the same. -->
          <ListToolbar
            :page-size="ideas.data.value.length"
            :total="ideas.data.value.length"
            :selected="flow.chosen.length"
            :selected-on-page="flow.chosen.length"
            noun="ideas"
            :form-open="flow.moving"
            :confirm-label="flow.confirmLabel"
            :can-confirm="flow.canMove"
            @toggle-page="flow.selectAll"
            @select-everything="flow.selectAll(true)"
            @confirm="flow.move"
            @cancel="flow.toggleMoving"
          >
            <template #actions>
              <button
                v-if="flow.others.length"
                type="button"
                class="btn btn-sm btn-neutral"
                @click="flow.toggleMoving"
              >
                Move to…
              </button>
            </template>
            <template #form>
              <MoveIdeasFields :flow="flow" />
            </template>
          </ListToolbar>
        </template>
        <template #rail="{ item: idea }">
          <!-- With one idea there is no toolbar to act from, so nothing to select for. -->
          <div v-if="ideas.data.value!.length > 1" class="list-rail">
            <input
              type="checkbox"
              :checked="flow.selected.includes(idea.id)"
              :aria-label="`Select ${idea.name}`"
              @change="flow.toggle(idea.id, ($event.target as HTMLInputElement).checked)"
            />
          </div>
        </template>
        <template #default="{ item: idea }">
          <div class="flex items-center">
            <RouterLink
              :to="{ name: 'idea', params: { publicationId, id: idea.id } }"
              class="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
            >
              <span class="text-lg font-semibold">{{ idea.name }}</span>
              <span class="meta shrink-0">
                {{ plural(idea.draftCount, 'draft', 'drafts') }}
              </span>
            </RouterLink>
            <button
              v-if="flow.others.length"
              v-tip="'Move to another publication'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost mx-2 shrink-0"
              :aria-label="`Move ${idea.name}`"
              @click="flow.startOne(idea.id)"
            >
              <Icon name="move" />
            </button>
          </div>
        </template>
      </RowList>
    </QueryState>
    <ConfirmDialog
      :open="!!flow.one"
      :title="`Move ${ideas.data.value?.find((i) => i.id === flow.one)?.name ?? 'this idea'}`"
      :confirm-label="flow.mover.isPending ? 'Moving…' : 'Move idea'"
      confirm-tone="primary"
      :can-confirm="flow.canMove"
      :busy="flow.mover.isPending"
      busy-label="Moving…"
      @confirm="flow.move"
      @cancel="flow.stopOne"
    >
      <MoveIdeasFields :flow="flow" />
    </ConfirmDialog>
  </LandingSection>
</template>
