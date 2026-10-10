import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Pages are loaded as they are first visited (lazy imports), and the larger ones take longer than the library's
// default one second to appear on a busy machine or a slow CI runner, which made waits for a page flaky. Long
// enough to ride that out, short enough to finish inside a test's own five seconds.
configure({ asyncUtilTimeout: 4000 })

// jsdom does no layout, so the editor (ProseMirror) finds nothing when it asks where things are on the page, for
// instance when something is dragged over it. Say there is nothing there, rather than that the question is unknown.
document.elementFromPoint ??= () => null
const noRects = () => [] as unknown as DOMRectList
Element.prototype.getClientRects ??= noRects
Range.prototype.getClientRects ??= noRects
Range.prototype.getBoundingClientRect ??= () => new DOMRect()

afterEach(cleanup)
