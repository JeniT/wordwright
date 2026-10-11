import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  IdeaNoteEditSchema,
  IdeaNoteInputSchema,
  IdeaNoteOrderSchema,
  MAX_IDEA_NOTES,
  NoteAddedSchema,
  NoteMergeInputSchema,
  NoteSplitInputSchema,
  NoteTagsInputSchema,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { NoteEditService } from '../services/note-edits'
import { ownerOf, subjectOf, touch, type ListScope } from '../services/scope'
import { validateJson } from '../validate'

const notFound = () => new HTTPException(404, { message: 'Not found' })

/**
 * Notes, in the order the person arranged them: the routes for an idea's notes and for a profile's own are one
 * set, mounted twice. `resolve` says whose they are (and answers 404 if that doesn't exist). A profile has no
 * drafts, so it has no "added to a draft" state (`drafts: false` leaves that route out).
 */
export function noteRoutes(
  store: Store,
  noteEdits: NoteEditService,
  resolve: (c: Context<AppEnv>) => ListScope,
  options: { drafts: boolean },
) {
  const { notes, reading } = store
  const router = new Hono<AppEnv>()
    .get('/', (c) => c.json(notes.list(ownerOf(resolve(c)))))
    .post('/', validateJson(IdeaNoteInputSchema), (c) => {
      const scope = resolve(c)
      const owner = ownerOf(scope)
      const saved = store.transaction(() => {
        if (notes.count(owner) >= MAX_IDEA_NOTES) {
          throw new HTTPException(409, {
            message: `${subjectOf(scope)} can have up to ${MAX_IDEA_NOTES} notes. Merge or delete some to make room.`,
          })
        }
        const { text, readingItemId, quote } = c.req.valid('json')
        if (quote && !readingItemId) {
          throw new HTTPException(400, {
            message: 'A quotation needs the reading-list item it comes from.',
          })
        }
        if (readingItemId && !reading.get(owner, readingItemId)) {
          throw new HTTPException(400, {
            message: scope.ideaId
              ? "That item isn't on this idea's reading list."
              : "That item isn't on this profile's reading list.",
          })
        }
        // A note taken from an item of the reading list is a note from reading.
        const note = notes.append(
          scope.profileId,
          scope.ideaId,
          c.get('user').id,
          text,
          readingItemId ? 'reading' : 'entered',
          readingItemId ?? null,
          !!quote,
        )
        // Taking a note from an item means it has been read (the first read date is kept if it already was).
        if (readingItemId) reading.setRead(owner, readingItemId, true)
        touch(store, scope)
        return note
      })
      return c.json(saved, 201)
    })
    // Registered before `/:noteId` so that "order" is not taken for an id.
    .put('/order', validateJson(IdeaNoteOrderSchema), (c) => {
      const scope = resolve(c)
      const owner = ownerOf(scope)
      const ok = store.transaction(() => notes.reorder(owner, c.req.valid('json').ids))
      if (!ok) {
        throw new HTTPException(409, {
          message: 'The notes have changed since you opened them. Reload the page and try again.',
        })
      }
      touch(store, scope)
      return c.json(notes.list(owner))
    })
    .patch('/:noteId', validateJson(IdeaNoteEditSchema), (c) => {
      const scope = resolve(c)
      const owner = ownerOf(scope)
      const current = notes.get(owner, c.req.param('noteId')!)
      if (!current) throw notFound()
      if (current.quote) {
        throw new HTTPException(409, {
          message:
            "A quotation can't be edited, so it stays exactly as it was on the page. Delete it and add it again if it needs correcting.",
        })
      }
      const saved = notes.updateText(owner, current.id, c.req.valid('json').text)
      if (!saved) throw notFound()
      touch(store, scope)
      return c.json(saved)
    })
    // Join notes into one (the first of them), or cut one in two. Both answer with all the notes.
    .post('/merge', validateJson(NoteMergeInputSchema), (c) =>
      c.json(noteEdits.merge(resolve(c), c.get('user').id, c.req.valid('json').ids)),
    )
    .post('/:noteId/split', validateJson(NoteSplitInputSchema), (c) => {
      const { before, after } = c.req.valid('json')
      return c.json(noteEdits.split(resolve(c), c.req.param('noteId')!, before, after), 201)
    })
    // The note's tags, replaced as a whole (the same way notes are put in order).
    .put('/:noteId/tags', validateJson(NoteTagsInputSchema), (c) => {
      const scope = resolve(c)
      const saved = store.transaction(() =>
        notes.setTags(ownerOf(scope), c.req.param('noteId')!, c.req.valid('json').tags),
      )
      if (!saved) throw notFound()
      touch(store, scope)
      return c.json(saved)
    })
    .delete('/:noteId', (c) => {
      const scope = resolve(c)
      if (!store.transaction(() => notes.remove(ownerOf(scope), c.req.param('noteId')!))) {
        throw notFound()
      }
      touch(store, scope)
      return c.body(null, 204)
    })

  if (options.drafts) {
    // Put a note back among those that can be pulled into a draft (it stays in any draft it was put in).
    router.put('/:noteId/added', validateJson(NoteAddedSchema), (c) => {
      const scope = resolve(c)
      const saved = notes.setAdded(
        ownerOf(scope),
        c.req.param('noteId')!,
        c.req.valid('json').added,
      )
      if (!saved) throw notFound()
      touch(store, scope)
      return c.json(saved)
    })
  }
  return router
}
