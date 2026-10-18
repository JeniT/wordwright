<script setup lang="ts">
import { errorMessage } from '../lib/api'
import { ideaMoveContents, nameList, type useMoveIdeasFlow } from '../lib/move'

/**
 * Choosing another publication to move ideas to, and what the server says would happen. It is the form in the
 * Ideas toolbar for several selected ideas, and the body of the dialog for one idea's Move button.
 */
const props = defineProps<{ flow: ReturnType<typeof useMoveIdeasFlow> }>()
// The flow is reactive state the page owns; this only edits its choice, as the form fields do.
const picked = props.flow
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <label for="move-ideas-to" class="text-sm font-medium">Move to</label>
    <select
      id="move-ideas-to"
      v-model="picked.target"
      class="field field-compact max-w-full !w-auto"
    >
      <option value="" disabled>Choose a publication…</option>
      <option v-for="p in flow.others" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </div>
  <div v-if="flow.target" class="mt-2 text-sm" aria-live="polite" data-move-says>
    <p v-if="flow.preview.isPending">Checking what will move…</p>
    <p v-else-if="flow.preview.isError" role="alert" class="text-danger">
      {{ errorMessage(flow.preview.error) }}
    </p>
    <template v-else-if="flow.preview.data">
      <p v-if="flow.preview.data.problem" role="alert" class="text-danger">
        {{ flow.preview.data.problem }}
      </p>
      <template v-else>
        <p>{{ ideaMoveContents(flow.preview.data) }} will move to “{{ flow.targetName }}”.</p>
        <p v-if="flow.preview.data.losingAccess.length" class="mt-1 text-ink-soft">
          {{ nameList(flow.preview.data.losingAccess) }}
          {{ flow.preview.data.losingAccess.length === 1 ? 'isn’t a member' : 'aren’t members' }}
          of “{{ flow.targetName }}”, so will no longer be able to see
          {{ flow.chosen.length === 1 ? 'it' : 'them' }}. Their comments stay.
        </p>
      </template>
    </template>
  </div>
  <p v-if="flow.mover.isError" role="alert" class="mt-2 text-sm text-danger">
    {{ errorMessage(flow.mover.error) }}
  </p>
</template>
