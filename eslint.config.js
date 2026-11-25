import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // All text renders as plain text (plan section 4, browser safety).
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Render text only. No raw HTML.' },
        { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Render text only. No raw HTML.' },
      ],
    },
  },
  {
    // Live mode: the API key must stay in page memory. No storage and no logs where the key can pass.
    files: ['src/App.tsx', 'src/agent/**', 'src/tools/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Never store the API key or chat. Page memory only.' },
        { name: 'sessionStorage', message: 'Never store the API key or chat. Page memory only.' },
        { name: 'indexedDB', message: 'Never store the API key or chat. Page memory only.' },
      ],
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'window', property: 'sessionStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'window', property: 'indexedDB', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'globalThis', property: 'localStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'globalThis', property: 'sessionStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'globalThis', property: 'indexedDB', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'self', property: 'localStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'self', property: 'sessionStorage', message: 'Never store the API key or chat. Page memory only.' },
        { object: 'self', property: 'indexedDB', message: 'Never store the API key or chat. Page memory only.' },
      ],
    },
  },
);
