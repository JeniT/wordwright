<script setup lang="ts">
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Formatting your draft">
    <p class="mb-4">
      The row of buttons above your draft formats the words you have selected, or the line the
      cursor is in. Point at a button to see its name and its shortcut. On a narrow screen the
      buttons that don’t fit are under the three dots.
    </p>
    <h2 class="mb-2 font-display text-xl font-semibold">What you can use</h2>
    <ul class="mb-4 list-disc space-y-2 pl-5">
      <li>
        Paragraph, Heading 2 and Heading 3: the style of the line. The title is separate, so there
        is no Heading 1.
      </li>
      <li>Bold, italic and inline code, and a link (you type its address in a window).</li>
      <li>A quote, a bulleted list, a numbered list and a code block.</li>
    </ul>
    <p class="mb-6">
      That is all of it, on purpose: your draft is saved as Markdown, plain text that any other
      editor opens, so only formatting Markdown can hold is offered. Underline, colours and sizes
      are not.
    </p>
    <h2 class="mb-2 font-display text-xl font-semibold">Shortcuts</h2>
    <p class="mb-2">Use Ctrl on Windows and Linux, and ⌘ on a Mac.</p>
    <ul class="mb-6 list-disc space-y-1 pl-5">
      <li>Bold: Ctrl+B. Italic: Ctrl+I. Inline code: Ctrl+E.</li>
      <li>Heading 2: Ctrl+Alt+2. Heading 3: Ctrl+Alt+3. Paragraph: Ctrl+Alt+0.</li>
      <li>Quote: Ctrl+Shift+B. Bulleted list: Ctrl+Shift+8. Numbered list: Ctrl+Shift+7.</li>
      <li>Code block: Ctrl+Alt+C.</li>
    </ul>
    <h2 class="mb-2 font-display text-xl font-semibold">Editing the Markdown</h2>
    <p class="mb-2">
      The last button, Edit as Markdown, swaps the draft for the Markdown itself in a plain text
      box, and back again. Your choice is remembered in this browser. While you are in the box:
    </p>
    <ul class="list-disc space-y-2 pl-5">
      <li>
        Comments from a critique can’t be shown, because they sit on the formatted paragraphs. They
        are kept, and come back when you switch back.
      </li>
      <li>
        Rephrase works on the Markdown you have selected, symbols included, and notes and links from
        the side bar go in at the cursor.
      </li>
    </ul>
  </HelpPage>
</template>
