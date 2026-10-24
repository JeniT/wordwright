import { Hono } from 'hono'
import {
  BulkTagInputSchema,
  ArticleInputSchema,
  MoveIdeasInputSchema,
  MoveNotesInputSchema,
  MoveArticlesInputSchema,
  NoteTagsInputSchema,
  ArticleKeptSchema,
  ArticleReadSchema,
} from '@wordwright/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { ArticleService } from '../services/articles'
import type { IdeaMoveService } from '../services/idea-moves'
import type { MoveService } from '../services/moves'
import { validateJson } from '../validate'
import { notFound } from '../errors'
import { param } from './params'

/**
 * The publication's own articles: items gathered before there is an idea (see `Owner`). Mirrors an idea's
 * `/articles` routes, but answers with the list. Mounted under `/publications/:publicationId`, after membership is checked.
 */
export function publicationArticleRoutes(store: Store, articleService: ArticleService) {
  const { articles } = store
  const scope = (publicationId: string) => ({ publicationId, ideaId: null })
  const owner = (publicationId: string) => ({ publicationId })

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(articles.list(owner(param(c, 'publicationId')))))
      .post('/', validateJson(ArticleInputSchema), async (c) =>
        c.json(
          await articleService.add(
            scope(param(c, 'publicationId')),
            c.get('user').id,
            c.req.valid('json'),
            c.req.raw.signal,
          ),
          201,
        ),
      )
      .patch('/:articleId', validateJson(ArticleInputSchema), async (c) =>
        c.json(
          await articleService.update(
            scope(param(c, 'publicationId')),
            param(c, 'articleId'),
            c.get('user').id,
            c.req.valid('json'),
            c.req.raw.signal,
          ),
        ),
      )
      .put('/:articleId/read', validateJson(ArticleReadSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        if (
          !articles.setRead(owner(publicationId), param(c, 'articleId'), c.req.valid('json').read)
        ) {
          throw notFound()
        }
        return c.json(articles.list(owner(publicationId)))
      })
      // Asks for an item to be kept: the others drop off the list a month after they were put on it.
      .put('/:articleId/kept', validateJson(ArticleKeptSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        if (!articles.setKept(publicationId, param(c, 'articleId'), c.req.valid('json').kept)) {
          throw notFound()
        }
        return c.json(articles.list(owner(publicationId)))
      })
      // Tags added to or taken from several items at once (all or nothing). Answers with the whole list.
      .post('/tags', validateJson(BulkTagInputSchema), (c) => {
        const { ids, add, remove } = c.req.valid('json')
        return c.json(articleService.tagMany(scope(param(c, 'publicationId')), ids, add, remove))
      })
      // The item's tags, replaced as a whole (like a note's).
      .put('/:articleId/tags', validateJson(NoteTagsInputSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        const tags = c.req.valid('json').tags
        const saved = store.transaction(() =>
          articles.setTags(owner(publicationId), param(c, 'articleId'), tags),
        )
        if (!saved) throw notFound()
        return c.json(articles.list(owner(publicationId)))
      })
      .delete('/:articleId', (c) => {
        if (!articles.remove(owner(param(c, 'publicationId')), param(c, 'articleId'))) {
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
      .post('/articles', validateJson(MoveArticlesInputSchema), (c) => {
        const { ids, to } = c.req.valid('json')
        return c.json(moves.moveArticles(param(c, 'publicationId'), c.get('user').id, ids, to))
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
