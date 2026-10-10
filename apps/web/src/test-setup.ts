import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Pages are loaded as they are first visited (lazy imports), and the larger ones take longer than the library's
// default one second to appear on a busy machine or a slow CI runner, which made waits for a page flaky. Long
// enough to ride that out, short enough to finish inside a test's own five seconds.
configure({ asyncUtilTimeout: 4000 })

afterEach(cleanup)
