import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'artifacts/**', 'test-results/**', 'playwright-report/**', 'mv3-reports/**'] },
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: {
      process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly', structuredClone: 'readonly',
    } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['test-extensions/**/*.js', 'examples/**/background.js', 'examples/**/popup.js'],
    languageOptions: { globals: { chrome: 'readonly', crypto: 'readonly', document: 'readonly' } } },
  { files: ['**/*.mjs', 'test-extensions/**/*.js', 'examples/**/*.js'], rules: { 'no-undef': 'error' } },
  { files: ['examples/**/tests/**/*.mjs'], languageOptions: { globals: { chrome: 'readonly' } } },
);
