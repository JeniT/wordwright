<script setup lang="ts">
/**
 * The Wordwright mark: a flame whose tip is a split pen nib. It names the product and nothing else (never a
 * publication, never decoration), so it only appears in the page headers; see "The mark" in docs/design.md.
 * Drawn inline, in the `accent` role, because people can pin Light or Dark whatever their system says, and an
 * <img> of the SVG file could not follow that. The path is `docs/design-concepts/icon/export/wordwright-mark.svg`.
 * It is decoration: the link that holds it always carries the name "Wordwright" as text.
 */
const props = withDefaults(defineProps<{ height?: number }>(), { height: 36 })
// The drawing is 74.6 wide by 109.2 tall.
const width = (props.height * 74.6) / 109.2
</script>

<template>
  <svg
    class="brand-mark shrink-0 text-accent"
    aria-hidden="true"
    focusable="false"
    :width="width"
    :height="height"
    viewBox="17.6 151.3 74.6 109.2"
  >
    <path
      fill="currentColor"
      d="m 51.210261,157.11819 c 5.287843,7.56324 8.814802,13.2251 11.164743,17.33679 6.294672,11.01378 10.385296,25.04485 10.632943,36.82256 0.02071,0.98519 -1.205883,28.1997 -15.953548,28.19983 -6.865216,2.3e-4 -12.430711,-5.56503 -12.430766,-12.43025 5.5e-5,-6.86522 5.56555,-12.43048 12.430766,-12.43025 4.147185,6e-5 6.16473,0.7276 7.78247,2.29599 7.866596,-9.56725 -3.376434,-34.58509 -6.079215,-40.751 -4.830259,-11.01937 -6.072204,-13.64909 -8.68868,-18.77247 -1.472325,-2.88299 -2.225491,-2.62149 -2.042431,0.60926 1.819741,32.11584 -25.790525,46.0386 -28.215349,64.65339 -2.55192,19.59048 16.01547,35.77146 35.77146,35.77146 19.755985,0 34.561483,-16.01547 34.561483,-35.77146 0,-18.05537 -17.947842,-52.76167 -37.303657,-67.24662 -2.774615,-2.07639 -3.617708,-1.12994 -1.630219,1.71277 z"
    />
  </svg>
</template>
