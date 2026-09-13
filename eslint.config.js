import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'e2e/**',
      '*.config.*',
      '*.setup.*',
      'electron/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: '18.3' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': 'off',
      'no-inner-declarations': 'off',
      'no-unused-expressions': 'off',
      'no-constant-condition': 'off',
      'no-unused-vars': 'off',
      'ban-ts-comment': 'off',
      'no-control-regex': 'off',
    },
  }
);
