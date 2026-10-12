import { Hono } from 'hono'
import {
  IdeaLinkInputSchema,
  MoveNotesInputSchema,
  MoveReadingInputSchema,
  ReadingItemKeptSchema,
  ReadingItemReadSchema,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { IdeaLinkService } from '../services/idea-links'
import type { MoveService } from '../services/moves'
import { validateJson } from '../validate'
import { notFound } from '../errors'
import { param } from './params'

/**
 * The profile's own reading list: items gathered before there is an idea (see `Owner`). Mirrors an idea's
 * `/links` routes, but answers with the list. Mounted under `/profiles/:profileId`, after membership is checked.
 */
export function profileReadingRoutes(store: Store, links: IdeaLinkService) {
  const { reading } = store
  const scope = (profileId: string) => ({ profileId, ideaId: null })
  const owner = (profileId: string) => ({ profileId })

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(reading.list(owner(param(c, 'profileId')))))
      .post('/', validateJson(IdeaLinkInputSchema), async (c) =>
        c.json(
          await links.add(
            scope(param(c, 'profileId')),
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
            scope(param(c, 'profileId')),
            param(c, 'linkId'),
            c.get('user').id,
            c.req.valid('json'),
            c.req.raw.signal,
          ),
        ),
      )
      .put('/:linkId/read', validateJson(ReadingItemReadSchema), (c) => {
        const profileId = param(c, 'profileId')
        if (!reading.setRead(owner(profileId), param(c, 'linkId'), c.req.valid('json').read)) {
          throw notFound()
        }
        return c.json(reading.list(owner(profileId)))
      })
      // Asks for an item to be kept: the others drop off the list a month after they were put on it.
      .put('/:linkId/kept', validateJson(ReadingItemKeptSchema), (c) => {
        const profileId = param(c, 'profileId')
        if (!reading.setKept(profileId, param(c, 'linkId'), c.req.valid('json').kept)) {
          throw notFound()
        }
        return c.json(reading.list(owner(profileId)))
      })
      .delete('/:linkId', (c) => {
        if (!reading.remove(owner(param(c, 'profileId')), param(c, 'linkId'))) {
          throw notFound()
        }
        return c.body(null, 204)
      })
  )
}

/** Moving reading items and notes between the profile's own lists and its ideas. */
export function moveRoutes(moves: MoveService) {
  return new Hono<AppEnv>()
    .post('/reading', validateJson(MoveReadingInputSchema), (c) => {
      const { ids, to } = c.req.valid('json')
      return c.json(moves.moveReading(param(c, 'profileId'), c.get('user').id, ids, to.ideaId))
    })
    .post('/notes', validateJson(MoveNotesInputSchema), (c) => {
      const { ids, to } = c.req.valid('json')
      return c.json(moves.moveNotes(param(c, 'profileId'), c.get('user').id, ids, to.ideaId))
    })
}
