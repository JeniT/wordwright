import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { RecentPost } from '@wordwright/core'
import { computed, ref } from 'vue'
import { api } from './api'
import { invalidateRoots } from './queries'

export type PostDecision = 'add' | 'ignore' | 'reconsider'

/**
 * Deciding about a post from the feeds: add it to the reading list, ignore it, or take either back. The Search page
 * and the publication's landing page both show these rows, so both use this; every list that holds posts is refreshed
 * afterwards, which is how each one hears of a decision made in the other.
 */
export function useDecidePosts(publicationId: () => string) {
  const queryClient = useQueryClient()
  const notice = ref('') // said out loud to screen readers after each decision
  const decide = useMutation({
    mutationFn: ({ what, post }: { what: PostDecision; post: RecentPost }) =>
      api.decideFeedPosts(publicationId(), what, [{ sourceId: post.sourceId, postId: post.id }]),
    onSuccess: (_, { what, post }) => {
      notice.value =
        what === 'add'
          ? `Added “${post.title}” to the reading list.`
          : what === 'ignore'
            ? `Ignored “${post.title}”.`
            : `“${post.title}” is back in recent posts.`
    },
    // Whatever happened, someone else may have decided first: show how things are now.
    onSettled: () => invalidateRoots(queryClient, 'recent-posts', 'reading', 'ideas'),
  })
  return { decide, notice, busy: computed(() => decide.isPending.value) }
}
