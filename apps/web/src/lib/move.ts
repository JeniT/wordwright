import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MoveResult, MoveTarget } from '@wordwright/core'
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'
import { invalidateRoots, queryKeys, useIdeas } from './queries'
import { usePublications } from './usePublications'

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Moved 2 items and 5 notes to “Rivers”." */
function moveSummary(result: MoveResult, destination: string): string {
  const parts = []
  if (result.articles) parts.push(plural(result.articles, 'item', 'items'))
  if (result.notes) parts.push(plural(result.notes, 'note', 'notes'))
  const what = parts.length ? parts.join(' and ') : 'nothing'
  const joined = result.merged
    ? ` ${plural(result.merged, 'item was', 'items were')} already there, so ${result.merged === 1 ? 'it was' : 'they were'} joined with ${result.merged === 1 ? 'it' : 'them'}.`
    : ''
  const copied = result.copied
    ? ` ${plural(result.copied, 'source was', 'sources were')} copied so the notes keep ${result.copied === 1 ? 'it' : 'them'}.`
    : ''
  return `Moved ${what} to ${destination}.${joined}${copied}`
}

/** What a move asks for: where the things are now (`from`) and where they go. */
interface MoveRequest {
  ids: string[]
  from: string | null
  to: string | null
  /** Set when they go to another publication. */
  toPublicationId?: string
  toName: string
}
const targetOf = (v: MoveRequest): MoveTarget =>
  v.toPublicationId ? { ideaId: v.to, publicationId: v.toPublicationId } : { ideaId: v.to }

/**
 * Moving articles (and, later, notes) between the publication's own lists and its ideas, saying what happened
 * and, where it can, offering to put it back. Everything that shows a list is refreshed afterwards.
 */
export function useMove(publicationId: () => string) {
  const queryClient = useQueryClient()
  /** What the last move did, and whether it can be undone (not when items were joined: that can't be unpicked). */
  const outcome = ref<{ text: string; undo: (() => void) | null } | null>(null)

  const refresh = () => invalidateRoots(queryClient, 'idea', 'ideas', 'articles', 'notes')

  /**
   * Undo asks the publication the things went to (`via`, when that was another) to send them back to where they were.
   * It works for someone who still belongs to both.
   */
  const back = (via: string | undefined, ideaId: string | null): MoveTarget =>
    via ? { ideaId, publicationId: publicationId() } : { ideaId }

  const undoMove = useMutation({
    mutationFn: ({ ids, ideaId, via }: { ids: string[]; ideaId: string | null; via?: string }) =>
      api.moveArticles(via ?? publicationId(), ids, back(via, ideaId)),
    onSuccess: () => {
      outcome.value = { text: 'Moved back.', undo: null }
    },
    onSettled: refresh,
  })

  /** `from` is where the items are now (an idea, or null for the publication's list); `to` names where they go. */
  const moveArticles = useMutation({
    mutationFn: (v: MoveRequest) => api.moveArticles(publicationId(), v.ids, targetOf(v)),
    onSuccess: (result, v) => {
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: result.merged
          ? null
          : () => undoMove.mutate({ ids: v.ids, ideaId: v.from, via: v.toPublicationId }),
      }
    },
    onSettled: refresh,
  })

  const undoNotes = useMutation({
    mutationFn: ({
      ids,
      ideaId,
      via,
    }: {
      ids: string[]
      ideaId: string | null
      via?: string
      note: string
    }) => api.moveNotes(via ?? publicationId(), ids, back(via, ideaId)),
    onSuccess: (_, v) => {
      outcome.value = { text: `Moved back.${v.note}`, undo: null }
    },
    onSettled: refresh,
  })

  /**
   * Notes move to the end of where they go, each with its source copied there (the originals stay). Undo moves the
   * notes back (to the end of where they were); the copied sources stay where they were put.
   */
  const moveNotes = useMutation({
    mutationFn: (v: MoveRequest) => api.moveNotes(publicationId(), v.ids, targetOf(v)),
    onSuccess: (result, v) => {
      const note = result.copied
        ? result.copied === 1
          ? ` The page copied to ${v.toName} stays in its articles.`
          : ` The ${result.copied} pages copied to ${v.toName} stay in its articles.`
        : ''
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: () => undoNotes.mutate({ ids: v.ids, ideaId: v.from, via: v.toPublicationId, note }),
      }
    },
    onSettled: refresh,
  })

  return {
    outcome,
    moveArticles,
    undoMove,
    moveNotes,
    undoNotes,
    dismiss: () => (outcome.value = null),
  }
}

export const NEW_IDEA = '__new'
/** The first choice that leads to a second one: a publication, then somewhere in it. */
export const OTHER_PUBLICATION = '__other'

/**
 * Where to move to: the publication's own list (when moving from an idea), one of the other ideas, a new idea named
 * in the writer's own words, or, for someone with more than one publication, somewhere in another of theirs (a
 * publication first, then its own list, one of its ideas or a new idea). `publicationName` is how the publication's
 * own list is called in the message ("the publication's articles", "the publication's notes"). Returned reactive,
 * so it can be handed to `MoveTo` and read in templates without `.value`.
 */
export function useMoveDestination(
  publicationId: () => string,
  currentIdeaId: () => string | null,
  publicationName: string,
) {
  const ideas = useIdeas(publicationId)
  const publications = usePublications()
  const destination = ref('') // 'publication', an idea's id, NEW_IDEA or OTHER_PUBLICATION
  const newIdeaName = ref('')
  const otherPublicationId = ref('') // when destination is OTHER_PUBLICATION
  const otherDestination = ref('') // 'publication', an idea's id or NEW_IDEA, in that publication
  const others = computed(() => (ideas.data.value ?? []).filter((i) => i.id !== currentIdeaId()))
  /** The person's other publications; none (so no way in) for someone with only this one. */
  const otherPublications = computed(() =>
    (publications.data.value ?? []).filter((p) => p.id !== publicationId()),
  )
  const crossing = computed(() => destination.value === OTHER_PUBLICATION)
  const otherPublication = computed(() =>
    otherPublications.value.find((p) => p.id === otherPublicationId.value),
  )
  // Only asked for once there is a publication to ask about.
  const otherIdeas = useIdeas(
    () => otherPublicationId.value,
    () => !!otherPublicationId.value,
  )
  /** The choice within the destination publication, wherever that is. */
  const choice = computed(() => (crossing.value ? otherDestination.value : destination.value))
  /** The other publication's own list, worded like the current one's ("“Poems”’s articles"). */
  const otherListLabel = computed(() =>
    publicationName.replace(/^the publication’s/i, `“${otherPublication.value?.name ?? ''}”’s`),
  )
  const name = computed(() => {
    if (crossing.value && !otherPublication.value) return ''
    const pub = crossing.value ? otherPublication.value!.name : ''
    const within = (text: string) => (crossing.value ? `${text} in “${pub}”` : text)
    if (choice.value === 'publication') {
      return crossing.value ? otherListLabel.value : publicationName
    }
    if (choice.value === NEW_IDEA) return within(`“${newIdeaName.value.trim()}”`)
    const list = crossing.value ? otherIdeas.data.value : ideas.data.value
    const idea = list?.find((i) => i.id === choice.value)
    return idea ? within(`“${idea.name}”`) : ''
  })
  // A new idea is made first; if the move then fails it stays, empty, as any idea.
  const makeIdea = useMutation({
    mutationFn: () =>
      api.createIdea(crossing.value ? otherPublicationId.value : publicationId(), {
        name: newIdeaName.value.trim(),
      }),
  })
  const chosen = computed(
    () =>
      (!crossing.value || (!!otherPublicationId.value && !!otherDestination.value)) &&
      !!choice.value &&
      (choice.value !== NEW_IDEA || !!newIdeaName.value.trim()) &&
      !!destination.value,
  )
  /**
   * The idea to move to (null: the publication's own list), the publication when it is another, and how to word it;
   * the new idea is made first, and a null result means that failed.
   */
  async function resolve(): Promise<{
    to: string | null
    toPublicationId?: string
    name: string
  } | null> {
    const label = name.value
    const toPublicationId = crossing.value ? otherPublicationId.value : undefined
    if (choice.value === NEW_IDEA) {
      const idea = await makeIdea.mutateAsync().catch(() => null)
      return idea ? { to: idea.id, toPublicationId, name: label } : null
    }
    return {
      to: choice.value === 'publication' ? null : choice.value,
      toPublicationId,
      name: label,
    }
  }
  function reset() {
    destination.value = ''
    newIdeaName.value = ''
    otherPublicationId.value = ''
    otherDestination.value = ''
    makeIdea.reset()
  }
  return reactive({
    ideas,
    publications,
    destination,
    newIdeaName,
    otherPublicationId,
    otherDestination,
    otherPublications,
    otherIdeas,
    otherPublication,
    otherListLabel,
    crossing,
    others,
    name,
    makeIdea,
    chosen,
    resolve,
    reset,
  })
}

/** What moving the ideas to the publication would do; asked for once both are chosen, and never spends anything. */
function useIdeaMovePreview(publicationId: () => string, ids: () => string[], to: () => string) {
  return useQuery({
    queryKey: computed(() => queryKeys.ideaMovePreview(publicationId(), ids(), to())),
    queryFn: () => api.previewMoveIdeas(publicationId(), ids(), to()),
    enabled: () => !!to() && ids().length > 0,
    // The answer describes the publications as they are now; ask again each time rather than trusting an old one.
    staleTime: 0,
    gcTime: 0,
  })
}

/** "1 idea, 2 drafts, 5 notes, 3 articles": what a move of ideas takes with it. */
export function ideaMoveContents(p: {
  ideas: number
  drafts: number
  notes: number
  articles: number
}): string {
  return [
    plural(p.ideas, 'idea', 'ideas'),
    plural(p.drafts, 'draft', 'drafts'),
    plural(p.notes, 'note', 'notes'),
    plural(p.articles, 'article', 'articles'),
  ].join(', ')
}

/** Moves whole ideas to another publication; the pages that show ideas, drafts or notes are refreshed after. */
function useMoveIdeas(publicationId: () => string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { ids: string[]; to: string }) => api.moveIdeas(publicationId(), v.ids, v.to),
    onSettled: () =>
      invalidateRoots(
        queryClient,
        'idea',
        'ideas',
        'draft',
        'notes',
        'articles',
        'attention',
        'active-drafts',
      ),
  })
}

/** Names, as a sentence: "Bob", "Bob and Cy", "Bob, Cy and Di". */
export const nameList = (names: string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * Selecting ideas on a publication's Ideas page and moving them to another of the person's publications: the
 * selection, the choice of publication, the confirmation (what the server says would happen) and, once moved,
 * opening the idea where it is now. `move` is offered only when there is another publication to move to.
 */
export function useMoveIdeasFlow(publicationId: () => string, ideas: () => { id: string }[]) {
  const router = useRouter()
  const publications = usePublications()
  const selected = ref<string[]>([])
  /** An idea whose own Move button was pressed: it alone is what the move is about, whatever is selected. */
  const one = ref<string | null>(null)
  /** The ideas to move: the one, else the selected ones that still exist (one moved or deleted meanwhile is not counted). */
  const chosen = computed(() =>
    ideas()
      .filter((i) => (one.value ? i.id === one.value : selected.value.includes(i.id)))
      .map((i) => i.id),
  )
  const toggle = (id: string, on: boolean) =>
    (selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id))
  const selectAll = (on: boolean) => (selected.value = on ? ideas().map((i) => i.id) : [])

  const others = computed(() =>
    (publications.data.value ?? []).filter((p) => p.id !== publicationId()),
  )
  const moving = ref(false)
  const target = ref('')
  const preview = useIdeaMovePreview(
    publicationId,
    () => chosen.value,
    () => (moving.value || one.value ? target.value : ''),
  )
  const mover = useMoveIdeas(publicationId)
  const targetName = computed(() => others.value.find((p) => p.id === target.value)?.name ?? '')
  function toggleMoving() {
    moving.value = !moving.value
    target.value = ''
    mover.reset()
  }
  function startOne(id: string) {
    moving.value = false
    target.value = ''
    mover.reset()
    one.value = id
  }
  function stopOne() {
    one.value = null
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
  const confirmLabel = computed(() =>
    mover.isPending.value ? 'Moving…' : `Move ${plural(chosen.value.length, 'idea', 'ideas')}`,
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
          one.value = null
          selected.value = []
          // Land on the idea where it is now (or on the list, for several).
          void router.push(
            ids.length === 1
              ? { name: 'idea', params: { publicationId: to, id: ids[0]! } }
              : { name: 'publication', params: { publicationId: to } },
          )
        },
      },
    )
  }
  return reactive({
    selected,
    chosen,
    toggle,
    selectAll,
    others,
    moving,
    target,
    targetName,
    preview,
    mover,
    toggleMoving,
    one,
    startOne,
    stopOne,
    canMove,
    confirmLabel,
    move,
  })
}
