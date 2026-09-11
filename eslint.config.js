import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // El código actual usa efectos para cargar datos y sincronizar formularios.
      // React 19 los marca con reglas de compilador muy estrictas; mantenemos
      // exhaustiveness y las reglas de hooks, pero no bloqueamos el lint por esto.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      // Los contextos exportan su hook junto al Provider. Es el patrón usado en
      // todo el repo y no afecta al build de producción.
      'react-refresh/only-export-components': 'off',
    },
  },
])
