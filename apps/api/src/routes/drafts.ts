import { Hono } from 'hono'
import { DraftInputSchema, DraftInsertionInputSchema } from '@lfwa/core'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { validateJson } from '../validate'

/**
 * Mounted under `/profiles/:profileId`, after membership has been checked. Drafts are created and
 * listed through their idea (`/ideas/:id/drafts`); these routes open, save and delete one by id.
 */
export function draftRoutes(store: Store) {
  const { drafts, notes, ideas } = store
  return (
    new Hono<AppEnv>()
      .get('/:id', (c) => {
        const draft = drafts.get(c.req.param('profileId')!, c.req.param('id'))
        return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
      })
      .put('/:id', validateJson(DraftInputSchema), (c) => {
        const draft = drafts.update(
          c.req.param('profileId')!,
          c.req.param('id'),
          c.req.valid('json'),
        )
        return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
      })
      // Words pulled into the draft from the idea's notes, and where they came from.
      .get('/:id/insertions', (c) => {
        const draft = drafts.get(c.req.param('profileId')!, c.req.param('id'))
        return draft ? c.json(drafts.insertions(draft.id)) : c.json({ error: 'Not found' }, 404)
      })
      .post('/:id/insertions', validateJson(DraftInsertionInputSchema), (c) => {
        const draft = drafts.get(c.req.param('profileId')!, c.req.param('id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        const { noteId, text } = c.req.valid('json')
        // The origin and source come from the note, never from the request, so they can't be claimed falsely.
        const note = draft.ideaId ? notes.get(draft.ideaId, noteId) : undefined
        if (!note) {
          throw new HTTPException(400, { message: "That note isn't on this draft's idea." })
        }
        // A quotation goes into a draft only as a blockquote, so it can't pass for the writer's own words.
        if (note.quote && text.split('\n').some((line) => line.trim() && !line.startsWith('>'))) {
          throw new HTTPException(400, {
            message:
              'A quotation has to go into the draft as a quotation (every line starting with >).',
          })
        }
        const idea = ideas.get(draft.profileId, draft.ideaId!)
        const item = idea?.links.find((l) => l.id === note.readingItemId)
        const inserted = store.transaction(() => {
          const id = drafts.addInsertion(draft.id, {
            noteId: note.id,
            noteAuthorId: note.authorId,
            insertedBy: c.get('user').id,
            text,
            origin: note.origin,
            source: item ? { title: item.title || item.url, url: item.url } : null,
          })
          notes.setAdded(draft.ideaId!, note.id, true)
          ideas.touch(draft.ideaId!)
          return id
        })
        return c.json(
          drafts.insertions(draft.id).find((i) => i.id === inserted),
          201,
        )
      })
      .delete('/:id', (c) =>
        drafts.delete(c.req.param('profileId')!, c.req.param('id'))
          ? c.body(null, 204)
          : c.json({ error: 'Not found' }, 404),
      )
  )
}
