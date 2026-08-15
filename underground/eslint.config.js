// Minimal flat config: catches the two mistakes that actually break a
// page — a name that does not exist, and an import nobody uses.
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['dist/**', '../underground-dist/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^[A-Z_]' }],
    },
  },
]
