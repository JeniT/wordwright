<script lang="ts">
import {
  faArrowUpRightFromSquare,
  faBold,
  faCheck,
  faChevronDown,
  faChevronUp,
  faCircleInfo,
  faCircleNotch,
  faCode,
  faComment,
  faDownload,
  faEllipsis,
  faFileCode,
  faFilter,
  faGear,
  faHeading,
  faItalic,
  faLink,
  faLinkSlash,
  faListOl,
  faListUl,
  faParagraph,
  faPen,
  faQuoteLeft,
  faRightFromBracket,
  faRotateLeft,
  faTag,
  faTrashCan,
  faTriangleExclamation,
  faUpDownLeftRight,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { faMarkdown } from '@fortawesome/free-brands-svg-icons'

// Font Awesome Free (CC BY 4.0). Only the icons listed here are bundled. Each definition is
// [width, height, aliases, unicode, svgPathData]; we draw the path ourselves, so there is no component library.
const ICONS = {
  edit: faPen,
  remove: faTrashCan,
  up: faChevronUp,
  down: faChevronDown,
  label: faTag,
  check: faCheck,
  close: faXmark,
  undo: faRotateLeft,
  filter: faFilter,
  info: faCircleInfo,
  alert: faTriangleExclamation,
  ai: faWandMagicSparkles,
  working: faCircleNotch,
  settings: faGear,
  'sign-out': faRightFromBracket,
  external: faArrowUpRightFromSquare,
  paragraph: faParagraph,
  // The free set has one heading glyph; the level is a small number beside it.
  'heading-2': faHeading,
  'heading-3': faHeading,
  bold: faBold,
  italic: faItalic,
  code: faCode,
  quote: faQuoteLeft,
  'list-bullet': faListUl,
  'list-ordered': faListOl,
  'code-block': faFileCode,
  link: faLink,
  unlink: faLinkSlash,
  markdown: faMarkdown,
  more: faEllipsis,
  move: faUpDownLeftRight,
  insert: faDownload,
  comment: faComment,
}

export type IconName = keyof typeof ICONS
</script>

<script setup lang="ts">
/**
 * The icons the app uses: Font Awesome Free, drawn inline from the icon data so there is no component library. They
 * are decoration: the button that holds one always has a name of its own (an aria-label), and an icon-only button says
 * what it does in a tooltip too.
 */
import { computed } from 'vue'

const props = defineProps<{ name: IconName; size?: number }>()

const icon = computed(() => ICONS[props.name].icon)
const level = computed(() =>
  props.name === 'heading-2' ? '2' : props.name === 'heading-3' ? '3' : '',
)
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    :width="size ?? 18"
    :height="size ?? 18"
    :viewBox="`0 0 ${icon[0]} ${icon[1]}`"
    fill="currentColor"
  >
    <path :d="icon[4] as string" :transform="level ? 'translate(-40 0) scale(0.9)' : undefined" />
    <text
      v-if="level"
      :x="icon[0] - 30"
      :y="icon[1] - 40"
      text-anchor="end"
      font-size="300"
      font-weight="700"
      font-family="inherit"
    >
      {{ level }}
    </text>
  </svg>
</template>
