import js from '@eslint/js';
import globals from 'globals';

// ESLint's core scope analysis does not count a component referenced only from
// JSX as used. This local rule marks those references, so `no-unused-vars`
// reports real leftovers instead of every component in the file.
const jsxUsesVars = {
  meta: {name: 'local/jsx-uses-vars', schema: [], type: 'problem'},
  create(context) {
    return {
      JSXIdentifier(node) {
        if (node.name === 'this') return;
        let scope = context.sourceCode.getScope(node);
        while (scope) {
          const variable = scope.set.get(node.name);
          if (variable) { variable.eslintUsed = true; return; }
          scope = scope.upper;
        }
      },
    };
  },
};

export default [
  {ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**']},
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: {local: {rules: {'jsx-uses-vars': jsxUsesVars}}},
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {...globals.browser, ...globals.node},
      parserOptions: {ecmaFeatures: {jsx: true}},
    },
    rules: {
      'local/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      'no-undef': 'error',
      'no-empty': ['error', {allowEmptyCatch: true}],
      'no-console': ['warn', {allow: ['warn', 'error']}],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.{js,jsx}', 'e2e/**/*.js'],
    languageOptions: {globals: {...globals.browser, ...globals.node, ...globals.vitest}},
  },
  {
    files: ['vite.config.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {globals: {...globals.node}},
  },
];
