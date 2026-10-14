import { Hono } from 'hono'
import { CritiquePointDismissSchema, DraftInsertionInputSchema, DraftSaveSchema } from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { critiqueState } from '../services/critique'
import { requireEditor } from '../services/draft-editor'
import { validateJson } from '../validate'
import { fail } from '../errors'
import { param } from './params'

/**
 * Mounted under `/profiles/:profileId`, after membership has been checked. Drafts are created and
 * listed through their idea (`/ideas/:id/drafts`); these routes open, save and delete one by id.
 */
export function draftRoutes(store: Store) {
  const { drafts, notes, ideas, critiques } = store
  return (
    new Hono<AppEnv>()
      .get('/:id', (c) => {
        const draft = drafts.get(param(c, 'profileId'), param(c, 'id'))
        return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
      })
      // Only the editor saves, and only from the version they last saw: a stale save is refused (409), never merged.
      .put('/:id', validateJson(DraftSaveSchema), (c) => {
        const profileId = param(c, 'profileId')
        const current = drafts.get(profileId, param(c, 'id'))
        if (!current) return c.json({ error: 'Not found' }, 404)
        requireEditor(current, c.get('user').id)
        const { version, ...input } = c.req.valid('json')
        const saved = drafts.update(profileId, current.id, input, version)
        if (!saved) {
          throw fail(
            409,
            'This draft has been saved somewhere else since you opened it. Reload the page to see the latest version.',
          )
        }
        return c.json(saved)
      })
      // The latest critique of the draft with how many looks are used, and the writer setting one of its points aside.
      .get('/:id/critique', (c) => {
        const draft = drafts.get(param(c, 'profileId'), param(c, 'id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        const state = critiqueState(store, draft.id, c.get('user').id)
        // The AI's comments are the editor's to weigh; everyone else reviews independently (see CONTEXT.md).
        return c.json(draft.editorId === c.get('user').id ? state : { ...state, round: null })
      })
      .put('/:id/critique/points/:pointId', validateJson(CritiquePointDismissSchema), (c) => {
        const draft = drafts.get(param(c, 'profileId'), param(c, 'id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        requireEditor(draft, c.get('user').id)
        const done = critiques.setDismissed(
          draft.id,
          param(c, 'pointId'),
          c.req.valid('json').dismissed,
        )
        return done
          ? c.json(critiqueState(store, draft.id, c.get('user').id))
          : c.json({ error: 'Not found' }, 404)
      })
      // Words pulled into the draft from the idea's notes, and where they came from.
      .get('/:id/insertions', (c) => {
        const draft = drafts.get(param(c, 'profileId'), param(c, 'id'))
        return draft ? c.json(drafts.insertions(draft.id)) : c.json({ error: 'Not found' }, 404)
      })
      .post('/:id/insertions', validateJson(DraftInsertionInputSchema), (c) => {
        const draft = drafts.get(param(c, 'profileId'), param(c, 'id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        requireEditor(draft, c.get('user').id)
        const { noteId, text } = c.req.valid('json')
        // The origin and source come from the note, never from the request, so they can't be claimed falsely.
        const note = draft.ideaId ? notes.get(draft.ideaId, noteId) : undefined
        if (!note) {
          throw fail(400, "That note isn't on this draft's idea.")
        }
        // A quotation goes into a draft only as a blockquote, so it can't pass for the writer's own words.
        if (note.quote && text.split('\n').some((line) => line.trim() && !line.startsWith('>'))) {
          throw fail(
            400,
            'A quotation has to go into the draft as a quotation (every line starting with >).',
          )
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
            source: item
              ? { title: item.title || item.url, url: item.url, authors: item.authors }
              : null,
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
        drafts.delete(param(c, 'profileId'), param(c, 'id'))
          ? c.body(null, 204)
          : c.json({ error: 'Not found' }, 404),
      )
  )
}
