import { Hono } from 'hono'
import {
  BulkTagInputSchema,
  IdeaLinkInputSchema,
  MoveIdeasInputSchema,
  MoveNotesInputSchema,
  MoveReadingInputSchema,
  NoteTagsInputSchema,
  ReadingItemKeptSchema,
  ReadingItemReadSchema,
} from '@wordwright/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { IdeaLinkService } from '../services/idea-links'
import type { IdeaMoveService } from '../services/idea-moves'
import type { MoveService } from '../services/moves'
import { validateJson } from '../validate'
import { notFound } from '../errors'
import { param } from './params'

/**
 * The publication's own articles: items gathered before there is an idea (see `Owner`). Mirrors an idea's
 * `/links` routes, but answers with the list. Mounted under `/publications/:publicationId`, after membership is checked.
 */
export function publicationReadingRoutes(store: Store, links: IdeaLinkService) {
  const { reading } = store
  const scope = (publicationId: string) => ({ publicationId, ideaId: null })
  const owner = (publicationId: string) => ({ publicationId })

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(reading.list(owner(param(c, 'publicationId')))))
      .post('/', validateJson(IdeaLinkInputSchema), async (c) =>
        c.json(
          await links.add(
            scope(param(c, 'publicationId')),
            c.get('user').id,
            c.req.valid('json'),
            c.req.raw.signal,
          ),
          201,
        ),
      )
      .patch('/:linkId', validateJson(IdeaLinkInputSchema), async (c) =>
        c.json(
          await links.update(
            scope(param(c, 'publicationId')),
            param(c, 'linkId'),
            c.get('user').id,
            c.req.valid('json'),
            c.req.raw.signal,
          ),
        ),
      )
      .put('/:linkId/read', validateJson(ReadingItemReadSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        if (!reading.setRead(owner(publicationId), param(c, 'linkId'), c.req.valid('json').read)) {
          throw notFound()
        }
        return c.json(reading.list(owner(publicationId)))
      })
      // Asks for an item to be kept: the others drop off the list a month after they were put on it.
      .put('/:linkId/kept', validateJson(ReadingItemKeptSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        if (!reading.setKept(publicationId, param(c, 'linkId'), c.req.valid('json').kept)) {
          throw notFound()
        }
        return c.json(reading.list(owner(publicationId)))
      })
      // Tags added to or taken from several items at once (all or nothing). Answers with the whole list.
      .post('/tags', validateJson(BulkTagInputSchema), (c) => {
        const { ids, add, remove } = c.req.valid('json')
        return c.json(links.tagMany(scope(param(c, 'publicationId')), ids, add, remove))
      })
      // The item's tags, replaced as a whole (like a note's).
      .put('/:linkId/tags', validateJson(NoteTagsInputSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        const tags = c.req.valid('json').tags
        const saved = store.transaction(() =>
          reading.setTags(owner(publicationId), param(c, 'linkId'), tags),
        )
        if (!saved) throw notFound()
        return c.json(reading.list(owner(publicationId)))
      })
      .delete('/:linkId', (c) => {
        if (!reading.remove(owner(param(c, 'publicationId')), param(c, 'linkId'))) {
          throw notFound()
        }
        return c.body(null, 204)
      })
  )
}

/** Moving articles and notes between the publication's own lists and its ideas, and ideas to another publication. */
export function moveRoutes(moves: MoveService, ideaMoves: IdeaMoveService) {
  return (
    new Hono<AppEnv>()
      .post('/reading', validateJson(MoveReadingInputSchema), (c) => {
        const { ids, to } = c.req.valid('json')
        return c.json(moves.moveReading(param(c, 'publicationId'), c.get('user').id, ids, to))
      })
      .post('/notes', validateJson(MoveNotesInputSchema), (c) => {
        const { ids, to } = c.req.valid('json')
        return c.json(moves.moveNotes(param(c, 'publicationId'), c.get('user').id, ids, to))
      })
      // What moving the ideas would do, to confirm first.
      .post('/ideas/preview', validateJson(MoveIdeasInputSchema), (c) => {
        const { ids, to } = c.req.valid('json')
        return c.json(
          ideaMoves.preview(param(c, 'publicationId'), c.get('user').id, ids, to.publicationId),
        )
      })
      .post('/ideas', validateJson(MoveIdeasInputSchema), (c) => {
        const { ids, to } = c.req.valid('json')
        return c.json(
          ideaMoves.move(param(c, 'publicationId'), c.get('user').id, ids, to.publicationId),
        )
      })
  )
}
