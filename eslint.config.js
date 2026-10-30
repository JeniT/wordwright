import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import { readFileSync } from 'node:fs'

/**
 * .gitignore as ESLint ignore globs, so nothing git ignores (build output, e2e data) is linted and the two lists can't
 * drift apart. A name with no slash but a trailing one matches at any depth, as in git; `!` lines stay exceptions.
 */
const gitignored = readFileSync(new URL('.gitignore', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const negated = line.startsWith('!')
    const pattern = line.replace(/^!/, '').replace(/\/$/, '')
    const anchored = pattern.includes('/') ? pattern.replace(/^\//, '') : `**/${pattern}`
    return [negated ? `!${anchored}` : anchored, negated ? `!${anchored}/**` : `${anchored}/**`]
  })
  .flat()

export default tseslint.config(
  {
    ignores: [...gitignored, '.worktrees/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
  // A spec file covers one flow; split by flow before it passes 800 lines (#385).
  {
    files: ['apps/web/e2e/**/*.spec.ts'],
    rules: { 'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }] },
  },
  // Query keys come from lib/queries.ts, so a typo or renamed root can't silently stop a page refreshing (#387).
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    ignores: ['apps/web/src/lib/queries.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Property[key.name='queryKey']:not([value.callee.object.name='queryKeys']):not([value.callee.name='computed'])",
          message: 'Use a key from queryKeys in lib/queries.ts (refresh with invalidateRoots).',
        },
        {
          selector:
            "Property[key.name='queryKey'] > CallExpression[callee.name='computed'] > ArrowFunctionExpression > :matches(ArrayExpression, Identifier, Literal)",
          message: 'Use a key from queryKeys in lib/queries.ts (refresh with invalidateRoots).',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(setQueryData|getQueryData|invalidateQueries|removeQueries|cancelQueries)$/] > ArrayExpression.arguments:first-child',
          message: 'Use a key from queryKeys in lib/queries.ts (refresh with invalidateRoots).',
        },
      ],
    },
  },
  // A test may define small host components around the one it tests.
  {
    files: ['**/*.test.ts'],
    rules: { 'vue/one-component-per-file': 'off' },
  },
  // Prettier owns formatting.
  {
    files: ['**/*.vue'],
    rules: {
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
)
