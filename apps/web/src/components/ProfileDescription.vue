<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Profile } from '@lfwa/core'
import Markdown from './Markdown.vue'

/**
 * The profile's description at the top of its landing page. Long ones show their first lines, with a button to
 * read the rest; the button is only there when something is hidden, which is measured, not guessed from the length.
 */
const props = defineProps<{ profile: Profile }>()
const description = computed(() => props.profile.description)
const bodyId = useId()
const body = ref<HTMLElement>()
const expanded = ref(false)
const overflows = ref(false)

function measure() {
  // Only while clamped: expanded, everything fits, and the button must stay to collapse it again.
  if (!body.value || expanded.value) return
  overflows.value = body.value.scrollHeight > body.value.clientHeight + 1
}
let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && body.value) {
    observer = new ResizeObserver(measure) // a narrower window wraps lines, so more can be hidden
    observer.observe(body.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.profile.description,
  async () => {
    expanded.value = false
    await nextTick()
    measure()
  },
)
</script>

<template>
  <section aria-label="About this profile" class="mt-4">
    <template v-if="description">
      <div :id="bodyId" ref="body" class="description" :class="{ clamped: !expanded }">
        <Markdown :text="description" />
      </div>
      <button
        v-if="overflows || expanded"
        type="button"
        class="link mt-1 text-sm"
        :aria-expanded="expanded"
        :aria-controls="bodyId"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Show less' : 'Show more…' }}
      </button>
    </template>
    <p v-else class="text-sm text-ink-soft">
      Say what this venue is for, who reads it and what kinds of writing go here.
      <RouterLink :to="{ name: 'describe-venue', params: { profileId: profile.id } }" class="link">
        Add a description
      </RouterLink>
    </p>
  </section>
</template>

<style scoped>
/* About eight lines; `lh` follows the text size, so it holds at any width and font setting. The line height is
   the Markdown's own (style.css), so the count is of the lines people see. */
.description {
  line-height: 1.65;
}
.clamped {
  max-height: 8lh;
  overflow: hidden;
}
</style>
