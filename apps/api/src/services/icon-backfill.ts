import type { Store } from '../db/store'
import { describeError } from '../errors'
import { isSquareIcon } from './icon-shape'

/**
 * Looks at the icons stored before their shape was recorded (#226) and records it. Run once at startup, in the
 * background: until it has, an icon is simply shown on the plate. A later run finds nothing left to do.
 */
export async function backfillIconShapes(
  store: Store,
  logger: Pick<Console, 'error'> = console,
): Promise<number> {
  let done = 0
  try {
    for (const icon of store.publications.unshapedSiteIcons()) {
      store.publications.setSiteIconSquare(
        icon.publicationId,
        await isSquareIcon(icon.data, icon.contentType),
      )
      done++
    }
    for (const icon of store.sources.unshapedIcons()) {
      store.sources.setIconSquare(icon.sourceId, await isSquareIcon(icon.data, icon.contentType))
      done++
    }
  } catch (error) {
    logger.error(`Could not check the shape of stored icons: ${describeError(error)}`)
  }
  return done
}
