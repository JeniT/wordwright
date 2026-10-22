<script setup lang="ts">
/**
 * The few icons the app uses, drawn inline so there is no dependency. They are decoration: the button that holds one
 * always has a name of its own (an aria-label), and an icon-only button says what it does in a tooltip too.
 */
defineProps<{
  name:
    | 'edit'
    | 'remove'
    | 'up'
    | 'down'
    | 'label'
    | 'check'
    | 'close'
    | 'undo'
    | 'filter'
    | 'info'
    | 'alert'
    | 'ai'
    | 'working'
    | 'settings'
    | 'sign-out'
    | 'external'
    | 'paragraph'
    | 'heading-2'
    | 'heading-3'
    | 'bold'
    | 'italic'
    | 'code'
    | 'quote'
    | 'list-bullet'
    | 'list-ordered'
    | 'code-block'
    | 'link'
    | 'unlink'
    | 'markdown'
    | 'more'
    | 'move'
    | 'insert'
    | 'comment'
  size?: number
}>()
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'edit'">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </template>
    <template v-else-if="name === 'remove'">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </template>
    <path v-else-if="name === 'up'" d="m18 15-6-6-6 6" />
    <path v-else-if="name === 'down'" d="m6 9 6 6 6-6" />
    <template v-else-if="name === 'label'">
      <path
        d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
      />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </template>
    <path v-else-if="name === 'check'" d="M20 6 9 17l-5-5" />
    <template v-else-if="name === 'close'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </template>
    <template v-else-if="name === 'alert'">
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      />
      <path d="M12 9v4M12 17h.01" />
    </template>
    <template v-else-if="name === 'ai'">
      <path
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
      />
      <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
    </template>
    <template v-else-if="name === 'undo'">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </template>
    <template v-else-if="name === 'sign-out'">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </template>
    <template v-else-if="name === 'external'">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </template>
    <path v-else-if="name === 'working'" d="M21 12a9 9 0 1 1-6.219-8.56" />
    <template v-else-if="name === 'settings'">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </template>
    <path v-else-if="name === 'paragraph'" d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
    <path
      v-else-if="name === 'heading-2'"
      d="M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"
    />
    <path
      v-else-if="name === 'heading-3'"
      d="M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"
    />
    <path
      v-else-if="name === 'bold'"
      d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"
    />
    <path v-else-if="name === 'italic'" d="M19 4h-9M14 20H5M15 4 9 20" />
    <path v-else-if="name === 'code'" d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    <template v-else-if="name === 'quote'">
      <path
        d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      />
      <path
        d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      />
    </template>
    <path
      v-else-if="name === 'list-bullet'"
      d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"
    />
    <path
      v-else-if="name === 'list-ordered'"
      d="M10 12h11M10 18h11M10 6h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
    />
    <template v-else-if="name === 'code-block'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m10 10-2 2 2 2M14 14l2-2-2-2" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </template>
    <template v-else-if="name === 'unlink'">
      <path
        d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"
      />
      <path
        d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"
      />
      <path d="M8 2v3M2 8h3M16 19v3M19 16h3" />
    </template>
    <template v-else-if="name === 'markdown'">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 15V9l2.5 3L11 9v6M17 9v6m-2.5-2.5L17 15l2.5-2.5" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </template>
    <template v-else-if="name === 'move'">
      <path d="M3 12h12" />
      <path d="m10 7 5 5-5 5" />
      <path d="M21 4v16" />
    </template>
    <path
      v-else-if="name === 'comment'"
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    />
    <template v-else-if="name === 'insert'">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </template>
    <polygon v-else-if="name === 'filter'" points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    <template v-else>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </template>
  </svg>
</template>
