# Icons: Phosphor bold, plus our own AI sparkle

- **Phosphor (`@phosphor-icons/core`, MIT) in the bold weight** replaced the 33 hand-drawn outline icons. We tried Font Awesome
  Free first: its solid icons were heavier than Ember's calm look, it has no heading-level or code-block icons, and its
  licence (CC BY 4.0) would need an attribution page. Phosphor has all but one of what we need, and MIT asks only that the
  licence travel with the code (it does, in `node_modules` and the package's own `LICENSE`).
- **Each SVG is imported by name as raw text** and drawn in `Icon.vue`'s own `<svg>`, so only the icons we use are bundled and
  there is no component library. The markup is fixed package content, never user input, which is why `v-html` is acceptable there.
- **The AI sparkle stays our own drawing**, because no pack has one like it. Its stroke width matches Phosphor bold.
