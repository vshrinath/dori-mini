// Catches undefined-reference bugs (leftover code from a refactor that
// references something renamed/removed elsewhere) before they ship as a
// runtime crash -- the LibraryView.jsx incident (2026-08-31) this exists to
// prevent. Deliberately minimal: no-undef only, no react-plugin JSX-usage
// tracking, no style rules -- see AGENTS.md for why the scope stays narrow.
export default [
  {
    files: ['src/**/*.jsx', 'src/**/*.js', 'main.js', 'preload.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        crypto: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
