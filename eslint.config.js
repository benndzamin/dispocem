import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Obrazac "useEffect(() => { fetchX() }, [])" je svjesno korišten kroz
      // cijeli projekat - upozorenje umjesto greške dok se ne refaktoriše.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
