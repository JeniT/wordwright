import { computed, ref, watch } from 'vue'

/** How many items a paginated list shows at a time. One number, so every list pages alike. */
export const PAGE_SIZE = 5

/**
 * Client-side paging for a list that is already filtered. Filter first, then page: `total` and the range are of the
 * filtered list. Changing the filter should start again at the first page (`first()`); a list that shrinks (the last
 * item on a page was removed) steps back to the last page that still exists.
 */
export function usePaging<T>(items: () => readonly T[], noun: string) {
  const page = ref(1)
  const total = computed(() => items().length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })
  const pageItems = computed(() =>
    items().slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
  )
  /** What `PageNav` needs. */
  const nav = computed(() => ({
    page: page.value,
    pageCount: pageCount.value,
    first: (page.value - 1) * PAGE_SIZE + 1,
    last: Math.min(page.value * PAGE_SIZE, total.value),
    total: total.value,
    noun,
    size: PAGE_SIZE,
  }))
  return {
    page,
    pageCount,
    pageItems,
    nav,
    go: (step: -1 | 1) => (page.value += step),
    first: () => (page.value = 1),
  }
}
