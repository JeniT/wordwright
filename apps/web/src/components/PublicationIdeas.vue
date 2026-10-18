<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ListToolbar from './ListToolbar.vue'
import Explain from './Explain.vue'
import LandingSection from './LandingSection.vue'
import { errorMessage } from '../lib/api'
import { ideaMoveContents, nameList, plural, useMoveIdeasFlow } from '../lib/move'
import { useIdeas } from '../lib/queries'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

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
  <LandingSection title="Ideas">
    <QueryState :query="ideas" what="ideas">
      <template v-if="!ideas.data.value?.length">
        <p class="text-ink-soft">No ideas yet.</p>
        <Explain tutorial-only>
          An idea is something you want to write about. It keeps its own notes, reading and drafts.
        </Explain>
      </template>
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
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label for="move-ideas-to" class="text-sm font-medium">Move to</label>
                <select
                  id="move-ideas-to"
                  v-model="flow.target"
                  class="field field-compact max-w-full !w-auto"
                >
                  <option value="" disabled>Choose a publication…</option>
                  <option v-for="p in flow.others" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div v-if="flow.target" class="mt-2 text-sm" aria-live="polite" data-move-says>
                <p v-if="flow.preview.isPending">Checking what will move…</p>
                <p v-else-if="flow.preview.isError" role="alert" class="text-danger">
                  {{ errorMessage(flow.preview.error) }}
                </p>
                <template v-else-if="flow.preview.data">
                  <p v-if="flow.preview.data.problem" role="alert" class="text-danger">
                    {{ flow.preview.data.problem }}
                  </p>
                  <template v-else>
                    <p>
                      {{ ideaMoveContents(flow.preview.data) }} will move to “{{
                        flow.targetName
                      }}”.
                    </p>
                    <p v-if="flow.preview.data.losingAccess.length" class="mt-1 text-ink-soft">
                      {{ nameList(flow.preview.data.losingAccess) }}
                      {{
                        flow.preview.data.losingAccess.length === 1
                          ? 'isn’t a member'
                          : 'aren’t members'
                      }}
                      of “{{ flow.targetName }}”, so will no longer be able to see
                      {{ flow.chosen.length === 1 ? 'it' : 'them' }}. Their comments stay.
                    </p>
                  </template>
                </template>
              </div>
              <p v-if="flow.mover.isError" role="alert" class="mt-2 text-sm text-danger">
                {{ errorMessage(flow.mover.error) }}
              </p>
            </template>
          </ListToolbar>
        </template>
        <template #rail="{ item: idea }">
          <div class="list-rail">
            <input
              type="checkbox"
              :checked="flow.selected.includes(idea.id)"
              :aria-label="`Select ${idea.name}`"
              @change="flow.toggle(idea.id, ($event.target as HTMLInputElement).checked)"
            />
          </div>
        </template>
        <template #default="{ item: idea }">
          <RouterLink
            :to="{ name: 'idea', params: { publicationId, id: idea.id } }"
            class="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="text-lg font-semibold">{{ idea.name }}</span>
            <span class="meta shrink-0">
              {{ plural(idea.draftCount, 'draft', 'drafts') }}
            </span>
          </RouterLink>
        </template>
      </RowList>
    </QueryState>
  </LandingSection>
</template>
