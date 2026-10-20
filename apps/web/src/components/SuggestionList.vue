<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, useId } from 'vue'
import type { Idea, Proposal, ResearchItem } from '@wordwright/core'
import { api } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import type { PostDecision } from '../lib/recent-posts'
import ResearchItemRow from './ResearchItemRow.vue'
import SaveStatus from './SaveStatus.vue'
import SuggestedIdeaRow from './SuggestedIdeaRow.vue'
import SuggestedNoteRow from './SuggestedNoteRow.vue'

/**
 * What your AI suggested in one reply, as lists above its words: notes, pages to read, then ideas and titles. Each
 * is a suggestion only; nothing changes until a person adds it. Several people may decide, so the first to do so wins
 * and the others see the result when the thread is read again.
 */
const props = defineProps<{
  publicationId: string
  ideaId: string
  conversationId: string
  proposals: readonly Proposal[]
  idea: Idea
}>()
const queryClient = useQueryClient()
const ids = { notes: useId(), reading: useId(), ideas: useId() }

const notes = computed(() => props.proposals.filter((p) => p.tool === 'suggest_note'))
const reading = computed(() => props.proposals.filter((p) => p.tool === 'suggest_reading'))
const ideas = computed(() =>
  props.proposals.filter((p) => p.tool === 'create_idea' || p.tool === 'update_idea'),
)
const anyWaiting = computed(() => props.proposals.some((p) => p.status === 'pending'))

// Whatever happens, the thread, the idea and its notes may have changed (someone else may have decided it first).
const refresh = () => invalidateRoots(queryClient, 'conversation', 'idea', 'ideas', 'notes')
const decide = useMutation({
  mutationFn: ({
    proposal,
    what,
  }: {
    proposal: Proposal
    what: 'accept' | 'dismiss' | 'reopen'
  }) =>
    what === 'accept'
      ? api.acceptProposal(
          props.publicationId,
          props.ideaId,
          props.conversationId,
          proposal.id,
          proposal.stale,
        )
      : what === 'dismiss'
        ? api.dismissProposal(props.publicationId, props.ideaId, props.conversationId, proposal.id)
        : api.reconsiderProposal(
            props.publicationId,
            props.ideaId,
            props.conversationId,
            proposal.id,
          ),
  onSettled: refresh,
})
const edit = useMutation({
  mutationFn: ({
    proposal,
    changes,
  }: {
    proposal: Proposal
    changes: { text?: string; name?: string; notes?: string }
  }) =>
    api.editProposal(props.publicationId, props.ideaId, props.conversationId, proposal.id, changes),
  onSettled: refresh,
})
const busy = computed(() => decide.isPending.value || edit.isPending.value)
const save = (proposal: Proposal) => (changes: { text?: string; name?: string; notes?: string }) =>
  edit.mutateAsync({ proposal, changes })

/** A suggested page, as the Research page lists its findings, so the two look alike. */
function asItem(p: Proposal): ResearchItem {
  return {
    id: p.id,
    url: p.input.url ?? '',
    title: p.input.title ?? '',
    why: p.input.why ?? '',
    check: p.reading?.check ?? 'found',
    fetchedTitle: p.reading?.fetchedTitle ?? null,
    fetchedAuthors: p.reading?.fetchedAuthors ?? [],
    status: p.status === 'pending' ? 'suggested' : p.status === 'accepted' ? 'added' : 'dismissed',
  }
}
const readingDecision = (proposal: Proposal, what: PostDecision) =>
  decide.mutate({
    proposal,
    what: what === 'add' ? 'accept' : what === 'ignore' ? 'dismiss' : 'reopen',
  })
</script>

<template>
  <div v-if="proposals.length" class="mr-8 space-y-3">
    <p v-if="anyWaiting" class="text-sm">
      <span class="bg-mark">Highlighted text is what your AI suggested.</span>
    </p>

    <section v-if="notes.length" :aria-labelledby="ids.notes">
      <h3 :id="ids.notes" class="mb-1 text-sm font-medium text-ink-soft">Suggested notes</h3>
      <ul class="divide-y divide-line rounded-ctl border border-line bg-surface">
        <SuggestedNoteRow
          v-for="proposal in notes"
          :key="proposal.id"
          :proposal="proposal"
          :busy="busy"
          :save="save(proposal)"
          @decide="(what) => decide.mutate({ proposal, what })"
        />
      </ul>
    </section>

    <section v-if="reading.length" :aria-labelledby="ids.reading">
      <h3 :id="ids.reading" class="mb-1 text-sm font-medium text-ink-soft">Suggested reading</h3>
      <ul class="divide-y divide-line rounded-ctl border border-line bg-surface">
        <ResearchItemRow
          v-for="proposal in reading"
          :key="proposal.id"
          :item="asItem(proposal)"
          :busy="busy"
          :undoable="proposal.status === 'dismissed'"
          @decide="(what) => readingDecision(proposal, what)"
        />
      </ul>
    </section>

    <section v-if="ideas.length" :aria-labelledby="ids.ideas">
      <h3 :id="ids.ideas" class="mb-1 text-sm font-medium text-ink-soft">Suggested ideas</h3>
      <ul class="divide-y divide-line rounded-ctl border border-line bg-surface">
        <SuggestedIdeaRow
          v-for="proposal in ideas"
          :key="proposal.id"
          :publication-id="publicationId"
          :idea="idea"
          :proposal="proposal"
          :busy="busy"
          :save="save(proposal)"
          @decide="(what) => decide.mutate({ proposal, what })"
        />
      </ul>
    </section>

    <SaveStatus :mutation="[decide, edit]" saved="" />
  </div>
</template>
