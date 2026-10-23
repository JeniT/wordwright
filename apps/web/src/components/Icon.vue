<script lang="ts">
import pencilSimple from '@phosphor-icons/core/assets/regular/pencil-simple.svg?raw'
import trash from '@phosphor-icons/core/assets/regular/trash.svg?raw'
import caretUp from '@phosphor-icons/core/assets/regular/caret-up.svg?raw'
import caretDown from '@phosphor-icons/core/assets/regular/caret-down.svg?raw'
import tag from '@phosphor-icons/core/assets/regular/tag.svg?raw'
import check from '@phosphor-icons/core/assets/regular/check.svg?raw'
import x from '@phosphor-icons/core/assets/regular/x.svg?raw'
import arrowCounterClockwise from '@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg?raw'
import funnel from '@phosphor-icons/core/assets/regular/funnel.svg?raw'
import info from '@phosphor-icons/core/assets/regular/info.svg?raw'
import warning from '@phosphor-icons/core/assets/regular/warning.svg?raw'
import circleNotch from '@phosphor-icons/core/assets/regular/circle-notch.svg?raw'
import gear from '@phosphor-icons/core/assets/regular/gear.svg?raw'
import signOut from '@phosphor-icons/core/assets/regular/sign-out.svg?raw'
import arrowSquareOut from '@phosphor-icons/core/assets/regular/arrow-square-out.svg?raw'
import paragraph from '@phosphor-icons/core/assets/regular/paragraph.svg?raw'
import textHTwo from '@phosphor-icons/core/assets/regular/text-h-two.svg?raw'
import textHThree from '@phosphor-icons/core/assets/regular/text-h-three.svg?raw'
import textB from '@phosphor-icons/core/assets/regular/text-b.svg?raw'
import textItalic from '@phosphor-icons/core/assets/regular/text-italic.svg?raw'
import code from '@phosphor-icons/core/assets/regular/code.svg?raw'
import quotes from '@phosphor-icons/core/assets/regular/quotes.svg?raw'
import listBullets from '@phosphor-icons/core/assets/regular/list-bullets.svg?raw'
import listNumbers from '@phosphor-icons/core/assets/regular/list-numbers.svg?raw'
import codeBlock from '@phosphor-icons/core/assets/regular/code-block.svg?raw'
import link from '@phosphor-icons/core/assets/regular/link.svg?raw'
import linkBreak from '@phosphor-icons/core/assets/regular/link-break.svg?raw'
import markdownLogo from '@phosphor-icons/core/assets/regular/markdown-logo.svg?raw'
import dotsThree from '@phosphor-icons/core/assets/regular/dots-three.svg?raw'
import arrowLineRight from '@phosphor-icons/core/assets/regular/arrow-line-right.svg?raw'
import arrowLineDown from '@phosphor-icons/core/assets/regular/arrow-line-down.svg?raw'
import chatCircle from '@phosphor-icons/core/assets/regular/chat-circle.svg?raw'

// Phosphor Icons (MIT), regular weight, as raw SVG text. Only the files imported here are bundled. We keep the inside of
// each file and draw it in our own <svg>, so size and colour (currentColor) stay under our control.
const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

const PHOSPHOR = {
  edit: pencilSimple,
  remove: trash,
  up: caretUp,
  down: caretDown,
  label: tag,
  check: check,
  close: x,
  undo: arrowCounterClockwise,
  filter: funnel,
  info: info,
  alert: warning,
  working: circleNotch,
  settings: gear,
  'sign-out': signOut,
  external: arrowSquareOut,
  paragraph: paragraph,
  'heading-2': textHTwo,
  'heading-3': textHThree,
  bold: textB,
  italic: textItalic,
  code: code,
  quote: quotes,
  'list-bullet': listBullets,
  'list-ordered': listNumbers,
  'code-block': codeBlock,
  link: link,
  unlink: linkBreak,
  markdown: markdownLogo,
  more: dotsThree,
  move: arrowLineRight,
  insert: arrowLineDown,
  comment: chatCircle,
}

export type IconName = keyof typeof PHOSPHOR | 'ai'

const SHAPES = Object.fromEntries(
  Object.entries(PHOSPHOR).map(([name, svg]) => [name, inner(svg)]),
) as Record<keyof typeof PHOSPHOR, string>
</script>

<script setup lang="ts">
/**
 * The icons the app uses: Phosphor, drawn inline so there is no component library, plus our own AI sparkle (no icon pack
 * has one like it). They are decoration: the button that holds one always has a name of its own (an aria-label), and an
 * icon-only button says what it does in a tooltip too.
 */
defineProps<{ name: IconName; size?: number }>()
</script>

<template>
  <svg
    v-if="name === 'ai'"
    aria-hidden="true"
    focusable="false"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path
      d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
    />
    <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
  </svg>
  <!-- eslint-disable vue/no-v-html -- fixed markup from the icon package, never user input -->
  <svg
    v-else
    aria-hidden="true"
    focusable="false"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 256 256"
    fill="currentColor"
    v-html="SHAPES[name]"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
