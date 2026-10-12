import { describe, expect, it } from 'vitest'
import { invalidateRoots, queryKeys, refreshIdea, refreshNotesEverywhere } from './queries'

describe('queryKeys', () => {
  it('names the profile’s own notes the same wherever they are asked for', () => {
    // A screen that spelled this differently would write to a cache entry nobody else reads.
    expect(queryKeys.notes('p', null)).toEqual(['notes', 'p', 'profile'])
    expect(queryKeys.notes('p', undefined)).toEqual(queryKeys.notes('p', null))
    expect(queryKeys.notes('p', 'i1')).toEqual(['notes', 'p', 'i1'])
  })

  it('starts every key with its root, so invalidating the root reaches it', () => {
    expect(queryKeys.idea('p', 'i')[0]).toBe('idea')
    expect(queryKeys.ideas('p')[0]).toBe('ideas')
    expect(queryKeys.sources('p')[0]).toBe('sources')
    expect(queryKeys.draft('p', 'd')[0]).toBe('draft')
    expect(queryKeys.recentPosts('p', 7, 'a,b')[0]).toBe('recent-posts')
  })
})

/** Records what was invalidated. */
function fakeClient() {
  const keys: unknown[][] = []
  const client = {
    invalidateQueries: async ({ queryKey }: { queryKey: unknown[] }) => void keys.push(queryKey),
  }
  return { client: client as never, keys }
}

describe('refreshing', () => {
  it('invalidateRoots refreshes each root', async () => {
    const { client, keys } = fakeClient()
    await invalidateRoots(client, 'idea', 'ideas')
    expect(keys).toEqual([['idea'], ['ideas']])
  })

  it('a change to notes refreshes the notes, the idea, the ideas list and the draft insertions', async () => {
    const { client, keys } = fakeClient()
    await refreshNotesEverywhere(client)
    expect(keys.map((k) => k[0])).toEqual(['notes', 'idea', 'ideas', 'draft-insertions'])
  })

  it('an idea’s change refreshes that idea and the list; the profile’s own notes touch neither', async () => {
    const { client, keys } = fakeClient()
    await refreshIdea(client, 'p', 'i1')
    expect(keys).toEqual([['idea', 'p', 'i1'], ['ideas']])
    keys.length = 0
    await refreshIdea(client, 'p', null)
    expect(keys).toEqual([])
  })
})
